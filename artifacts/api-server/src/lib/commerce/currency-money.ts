export interface StoreCurrency {
  code: string; name: string; prefix: string; suffix: string; number_format: string;
  rate: string; decimals: number; enabled: boolean; client_default: boolean; is_base?: boolean; rate_configured?: boolean;
}
export const currencyCatalog = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'currency' });
  return Intl.supportedValuesOf('currency').map(code => ({
    code, name: names.of(code) || code,
    decimals: new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits!,
  }));
})();
export const MAX_MINOR = 9223372036854775807n;
export const USD_SCALE = 12;
export const USD_FACTOR = 1000000000000n;
export const RATE_FACTOR = 1000000n;
export const MAX_USD_UNITS = 9999999999990000000000n;
export function parseUsd(value: string): bigint {
  if (!/^\d{1,10}(?:\.\d{1,12})?$/.test(value)) throw new RangeError('Use a USD amount with at most 12 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole!) * USD_FACTOR + BigInt(fraction.padEnd(USD_SCALE, '0'));
  if (units > MAX_USD_UNITS) throw new RangeError('USD amount exceeds the safe price limit.');
  return units;
}
export function usdCents(units: string | bigint): bigint {
  return (BigInt(units) + 5000000000n) / 10000000000n;
}
export function rateUnits(value: string): bigint {
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(value)) throw new RangeError('Invalid six-decimal rate.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * RATE_FACTOR + BigInt(fraction.padEnd(6, '0'));
}
export function convertMinor(baseMinor: string | bigint, currency: StoreCurrency, canonicalScale = 2): bigint {
  const rate = rateUnits(currency.rate);
  const numerator = BigInt(baseMinor) * rate * (10n ** BigInt(currency.decimals));
  const denominator = (10n ** BigInt(canonicalScale)) * RATE_FACTOR;
  const result = (numerator + denominator / 2n) / denominator; // Half-up, once at unit-price boundary.
  if (result < 0n || result > MAX_MINOR) throw new RangeError('Converted amount exceeds the safe money limit.');
  return result;
}
export function formatCurrencyMinor(minor: string | bigint, currency: StoreCurrency): string {
  const scale = 10n ** BigInt(currency.decimals), value = BigInt(minor);
  const separators: Record<string, [string, string]> = {
    '1,234.56': [',', '.'], '1.234,56': ['.', ','], '1 234,56': [' ', ','], '1234.56': ['', '.'],
  };
  const [group, decimal] = separators[currency.number_format] ?? separators['1,234.56']!;
  const whole = (value / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const fraction = currency.decimals ? decimal + (value % scale).toString().padStart(currency.decimals, '0') : '';
  return currency.prefix + whole + fraction + (currency.suffix ? ' ' + currency.suffix : '');
}
