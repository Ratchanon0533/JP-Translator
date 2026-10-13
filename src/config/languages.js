// Each language carries two codes:
//  - `speech`: what the browser's speech recognizer expects (BCP-47 with region)
//  - `translate`: what the translation API expects
// Mirai keeps a similar table (enUS, jaJP, zhCN …) and derives both from it.
export const LANGUAGES = [
  { id: 'en', label: 'English', english: 'English', speech: 'en-US', translate: 'en' },
  { id: 'ja', label: '日本語', english: 'Japanese', speech: 'ja-JP', translate: 'ja' },
  { id: 'th', label: 'ไทย', english: 'Thai', speech: 'th-TH', translate: 'th' },
];

const BY_ID = Object.fromEntries(LANGUAGES.map((language) => [language.id, language]));

export const isLanguage = (id) => id in BY_ID;

export const getLanguage = (id) => BY_ID[id] ?? LANGUAGES[0];
