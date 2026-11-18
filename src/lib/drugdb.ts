// Brand search. The public repo ships without the brand database, so the
// search returns nothing; drop a SQLite file in src/data and restore the lookup to use it.
export type Brand = { name: string; contains: string }

export async function searchBrands(_q: string, _limit = 25): Promise<Brand[]> {
  return []
}
