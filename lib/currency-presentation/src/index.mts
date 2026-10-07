/** Presentation only: accepts already-denominated integer units, never exchange rates. */
export interface CurrencyPresentation {
 code?: string;
 prefix: string;
 suffix: string;
 number_format: string;
 decimals: number;
}
export const SUPPORTED_NUMBER_FORMATS = ['1000.99', '1,000.99', '1,000,99', '1,000'] as const;

/** Self-contained so the same parser can be embedded in the CSP-protected storefront. */
export function parseNumberFormat(value: string): [string, string] | null {
 const sample = value.trim();
 if (sample === '1,000,99') return [',', ','];
 if (sample === '1,000') return [',', '.']; // Grouping sample; precision remains currency-owned.
 if (sample.length > 24) return null;
 const grouped = /^\d{1,3}([., ])\d{3}([.,])\d{2}$/.exec(sample);
 if (grouped) return grouped[1] !== grouped[2] ? [grouped[1]!, grouped[2]!] : null;
 const plain = /^\d{4,18}([.,])\d{2}$/.exec(sample);
 return plain ? ['', plain[1]!] : null;
}

/**
 * One presentation implementation for panel, previews, server and public JS.
 * Separators are explicit so serializing this function introduces no free dependencies.
 * legacyAffixes preserves the presentation of receipts made before this formatter.
 */
export function formatCurrencyPresentation(
 value: bigint, scale: number, currency: CurrencyPresentation,
 separators: readonly [string, string], withCode?: string, legacyAffixes = false,
): string {
 const d = currency.decimals, neg = value < 0n, abs = neg ? -value : value;
 const divisor = 10n ** BigInt(Math.max(0, scale - d));
 const rounded = scale >= d ? (abs + divisor / 2n) / divisor : abs * 10n ** BigInt(d - scale);
 const digits = rounded.toString().padStart(d + 1, '0');
 const whole = d ? digits.slice(0, -d) : digits, fraction = d ? digits.slice(-d) : '';
 const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separators[0]) +
  (fraction ? separators[1] + fraction : '');
 const prefix = legacyAffixes ? currency.prefix : currency.prefix.trim();
 const suffix = legacyAffixes ? currency.suffix : currency.suffix.trim();
 const prefixGap = !legacyAffixes && prefix && /\p{L}/u.test(prefix) && !/\p{Sc}$/u.test(prefix) ? ' ' : '';
 const code = withCode ?? (legacyAffixes ? undefined : currency.code);
 return `${neg ? '-' : ''}${prefix}${prefixGap}${body}${suffix ? ` ${suffix}` : ''}${code && !prefix && !suffix ? ` ${code}` : ''}`;
}
