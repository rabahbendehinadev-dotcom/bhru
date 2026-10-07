import { SUPPORTED_NUMBER_FORMATS, isSupportedNumberFormat } from '@/lib/currency-money';

interface Props {
 value: string;
 savedValue?: string;
 onChange: (value: string) => void;
 className?: string;
 id?: string;
 'aria-describedby'?: string;
 'data-testid'?: string;
}
/** Standard choices plus this record's retained saved style, never free-text entry. */
export function CurrencyFormatSelect({ value, savedValue, onChange, ...props }: Props) {
 const retained = savedValue !== undefined && !isSupportedNumberFormat(savedValue);
 return (
  <select {...props} aria-label="Format" value={value} onChange={event => onChange(event.target.value)}>
   {SUPPORTED_NUMBER_FORMATS.map(format => <option key={format} value={format}>{format}</option>)}
   {retained && <option value={savedValue}>{savedValue} (saved format)</option>}
  </select>
 );
}
