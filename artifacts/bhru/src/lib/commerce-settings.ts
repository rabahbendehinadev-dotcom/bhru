/** Explicit write contract: never round-trip response metadata into the strict API. */
export interface CommerceSettingsFields {
 enabled: boolean; title: string; currency: string; featured_first: boolean;
 email_mode: 'hidden' | 'optional' | 'required'; address_mode: 'hidden' | 'optional' | 'required';
 show_state: boolean; show_city: boolean; show_note: boolean; whatsapp: string; confirmation_message: string;
}
export function commerceSettingsPayload(f: CommerceSettingsFields, usdModel: boolean): CommerceSettingsFields {
 return {
  enabled:f.enabled,title:f.title.trim(),currency:usdModel?'USD':f.currency,featured_first:f.featured_first,
  email_mode:f.email_mode,address_mode:f.address_mode,show_state:f.show_state,show_city:f.show_city,show_note:f.show_note,
  whatsapp:f.whatsapp.trim(),confirmation_message:f.confirmation_message.trim(),
 };
}
