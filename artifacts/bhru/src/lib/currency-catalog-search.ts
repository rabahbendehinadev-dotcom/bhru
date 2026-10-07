/** Catalog metadata arrives from the canonical server catalog; no frontend currency list. */
export interface CatalogCurrency {
 code: string;
 name: string;
 symbol: string;
 decimals: number;
 active: boolean;
 selectable: boolean;
 countries: readonly string[];
}
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
export function searchCurrencyCatalog(
 catalog: readonly CatalogCurrency[], configuredCodes: readonly string[], query: string,
): CatalogCurrency[] {
 const configured = new Set(configuredCodes), search = fold(query.trim());
 return catalog.filter(c => c.active && c.selectable && !configured.has(c.code) &&
  (!search || fold(`${c.code} ${c.name} ${c.symbol} ${c.countries.join(' ')}`).includes(search)));
}
