import { useCommerceList } from '@/hooks/use-commerce';
import {rateScaled,formatScaled,parseUnits,type PanelCurrency} from '@/lib/currency-money';
export {rateScaled,formatScaled,parseUnits,unitsToInput} from '@/lib/currency-money';
export type {PanelCurrency} from '@/lib/currency-money';

export interface PanelCurrencyConfig { base_currency: string; money_model_version: 1 | 2; canonical_scale: 12 | 2; requires_conversion: boolean; panel_display_currency: string; currencies: PanelCurrency[] }

export function usePanelMoney() {
  const q = useCommerceList<PanelCurrencyConfig>('currencies');
  const cfg = q.rows;
  const v2 = cfg?.money_model_version === 2;
  const enabled = (cfg?.currencies ?? []).filter((c) => c.enabled&&c.rate_configured!==false);
  const selected = cfg?.currencies.find((c) => c.code === cfg.panel_display_currency && c.enabled)
    ?? enabled.find((c) => c.client_default) ?? enabled[0] ?? cfg?.currencies.find((c) => c.is_base);
  const formatUsd = (units: string | null | undefined): string => {
    const u = parseUnits(units);
    if (u == null || !selected) return '-';
    const rate = selected.is_base || selected.code === cfg?.base_currency ? 1000000n : rateScaled(selected.rate);
    return formatScaled(u * rate, 18, selected, selected.code);
  };
  const format = (p: { price_usd_units?: string | null; price_minor?: string | null }): string => {
    if (v2) return formatUsd(p.price_usd_units);
    if (p.price_minor == null) return '-';
    return formatScaled(BigInt(p.price_minor), 2, { prefix: '', suffix: '', number_format: '1,234.56', decimals: 2 }, cfg?.base_currency ?? '');
  };
  return { cfg, selected, enabled, isLoading: q.isLoading, isError: q.isError, v2, legacy: cfg?.requires_conversion === true, formatUsd, format };
}

