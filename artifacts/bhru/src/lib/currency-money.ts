/** Pure fixed-decimal helpers. USD inputs here are integer units at scale 12, never decimal dollars. */
import { formatCurrencyPresentation, parseNumberFormat, SUPPORTED_NUMBER_FORMATS, type CurrencyPresentation } from '@workspace/currency-presentation';
export { parseNumberFormat, SUPPORTED_NUMBER_FORMATS };
export interface PanelCurrency { code:string;name:string;prefix:string;suffix:string;number_format:string;rate:string;decimals:number;enabled:boolean;client_default:boolean;is_base?:boolean;rate_configured?:boolean;presentation_version?:number }
export const NUMBER_FORMAT_ERROR = 'Choose a supported number format.';
export const isSupportedNumberFormat = (value: string) => SUPPORTED_NUMBER_FORMATS.some(format => format === value);
export function canSaveNumberFormat(value: string, savedValue?: string): boolean {
 return isSupportedNumberFormat(value) || (value === savedValue && parseNumberFormat(value) !== null);
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
export function formatScaled(value:bigint,scale:number,row:CurrencyPresentation,withCode?:string,legacyAffixes=false):string {
 return formatCurrencyPresentation(value,scale,row,parseNumberFormat(row.number_format)??[',','.'],withCode,legacyAffixes);
}
export function unitsToInput(value:string|null|undefined):string {
 if(value==null||value==='')return '';
 const units=BigInt(value),whole=(units/1000000000000n).toString();
 const fraction=(units%1000000000000n).toString().padStart(12,'0').replace(/0+$/,'');
 return `${whole}.${fraction.padEnd(2,'0')}`;
}
