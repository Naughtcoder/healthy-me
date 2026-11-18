// Dish and ingredient names are English or Hindi only. These are the older names (Tamil, Malayalam, Marathi and so on) that
// were renamed on 16 Nov 2026; meals saved under an old name are renamed once at start-up, and lookups accept either.
export const RENAMED: Record<string, string> = {
  "Aam thecha": "Raw mango chutney",
  "All veggie poriyal": "All veggie sabzi",
  "Amer tok": "Sour mango chutney",
  "Appam or neer dosa, 2": "Appam or rice dosa, 2",
  "Avial": "Coconut vegetable curry",
  "Avial vegetables": "Mixed vegetables",
  "Beans poriyal": "Beans sabzi",
  "Beetroot poriyal": "Beetroot sabzi",
  "Cabbage carrot ghughni": "Cabbage carrot sabzi",
  "Cabbage thoran": "Cabbage coconut sabzi",
  "Carrot and beans poriyal": "Carrot and beans sabzi",
  "Chettinad cauliflower": "Pepper masala cauliflower",
  "Kakdi masala": "Cucumber masala",
  "Manathakkali shallot fry": "Black nightshade shallot fry",
  "Mor kuzhambu": "Buttermilk curry",
  "Palong shak": "Spinach sabzi",
  "Pesarattu (sprouted moong dosa), 2": "Sprouted moong dosa, 2",
  "Puli kuzhambu": "Tamarind curry"
}
const LOWER = new Map(Object.entries(RENAMED).map(([k, v]) => [k.toLowerCase(), v]))
/** The current name for an old one; anything else comes back as it was. */
export const modernName = (name: string) => LOWER.get(name.trim().toLowerCase()) ?? name
