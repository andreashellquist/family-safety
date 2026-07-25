import React, { createContext, useContext, useEffect, useState } from 'react';

const translations = {
  'Checking your secure session…': 'Kontrollerar din säkra session…',
  'Loading your family…': 'Laddar din familj…',
  'FAMILY SPACE UNAVAILABLE': 'FAMILJEUTRYMMET ÄR INTE TILLGÄNGLIGT',
  'We couldn’t load your family.': 'Vi kunde inte läsa in din familj.',
  'Try again': 'Försök igen', 'Sign out': 'Logga ut', WELCOME: 'VÄLKOMMEN',
  'Start your family space': 'Skapa familjeutrymmet', 'Join your family space': 'Gå med i familjeutrymmet',
  'Create family': 'Skapa familj', 'Use invite code': 'Använd inbjudningskod',
  'Your name': 'Ditt namn', 'Family name': 'Familjens namn', 'Invite code': 'Inbjudningskod',
  'Saving…': 'Sparar…', 'Join family': 'Gå med i familjen',
  'Set up shared agreements and requests. You’ll be the first parent; dashboard data stays in safe mock mode for now.': 'Skapa gemensamma överenskommelser och förfrågningar. Du blir den första föräldern; instrumentpanelen använder fortfarande säkra exempeldata.',
  'Use the one-time invite code shared by your parent. You’ll see every rule that affects you.': 'Använd engångskoden du fått av din förälder. Du ser varje regel som påverkar dig.',
  TODAY: 'I DAG', 'Our pact': 'Vår överenskommelse', Requests: 'Förfrågningar', 'Weekly reflection': 'Veckoreflektion', 'Family settings': 'Familjeinställningar',
  'Family space': 'Familjeutrymme', 'Help & support': 'Hjälp och support', 'Private by design': 'Privat från början', 'We never show browsing history.': 'Vi visar aldrig webbhistorik.',
  'Preview parent': 'Förhandsvisa förälder', 'Preview child': 'Förhandsvisa barn',
  'Demo preview:': 'Demoförhandsvisning:',
  'agreements, requests, device status, and notifications below are mock data. Family setup and restriction proposals are the only live flows.': 'överenskommelser, förfrågningar, enhetsstatus och notiser nedan är exempeldata. Familjeskapande och regel­förslag är de enda aktiva flödena.',
  'See reflection →': 'Se reflektion →', 'TODAY’S AGREEMENT': 'DAGENS ÖVERENSKOMMELSE',
  'After-school time': 'Tid efter skolan', 'Active': 'Aktiv', 'min left': 'min kvar',
  'Time ends at': 'Tiden slutar', 'Applies to selected fun apps': 'Gäller valda underhållningsappar', 'View agreement': 'Visa överenskommelse',
  'WINDOWS COMPUTER': 'WINDOWS-DATOR', 'Ready for handover': 'Klar för avslut', 'Screen is locked': 'Skärmen är låst',
  'Sound will mute and screen will lock at time end.': 'Ljudet stängs av och skärmen låses när tiden är slut.',
  'Audio is muted until access resumes.': 'Ljudet är avstängt tills åtkomsten återupptas.',
  'Enforcement promise': 'Enforceringslöfte', 'Mute audio + lock screen': 'Stäng av ljud + lås skärmen',
  'FAMILY SETTINGS': 'FAMILJEINSTÄLLNINGAR', 'Transparent restrictions': 'Tydliga begränsningar',
  'Invite a child': 'Bjud in ett barn', 'Create invite code': 'Skapa inbjudningskod',
  'Pair a Windows computer': 'Koppla en Windows-dator', 'Family member': 'Familjemedlem', 'Computer name': 'Datornamn',
  'Create Windows pairing code': 'Skapa Windows-kopplingskod', 'Propose an app or website rule': 'Föreslå en app- eller webbregel',
  'Who is this for': 'Vem gäller detta', 'Rule title': 'Regelns namn', 'Applies to': 'Gäller', 'An app': 'En app', 'An app category': 'En appkategori', 'A website domain': 'En webbdomän',
  'Domain only': 'Endast domän', Name: 'Namn', Agreement: 'Överenskommelse',
  'Set a time limit': 'Sätt en tidsgräns', 'Pause access': 'Pausa åtkomst', 'Allow access': 'Tillåt åtkomst', Minutes: 'Minuter',
  'Propose transparent rule': 'Föreslå tydlig regel', 'Your family space': 'Ditt familjeutrymme',
  'Your proposed rules': 'Dina föreslagna regler', 'Rules for you': 'Regler för dig', 'Acknowledge': 'Bekräfta',
  'No restriction proposals yet.': 'Inga regelförslag ännu.',
  'Policy proposed. The affected family member can review it before it becomes active.': 'Regeln är föreslagen. Berörd familjemedlem kan läsa den innan den aktiveras.',
  'Policy acknowledged and marked active.': 'Regeln är bekräftad och markerad som aktiv.',
  'SHARED AGREEMENTS': 'GEMENSAMMA ÖVERENSKOMMELSER', 'Our family pact': 'Vår familjeöverenskommelse',
  'Propose a change': 'Föreslå en ändring', 'CONVERSATIONS, NOT COMMANDS': 'SAMTAL, INTE KOMMANDON',
  '+ Request a change': '+ Be om en ändring', 'LOOK BACK TOGETHER': 'SE TILLBAKA TILLSAMMANS',
  'Choose week': 'Välj vecka', 'Write a thought →': 'Skriv en tanke →',
  'ASK FOR A CHANGE': 'BE OM EN ÄNDRING', 'What would help today?': 'Vad skulle hjälpa i dag?',
  'Send request': 'Skicka förfrågan', 'Request sent': 'Förfrågan skickad',
  'Your parent will see it right away.': 'Din förälder ser den direkt.'
};

const LanguageContext = createContext({ language: 'en', setLanguage: () => {} });

function localizeDocument(language) {
  const reverse = Object.fromEntries(Object.entries(translations).map(([english, swedish]) => [swedish, english]));
  const lookup = language === 'sv' ? translations : reverse;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest('script, style') || !node.nodeValue?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => { const replacement = lookup[node.nodeValue.trim()]; if (replacement) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), replacement); });
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('pact-language') || (navigator.language.startsWith('sv') ? 'sv' : 'en'));
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('pact-language', language);
    localizeDocument(language);
    const observer = new MutationObserver(() => localizeDocument(language));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useContext(LanguageContext);
  return <button className="language-switch" type="button" onClick={() => setLanguage(language === 'sv' ? 'en' : 'sv')} aria-label="Change language">{language === 'sv' ? 'English' : 'Svenska'}</button>;
}
