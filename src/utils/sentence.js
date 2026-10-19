// Speech recognition splits speech at pauses, and a short pause often falls in
// the middle of a sentence ("Japan and Thailand is" … "should never …").
// These helpers guess from the last words whether a piece of speech is a
// whole sentence, so the next piece can carry on the same line.

const isJapanese = (lang) => lang.startsWith('ja');
const isThai = (lang) => lang.startsWith('th');

// Words a sentence rarely ends on: articles, prepositions, conjunctions, helpers.
const EN_UNFINISHED = new Set(
  `a an the and or but so because if when while although though that which who whom whose where
  to of in on at for with from by about as into onto than then however therefore also just
  is are was were be been being am will would can could should shall may might must
  have has had do does did not very my your his her their our its this these those
  i we they he she what how why like really`.split(/\s+/),
);

// Particles and forms that leave a Japanese sentence open (は, が, を, …, 〜て, 〜けど).
const JA_UNFINISHED =
  /(は|が|を|に|で|と|も|の|へ|や|から|まで|より|けど|けれど|けれども|ので|のに|し|て|って|ば|たら|なら|とか|など|という|ような|みたいな|そして|でも|だから|それで)$/;
// Polite endings and sentence-final particles.
const JA_FINISHED = /(です|ます|ました|ません|でした|ましょう|ください|下さい|か|ね|よ|わ|た|だ|[。？！?!])$/;

const TH_UNFINISHED =
  /(และ|แต่|ที่|ของ|ว่า|ก็|เพราะ|ถ้า|ซึ่ง|กับ|ใน|จะ|ให้|เป็น|คือ|หรือ|แล้วก็|เมื่อ|ตอน|โดย|สำหรับ|จาก)$/;
const TH_FINISHED = /(ครับ|ค่ะ|คะ|ค่า|จ้ะ|จ้า|นะ|น่ะ|ไหม|มั้ย|หรือเปล่า|เหรอ|หรอ|สิ|ซิ|เลย|แล้ว|ด้วย|[?!.])$/;

// 'finished' | 'unfinished' | 'unknown'
export function sentenceEnd(text, lang) {
  const end = text.trim();
  if (isJapanese(lang)) {
    if (JA_UNFINISHED.test(end)) return 'unfinished';
    return JA_FINISHED.test(end) ? 'finished' : 'unknown';
  }
  if (isThai(lang)) {
    if (TH_UNFINISHED.test(end)) return 'unfinished';
    return TH_FINISHED.test(end) ? 'finished' : 'unknown';
  }
  if (/[.?!]$/.test(end)) return 'finished';
  const lastWord = end.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z']/g, '') ?? '';
  return EN_UNFINISHED.has(lastWord) ? 'unfinished' : 'unknown';
}

// Japanese is written without spaces; English and Thai put one between the pieces.
export const joinText = (a, b, lang) => (isJapanese(lang) ? `${a}${b}` : `${a} ${b}`);

// A line stops growing at about this many characters, so it stays readable.
export const maxLineLength = (lang) => (isJapanese(lang) ? 90 : 200);
