import { GetCurrentGeneralSettingsResponse, UpdateCurrentGeneralSettingsBody, type GeneralSettingsInput } from "@workspace/api-zod";
import { HttpError } from "./auth";

// These keys come from the trusted generated contract, never from request input.
export const settingsFields = Object.keys(UpdateCurrentGeneralSettingsBody.shape) as (keyof GeneralSettingsInput)[];

const cents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
};

export function validateGeneralSettings(raw: unknown): GeneralSettingsInput {
  const values = UpdateCurrentGeneralSettingsBody.strict().parse(raw);
  for (const field of ["logo_url", "favicon_url", "site_link", "site_ssl_link"] as const) {
    const value = values[field];
    if (!value) continue;
    try {
      const url = new URL(value);
      const protocols = field === "site_ssl_link" ? ["https:"] : ["http:", "https:"];
      if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password ||
          /\s/.test(value) || !/^https?:\/\//i.test(value)) throw new Error("Invalid URL");
    } catch {
      throw new HttpError(400, `${field} must be empty or a valid ${field === "site_ssl_link" ? "HTTPS" : "HTTP/HTTPS"} URL without credentials.`);
    }
  }
  // Redirects are inert strings in this phase, but reject control characters.
  for (const field of ["index_redirect", "logout_redirect"] as const) {
    if (/[\u0000-\u001f\u007f]/.test(values[field])) throw new HttpError(400, `${field} must not contain control characters.`);
  }
  if (values.minimum_add_fund !== null && values.maximum_add_fund !== null &&
      cents(values.minimum_add_fund) > cents(values.maximum_add_fund)) {
    throw new HttpError(400, "Maximum Add Fund must not be lower than Minimum Add Fund.");
  }
  return values;
}

export function serializeGeneralSettings(row: Record<string, unknown>) {
  return GetCurrentGeneralSettingsResponse.parse({
    id: row.id,
    subscriber_id: row.subscriber_id,
    values: Object.fromEntries(settingsFields.map(field => [field, row[field]])),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}
