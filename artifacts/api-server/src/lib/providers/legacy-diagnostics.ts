/** Fixed codes only. Never store or forward an upstream message/body. */
export type LegacyDiagnosticCode =
  | 'UNSUPPORTED_RESPONSE_FORMAT' | 'UNEXPECTED_HTML' | 'UNEXPECTED_XML'
  | 'MALFORMED_JSON' | 'AUTHENTICATION_REJECTED' | 'IP_RESTRICTED'
  | 'LEGACY_VERSION_MISMATCH' | 'LEGACY_SUCCESS_ENVELOPE_INVALID'
  | 'LEGACY_ACCOUNT_CONTAINER_MISSING' | 'LEGACY_ACCOUNT_CURRENCY_INVALID'
  | 'LEGACY_ACCOUNT_CREDIT_INVALID' | 'LEGACY_ERROR_ENVELOPE_INVALID'
  | 'HTTP_FAILURE' | 'UNEXPECTED_RESPONSE_SCHEMA' | 'UPSTREAM_REJECTION'
  | 'UNSUPPORTED_CONTENT_ENCODING' | 'RESPONSE_TOO_LARGE' | 'NETWORK_FAILURE';

export function isLegacyAccountDiagnostic(code:unknown):code is LegacyDiagnosticCode{
  return typeof code==='string'&&[
    'LEGACY_VERSION_MISMATCH','LEGACY_SUCCESS_ENVELOPE_INVALID',
    'LEGACY_ACCOUNT_CONTAINER_MISSING','LEGACY_ACCOUNT_CURRENCY_INVALID',
    'LEGACY_ACCOUNT_CREDIT_INVALID','LEGACY_ERROR_ENVELOPE_INVALID',
  ].includes(code);
}

/** Match explicit negative statements, not incidental mentions of auth or IP. */
export function legacyRejection(messages: unknown[]): LegacyDiagnosticCode {
  const normalized = messages.filter((v): v is string => typeof v === 'string' && v.length <= 500)
    .map(v => v.trim().toLowerCase().replace(/[.!]$/, ''));
  if (normalized.some(v => /^(?:ip(?: address)? (?:is )?(?:not allowed|blocked|restricted)|ip access denied|access denied for (?:this |your )?ip(?: address)?)$/.test(v)))
    return 'IP_RESTRICTED';
  if (normalized.some(v => /^(?:authentication (?:failed|failure)|invalid (?:api (?:access )?key|username|credentials)|(?:api (?:access )?key|credentials) (?:is |are )?(?:invalid|rejected))$/.test(v)))
    return 'AUTHENTICATION_REJECTED';
  return 'UPSTREAM_REJECTION';
}

export function legacyMimeDiagnostic(contentType: string): LegacyDiagnosticCode {
  const mime = contentType.split(';', 1)[0]!.trim().toLowerCase();
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'UNEXPECTED_HTML';
  if (mime === 'application/xml' || mime === 'text/xml' || mime.endsWith('+xml')) return 'UNEXPECTED_XML';
  return 'UNSUPPORTED_RESPONSE_FORMAT';
}
