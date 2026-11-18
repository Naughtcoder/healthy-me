// Dish search that forgives how people say things: kobi, gobi and gobhi are all cauliflower, fry also finds roast and tawa.
const ALTS: Record<string, string[]> = {
  kobi: ['cauliflower', 'cabbage'], gobi: ['cauliflower'], gobhi: ['cauliflower'], phool: ['cauliflower'], phoolgobhi: ['cauliflower'],
  palak: ['spinach'], saag: ['spinach'], sag: ['spinach'], patta: ['cabbage'], band: ['cabbage'], bhindi: ['okra'], lauki: ['bottle gourd', 'white pumpkin'],
  beans: ['french beans'], gajar: ['carrot'], pyaz: ['onion'], pyaaz: ['onion'], mooli: ['radish'], chukandar: ['beetroot'], methi: ['fenugreek'],
  fry: ['fry', 'roast', 'tawa', 'stir', 'sauté', 'saute', 'poriyal', 'thoran'], sabzi: ['sabzi', 'sabji', 'subji', 'curry', 'masala'], sabji: ['sabzi', 'subji'], subji: ['sabzi', 'sabji'],
}
/** Every word the person typed, each with the other words that count as a match. */
export const expandQuery = (q: string): string[][] =>
  q.trim().toLowerCase().split(/\s+/).filter(Boolean).map(w => [w, ...(ALTS[w] ?? [])])
/** True when every typed word (or one of its alternatives) is somewhere in the text. */
export const matches = (text: string, q: string): boolean => {
  const t = text.toLowerCase()
  return expandQuery(q).every(alts => alts.some(a => t.includes(a)))
}

/** Lower is better: 0 the name starts with the typed text, 1 every typed word starts a word of the name, 2 the words are in the name, 3 only a related name (gobi for cauliflower) matches. */
export function rank(name: string, q: string): number {
  const n = name.toLowerCase(), t = q.trim().toLowerCase()
  if (!t) return 0
  if (n.startsWith(t)) return 0
  const words = t.split(/\s+/)
  const starts = (w: string) => n.split(/[^a-z0-9]+/).some(x => x.startsWith(w))
  if (words.every(starts)) return 1
  if (words.every(w => n.includes(w))) return 2
  return 3
}
