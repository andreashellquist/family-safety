import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
// Fly's HTTP service routes to 8080. Local development can still override this
// with PORT=8787 (or any free port) without changing production configuration.
const port = Number(process.env.PORT || 8080);
if (!databaseUrl) throw new Error('DATABASE_URL is required for the private device API.');

const pool = new Pool({ connectionString: databaseUrl });
const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (request) => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
};
const bearer = (request) => request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1] ?? null;
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const enrollmentAttempts = new Map();
const allowEnrollmentAttempt = (request) => {
  const address = request.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const entry = enrollmentAttempts.get(address);
  if (!entry || entry.expiresAt <= now) {
    enrollmentAttempts.set(address, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count += 1;
  return true;
};

async function enroll({ pairingCode, installationId, windowsAccountSid }) {
  if (typeof pairingCode !== 'string' || !/^[A-F0-9]{24}$/i.test(pairingCode) || !isUuid(installationId) || typeof windowsAccountSid !== 'string' || !/^S-1-5-21-(?:\d+-){2}\d+-\d+$/.test(windowsAccountSid)) {
    return { status: 400, body: { error: 'A valid pairing code, installation ID, and Windows account are required.' } };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const pairing = await client.query(`
      select code.id, code.family_id, code.member_id, code.device_label
      from public.device_pairing_codes code
      where code.code_hash = $1 and code.claimed_at is null and code.expires_at > now()
      for update
    `, [digest(pairingCode)]);
    if (pairing.rowCount !== 1) {
      await client.query('rollback');
      return { status: 401, body: { error: 'The pairing code is invalid, expired, or already used.' } };
    }
    const code = pairing.rows[0];
    const existing = await client.query('select id from public.devices where installation_id = $1 for update', [installationId]);
    if (existing.rowCount) {
      await client.query('rollback');
      return { status: 409, body: { error: 'This installation is already enrolled.' } };
    }
    const device = await client.query(`
      insert into public.devices (family_id, member_id, platform, display_name, installation_id, windows_account_sid, enforcement_mode, last_seen_at)
      values ($1, $2, 'windows', $3, $4, $5, 'observe_only', now()) returning id
    `, [code.family_id, code.member_id, code.device_label, installationId, windowsAccountSid]);
    const token = randomBytes(32).toString('base64url');
    await client.query('insert into public.device_credentials (device_id, token_hash) values ($1, $2)', [device.rows[0].id, digest(token)]);
    await client.query('update public.device_pairing_codes set claimed_at = now(), claimed_device_id = $1 where id = $2', [device.rows[0].id, code.id]);
    await client.query(`insert into public.device_agent_events (family_id, device_id, event_type) values ($1, $2, 'enrolled')`, [code.family_id, device.rows[0].id]);
    await client.query('commit');
    return { status: 201, body: { deviceId: device.rows[0].id, deviceToken: token } };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

async function authenticateDevice(deviceId, token) {
  if (!isUuid(deviceId) || !token) return null;
  const result = await pool.query(`
    select device.id, device.family_id, device.member_id
    from public.devices device
    join public.device_credentials credential on credential.device_id = device.id
    where device.id = $1 and credential.token_hash = $2 and credential.revoked_at is null
      and (credential.expires_at is null or credential.expires_at > now())
  `, [deviceId, digest(token)]);
  const device = result.rows[0] ?? null;
  if (device) await pool.query('update public.device_credentials set last_used_at = now() where device_id = $1 and token_hash = $2', [device.id, digest(token)]);
  return device;
}

async function policyFor(device) {
  const result = await pool.query(`
    select policy.id, policy.version, policy.title, policy.starts_at, policy.ends_at,
      target.target_type, target.target_value, target.action, target.allowance_minutes, target.reason, target.schedule
    from public.restriction_policies policy
    join public.restriction_targets target on target.policy_id = policy.id
    where policy.family_id = $1 and policy.member_id = $2 and policy.status = 'active'
      and (policy.starts_at is null or policy.starts_at <= now())
      and (policy.ends_at is null or policy.ends_at > now())
    order by policy.version, target.created_at
  `, [device.family_id, device.member_id]);
  const version = result.rows.reduce((highest, row) => Math.max(highest, row.version), 0);
  return {
    documentId: randomUUID(), deviceId: device.id, version,
    issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    enforcementMode: 'observe_only',
    unsupportedRules: result.rows.map((row) => ({ policyId: row.id, type: row.target_type, target: row.target_value, action: row.action, reason: 'Windows enforcement is not available in this preview client.' })),
    rules: result.rows.map((row) => ({ policyId: row.id, title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, type: row.target_type, target: row.target_value, action: row.action, allowanceMinutes: row.allowance_minutes, reason: row.reason, schedule: row.schedule }))
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      await pool.query('select 1');
      return json(response, 200, { ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/v1/device-enrollments') {
      if (!allowEnrollmentAttempt(request)) return json(response, 429, { error: 'Too many enrollment attempts. Wait ten minutes and try again.' });
      const result = await enroll(await readJson(request));
      return json(response, result.status, result.body);
    }
    const match = url.pathname.match(/^\/v1\/devices\/([0-9a-f-]+)\/(policy|heartbeat)$/i);
    if (!match) return json(response, 404, { error: 'Not found.' });
    const device = await authenticateDevice(match[1], bearer(request));
    if (!device) return json(response, 401, { error: 'Invalid device credential.' });
    if (request.method === 'GET' && match[2] === 'policy') {
      const document = await policyFor(device);
      await pool.query(`update public.devices set last_seen_at = now() where id = $1`, [device.id]);
      await pool.query(`insert into public.device_agent_events (family_id, device_id, event_type, policy_version) values ($1, $2, 'policy_delivered', $3)`, [device.family_id, device.id, document.version]);
      return json(response, 200, document);
    }
    if (request.method === 'POST' && match[2] === 'heartbeat') {
      const body = await readJson(request);
      const state = typeof body.state === 'string' && /^[a-z-]{1,48}$/.test(body.state) ? body.state : 'unknown';
      const version = Number.isInteger(body.policyVersion) && body.policyVersion >= 0 ? body.policyVersion : null;
      await pool.query(`update public.devices set last_seen_at = now() where id = $1`, [device.id]);
      await pool.query(`insert into public.device_agent_events (family_id, device_id, event_type, policy_version, enforcement_state) values ($1, $2, 'heartbeat', $3, $4)`, [device.family_id, device.id, version, state]);
      return json(response, 202, { accepted: true });
    }
    return json(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unexpected device API error');
    return json(response, 500, { error: 'Device service unavailable.' });
  }
});

server.listen(port, () => console.log(`Pact device API listening on ${port}`));
