// Each language carries two codes:
//  - `speech`: what the browser's speech recognizer expects (BCP-47 with region)
//  - `translate`: what the translation API expects
// Mirai keeps a similar table (enUS, jaJP, zhCN …) and derives both from it.
export const LANGUAGES = [
  { id: 'ja', label: '日本語', english: 'Japanese', speech: 'ja-JP', translate: 'ja' },
  { id: 'en', label: 'English', english: 'English', speech: 'en-US', translate: 'en' },
  { id: 'th', label: 'ไทย', english: 'Thai', speech: 'th-TH', translate: 'th' },
  { id: 'zh', label: '中文 (简体)', english: 'Chinese (Simplified)', speech: 'zh-CN', translate: 'zh-CN' },
  { id: 'ko', label: '한국어', english: 'Korean', speech: 'ko-KR', translate: 'ko' },
  { id: 'vi', label: 'Tiếng Việt', english: 'Vietnamese', speech: 'vi-VN', translate: 'vi' },
  { id: 'id', label: 'Bahasa Indonesia', english: 'Indonesian', speech: 'id-ID', translate: 'id' },
  { id: 'es', label: 'Español', english: 'Spanish', speech: 'es-ES', translate: 'es' },
  { id: 'fr', label: 'Français', english: 'French', speech: 'fr-FR', translate: 'fr' },
  { id: 'pt', label: 'Português (BR)', english: 'Portuguese (Brazil)', speech: 'pt-BR', translate: 'pt-BR' },
];

const BY_ID = Object.fromEntries(LANGUAGES.map((language) => [language.id, language]));

export const getLanguage = (id) => BY_ID[id] ?? LANGUAGES[0];
