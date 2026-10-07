import { settingsInput } from './validation';
import { HttpError } from '../auth';

/** Safe reasons only: no rejected values, SQL details or arbitrary extra-key names. */
const reasons: Record<string,string> = {
 enabled:'Store open state must be enabled or disabled.',
 title:'Store title is required and must contain at most 120 characters.',
 currency:'Invalid store accounting reference.',
 featured_first:'Featured-products setting must be enabled or disabled.',
 email_mode:'Invalid customer email requirement.',
 address_mode:'Invalid customer address requirement.',
 show_state:'State setting must be enabled or disabled.',
 show_city:'City setting must be enabled or disabled.',
 show_note:'Order-note setting must be enabled or disabled.',
 whatsapp:'WhatsApp number must be blank or an international number containing 7–20 digits.',
 confirmation_message:'Order confirmation message must be provided as text of at most 500 characters.',
};
export function parseStoreSettings(raw: unknown) {
 const result=settingsInput.safeParse(raw);
 if(result.success)return result.data;
 const messages=result.error.issues.map(issue => {
  if(issue.path[0]==='title') {
   if(issue.code==='too_big')return 'Store title must not exceed 120 characters.';
   if(issue.code==='invalid_string')return 'Store title contains unsupported characters.';
   return 'Store title is required.';
  }
  if(issue.path[0]==='confirmation_message'&&issue.code==='invalid_type')return 'Order confirmation message is required.';
  return reasons[String(issue.path[0])] ?? 'Unexpected store setting. Reload this page and try again.';
 });
 throw new HttpError(400,[...new Set(messages)].join(' '));
}
