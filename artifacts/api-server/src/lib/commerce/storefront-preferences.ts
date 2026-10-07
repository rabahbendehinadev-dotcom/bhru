import type { StoreCurrency } from './currency-money';
/** Tenant-scoped presentation preferences; commercial currencies come from persisted settings. */
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

export function storefrontPreferences(baseCurrency: string, tenant: Partial<StorefrontPreferences> = {}, configured: StoreCurrency[] = []) {
  const known = new Set<string>(STOREFRONT_LANGUAGES.map(l => l[0]));
  const enabledLanguages = (tenant.enabledLanguages ?? [...known]).filter(l => known.has(l));
  if (!enabledLanguages.includes('en')) enabledLanguages.unshift('en');
  const defaultLanguage = enabledLanguages.includes(tenant.defaultLanguage ?? '') ? tenant.defaultLanguage! : 'en';
  const rows = configured.length ? configured.filter(c => c.enabled) : [{ code:baseCurrency,name:baseCurrency,prefix:'',suffix:baseCurrency,number_format:'1,234.56',rate:'1.00000',decimals:2,enabled:true,client_default:true,is_base:true }];
  const enabledCurrencies = rows.map(c => c.code);
  return {
    defaultLanguage, enabledLanguages, enabledCurrencies, baseCurrency, defaultCurrency: rows.find(c => c.client_default)?.code ?? baseCurrency,
    currencies:rows, translatedLanguages: ['en'], conversionEnabled: true,
    languages: STOREFRONT_LANGUAGES.filter(l => enabledLanguages.includes(l[0])).map(([code, name, flag]) => ({ code, name, flag, rtl: code === 'ar' || code === 'he' })),
  };
}
