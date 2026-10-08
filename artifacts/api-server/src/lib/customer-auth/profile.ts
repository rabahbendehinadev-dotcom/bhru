import { z } from '@workspace/api-zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { HttpError } from '../auth';
import { currencies } from '../commerce/currencies';
import { STOREFRONT_LANGUAGES } from '../commerce/storefront-preferences';
import type { CustomerDB, CustomerIdentity } from './types';

// ISO 3166-1 alpha-2 codes; labels are provided by the runtime's ICU data.
export const COUNTRY_CODES = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
export const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
export function normalizePhone(phone: string): string {
  const normalized = phone.trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) throw new HttpError(400, 'Enter WhatsApp/mobile in international format, for example +213555123456.');
  const parsed = parsePhoneNumberFromString(normalized);
  if (!parsed?.isPossible()) throw new HttpError(400, 'Enter a possible international WhatsApp number with a valid calling code.');
  return parsed.number;
}
export const profileEditInput = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  username: z.string().trim().regex(USERNAME),
  whatsappPhone: z.string().trim().max(30).nullable(),
  preferredLanguage: z.string().max(8).nullable(), preferredCurrency: z.string().max(3).nullable(),
  newsletterOptIn: z.boolean(),
  addressLine1: z.string().trim().max(200).nullable(), addressLine2: z.string().trim().max(200).nullable(),
  countryCode: z.string().max(2).nullable(), state: z.string().trim().max(100).nullable(),
  city: z.string().trim().max(100).nullable(), postalCode: z.string().trim().max(24).nullable(),
}).strict();
export async function registrationOptions(subscriber: string, db: CustomerDB) {
  const configured = await currencies(subscriber, db as Parameters<typeof currencies>[1]);
  const enabled = configured.filter(c => c.enabled && c.rate_configured !== false && c.registration_available);
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return {
    currencies: enabled.map(c => ({ code: c.code, name: c.name })),
    defaultCurrency: enabled.find(c => c.client_default)?.code ?? enabled[0]?.code ?? null,
    languages: STOREFRONT_LANGUAGES.map(([code, name]) => ({ code, name })),
    countries: [...COUNTRY_CODES].map(code => ({ code, name: names.of(code) ?? code })).sort((a,b) => a.name.localeCompare(b.name)),
  };
}
export async function validatePreferences(subscriber: string, language: string | null, currency: string | null, country: string | null, db: CustomerDB) {
  if (language !== null && !STOREFRONT_LANGUAGES.some(([code]) => code === language)) throw new HttpError(400, 'Choose a supported public language.');
  if (country !== null && !COUNTRY_CODES.has(country)) throw new HttpError(400, 'Choose a valid country.');
  if (currency !== null && !(await registrationOptions(subscriber, db)).currencies.some(c => c.code === currency)) throw new HttpError(400, 'Choose a currency offered for registration by this reseller.');
}
export async function effectiveCustomerProfile(customer: CustomerIdentity, db: CustomerDB) {
  const { customerProfile } = await import('./types');
  return { ...customerProfile(customer), accountCurrency:customer.preferredCurrency,effectiveCurrency:customer.preferredCurrency };
}
export const CUSTOMER_PROFILE_SELECT = `c.id,c.subscriber_id,c.first_name AS "firstName",c.last_name AS "lastName",c.email,
 c.client_code AS "clientCode",c.username,c.whatsapp_phone AS "whatsappPhone",c.preferred_language AS "preferredLanguage",
 c.preferred_currency AS "preferredCurrency",c.newsletter_opt_in AS "newsletterOptIn",
 c.address_line_1 AS "addressLine1",c.address_line_2 AS "addressLine2",c.country_code AS "countryCode",
 c.state,c.city,c.postal_code AS "postalCode",c.created_at AS "createdAt",c.last_login_at AS "lastLoginAt",
 c.terms_accepted_at AS "termsAcceptedAt"`;
