/** Pure fixed-decimal helpers. USD inputs here are integer units at scale 12, never decimal dollars. */
export interface PanelCurrency { code:string;name:string;prefix:string;suffix:string;number_format:string;rate:string;decimals:number;enabled:boolean;client_default:boolean;is_base?:boolean;rate_configured?:boolean }
export const NUMBER_FORMAT_ERROR = 'Use a number sample such as 1,000.99 or 1000,99, with different grouping and decimal separators.';
/** A numeric sample selects separators, not the currency's decimal precision. */
export function parseNumberFormat(value: string): [string, string] | null {
 const sample = value.trim();
 if (sample.length > 24) return null;
 const grouped = /^\d{1,3}([., ])\d{3}([.,])\d{2}$/.exec(sample);
 if (grouped) return grouped[1] !== grouped[2] ? [grouped[1]!, grouped[2]!] : null;
 const plain = /^\d{4,18}([.,])\d{2}$/.exec(sample);
 return plain ? ['', plain[1]!] : null;
}
export function normalizeCurrencyRate(value: string): string {
 const input = value.trim(), units = rateScaled(input);
 if (units <= 0n || units > 999999999000000n) throw new RangeError('Enter a positive rate up to 999999999 with up to 6 decimal places.');
 const [whole, fraction = ''] = input.split('.');
 return `${BigInt(whole!).toString()}.${fraction.padEnd(6, '0')}`;
}
export function rateScaled(rate:string):bigint {
 if(!/^\d{1,9}(?:\.\d{1,6})?$/.test(rate))throw new RangeError('Invalid currency rate');
 const [i,f='']=rate.split('.');
 return BigInt(i!)*1000000n+BigInt(f.padEnd(6,'0'));
}
export function parseUnits(value:string|null|undefined):bigint|null {
 return value!=null&&/^-?\d+$/.test(value)?BigInt(value):null;
}
export function formatScaled(value:bigint,scale:number,row:Pick<PanelCurrency,'prefix'|'suffix'|'number_format'|'decimals'>,withCode?:string):string {
 const d=row.decimals,neg=value<0n,abs=neg?-value:value;
 const divisor=10n**BigInt(Math.max(0,scale-d));
 const rounded=scale>=d?(abs+divisor/2n)/divisor:abs*10n**BigInt(d-scale);
 const digits=rounded.toString().padStart(d+1,'0'),whole=d?digits.slice(0,-d):digits,fraction=d?digits.slice(-d):'';
 const [group,decimal]=parseNumberFormat(row.number_format)??[',','.'];
 const body=whole.replace(/\B(?=(\d{3})+(?!\d))/g,group)+(fraction?decimal+fraction:'');
 return `${neg?'-':''}${row.prefix}${body}${row.suffix?` ${row.suffix}`:''}${withCode&&!row.prefix&&!row.suffix?` ${withCode}`:''}`;
}
export function unitsToInput(value:string|null|undefined):string {
 if(value==null||value==='')return '';
 const units=BigInt(value),whole=(units/1000000000000n).toString();
 const fraction=(units%1000000000000n).toString().padStart(12,'0').replace(/0+$/,'');
 return `${whole}.${fraction.padEnd(2,'0')}`;
}
