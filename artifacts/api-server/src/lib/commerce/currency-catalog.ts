import snapshot from './currency-catalog-data.json' with { type: 'json' };

export interface CurrencyCatalogEntry {
 readonly code: string;
 readonly name: string;
 readonly symbol: string;
 readonly decimals: number | null;
 readonly active: boolean;
 readonly selectable: boolean;
 readonly fund: boolean;
 readonly countries: readonly string[];
}
export type SelectableCurrency = CurrencyCatalogEntry & { readonly decimals: number };

/** Pinned ISO metadata, independent of runtime ICU and of tenant rates/settings. */
export const currencyCatalogSource = Object.freeze({
 url: snapshot.source, published: snapshot.published, xml_sha256: snapshot.xml_sha256,
});
export const currencyMetadata: readonly CurrencyCatalogEntry[] = Object.freeze(
 snapshot.currencies.map(entry => Object.freeze({ ...entry, countries: Object.freeze(entry.countries) })),
);
export const currencyCatalog: readonly SelectableCurrency[] = Object.freeze(
 currencyMetadata.filter((entry): entry is SelectableCurrency =>
  entry.active && entry.selectable && entry.decimals !== null),
);
