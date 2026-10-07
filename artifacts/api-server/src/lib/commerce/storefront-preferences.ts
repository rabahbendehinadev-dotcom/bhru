/** Presentation preferences only. Future tenant configuration feeds this adapter, not global mutable state. */
export const STOREFRONT_LANGUAGES = [
  ['en', 'English', 'gb'], ['fr', 'French', 'fr'], ['ar', 'Arabic', 'sa'],
  ['de', 'German', 'de'], ['es', 'Spanish', 'es'], ['it', 'Italian', 'it'],
  ['pt', 'Portuguese', 'pt'], ['tr', 'Turkish', 'tr'], ['nl', 'Dutch', 'nl'],
  ['ru', 'Russian', 'ru'], ['zh', 'Chinese', 'cn'], ['vi', 'Vietnamese', 'vn'],
  ['th', 'Thai', 'th'], ['pl', 'Polish', 'pl'], ['sv', 'Swedish', 'se'],
  ['da', 'Danish', 'dk'], ['cs', 'Czech', 'cz'], ['sq', 'Albanian', 'al'],
  ['uk', 'Ukrainian', 'ua'], ['he', 'Hebrew', 'il'], ['bn', 'Bengali', 'bd'],
  ['gu', 'Gujarati', 'in'], ['kn', 'Kannada', 'in'], ['af', 'Afrikaans', 'za'],
] as const;

export interface StorefrontPreferences {
  defaultLanguage: string;
  enabledLanguages: string[];
  enabledCurrencies: string[];
}

export function storefrontPreferences(baseCurrency: string, tenant: Partial<StorefrontPreferences> = {}) {
  const known = new Set<string>(STOREFRONT_LANGUAGES.map(l => l[0]));
  const enabledLanguages = (tenant.enabledLanguages ?? [...known]).filter(l => known.has(l));
  if (!enabledLanguages.includes('en')) enabledLanguages.unshift('en');
  const defaultLanguage = enabledLanguages.includes(tenant.defaultLanguage ?? '') ? tenant.defaultLanguage! : 'en';
  const enabledCurrencies = [...new Set((tenant.enabledCurrencies ?? ['DZD', 'USD', 'EUR', 'GBP']).filter(c => /^[A-Z]{3}$/.test(c)).concat(baseCurrency))];
  return {
    defaultLanguage, enabledLanguages, enabledCurrencies, baseCurrency, defaultCurrency: baseCurrency,
    // Only English storefront copy exists today. No rates or translated-content claims.
    translatedLanguages: ['en'], conversionEnabled: false,
    languages: STOREFRONT_LANGUAGES.filter(l => enabledLanguages.includes(l[0])).map(([code, name, flag]) => ({ code, name, flag, rtl: code === 'ar' || code === 'he' })),
  };
}
