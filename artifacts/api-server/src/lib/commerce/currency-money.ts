export interface StoreCurrency {
  code: string; name: string; prefix: string; suffix: string; number_format: string;
  rate: string; decimals: number; enabled: boolean; client_default: boolean; is_base?: boolean;
}
export const currencyCatalog = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'currency' });
  return Intl.supportedValuesOf('currency').map(code => ({
    code, name: names.of(code) || code,
    decimals: new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits!,
  }));
})();
export const MAX_MINOR = 9223372036854775807n;
export function rateUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100000n + BigInt(fraction.padEnd(5, '0'));
}
export function convertMinor(baseMinor: string | bigint, currency: StoreCurrency): bigint {
  const rate = rateUnits(currency.rate);
  const numerator = BigInt(baseMinor) * rate * (10n ** BigInt(currency.decimals));
  const denominator = 100n * 100000n; // Existing product prices always use two base decimal places.
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
