// A food picked on another screen (the barcode scanner) waiting to be added to
// the meal being edited, which picks it up when it is back in front.
let pending: { name: string; grams: number | null } | null = null
export const handOff = (name: string, grams: number | null) => { pending = { name, grams } }
export const takeHandOff = () => { const p = pending; pending = null; return p }
