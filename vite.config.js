import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: '/family-safety/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        pact: fileURLToPath(new URL('./pact/index.html', import.meta.url)),
        requests: fileURLToPath(new URL('./requests/index.html', import.meta.url)),
        reflection: fileURLToPath(new URL('./reflection/index.html', import.meta.url))
      }
    }
  }
});
