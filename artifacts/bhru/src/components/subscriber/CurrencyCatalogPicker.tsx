import { useMemo, useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@/components/ui/command';
import { searchCurrencyCatalog, type CatalogCurrency } from '@/lib/currency-catalog-search';

interface Props {
 catalog: readonly CatalogCurrency[];
 configuredCodes: readonly string[];
 value: string;
 disabled?: boolean;
 onSelect: (currency: CatalogCurrency) => void;
}
export function CurrencyCatalogPicker({ catalog, configuredCodes, value, disabled, onSelect }: Props) {
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState('');
 const selected = catalog.find(c => c.code === value);
 const options = useMemo(() => searchCurrencyCatalog(catalog, configuredCodes, query),
  [catalog, configuredCodes, query]);
 return (
  <Popover open={open && !disabled} onOpenChange={next => { setOpen(next); if (next) setQuery(''); }}>
   <PopoverTrigger asChild>
    <button type="button" role="combobox" aria-label="Select Currency" aria-expanded={open && !disabled}
     disabled={disabled} className="input flex !h-8 w-full min-w-0 items-center justify-between gap-2 !text-[12.5px]"
     data-testid="select-add-currency">
     <span className="truncate">{selected ? `${selected.code} — ${selected.name}` : 'Select currency'}</span>
     <ChevronsUpDown size={13} className="shrink-0 opacity-60" />
    </button>
   </PopoverTrigger>
   <PopoverContent align="start" className="w-[min(360px,calc(100vw-32px))] p-0">
    <Command shouldFilter={false}>
     <CommandInput placeholder="Search code, name or country…" aria-label="Search currency catalog"
      value={query} onValueChange={setQuery} className="!h-9 text-[12.5px]" data-testid="input-currency-search" />
     <CommandList className="max-h-64">
      <CommandEmpty className="px-3 py-4 text-[12.5px]">No available currencies found. Configured currencies are excluded.</CommandEmpty>
      {options.map(currency => (
       <CommandItem key={currency.code} value={currency.code} className="gap-2 text-[12.5px]"
        onSelect={() => { onSelect(currency); setOpen(false); }} data-testid={`option-currency-${currency.code}`}>
        <Check size={13} className={`shrink-0 ${value === currency.code ? '' : 'invisible'}`} />
        <span className="min-w-0 flex-1"><b>{currency.code}</b> — {currency.name}</span>
        <bdi dir="auto" className="shrink-0 text-[12px] opacity-65">{currency.symbol}</bdi>
       </CommandItem>
      ))}
     </CommandList>
     <p className="border-t border-[hsl(var(--border))] px-3 py-1.5 text-[11px] text-[hsl(var(--text-secondary))]">
      {options.length} available · Exchange rates are entered manually
     </p>
    </Command>
   </PopoverContent>
  </Popover>
 );
}
