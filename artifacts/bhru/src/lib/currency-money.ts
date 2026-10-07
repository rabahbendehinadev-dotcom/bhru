/** Pure fixed-decimal helpers. USD inputs here are integer units at scale 12, never decimal dollars. */
export interface PanelCurrency { code:string;name:string;prefix:string;suffix:string;number_format:string;rate:string;decimals:number;enabled:boolean;client_default:boolean;is_base?:boolean;rate_configured?:boolean }
const SEPS:Record<string,[string,string]>={'1,234.56':[',','.'],'1.234,56':['.',','],'1 234,56':[' ',','],'1234.56':['','.']};
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
 const [group,decimal]=SEPS[row.number_format]??SEPS['1,234.56']!;
 const body=whole.replace(/\B(?=(\d{3})+(?!\d))/g,group)+(fraction?decimal+fraction:'');
 return `${neg?'-':''}${row.prefix}${body}${row.suffix?` ${row.suffix}`:''}${withCode&&!row.prefix&&!row.suffix?` ${withCode}`:''}`;
}
export function unitsToInput(value:string|null|undefined):string {
 if(value==null||value==='')return '';
 const units=BigInt(value),whole=(units/1000000000000n).toString();
 const fraction=(units%1000000000000n).toString().padStart(12,'0').replace(/0+$/,'');
 return `${whole}.${fraction.padEnd(2,'0')}`;
}
