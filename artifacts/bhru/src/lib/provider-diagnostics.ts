/** Only fixed messages are rendered; upstream text is never echoed. */
const messages:Record<string,string>={
  UNSUPPORTED_RESPONSE_FORMAT:'Provider did not declare a supported JSON response format.',
  UNEXPECTED_HTML:'Provider returned HTML instead of supported JSON. Verify the supplied endpoint.',
  UNEXPECTED_XML:'Provider returned XML instead of supported JSON. Verify JSON format support.',
  MALFORMED_JSON:'Provider response could not be parsed as valid JSON.',
  AUTHENTICATION_REJECTED:'Provider explicitly rejected authentication. Verify the DHRU credentials.',
  IP_RESTRICTED:'Provider explicitly rejected access from this IP. Check IP Guard with the provider; do not disable it.',
  HTTP_FAILURE:'Provider returned an unsuccessful HTTP response. Check endpoint, access permissions and availability.',
  UNEXPECTED_RESPONSE_SCHEMA:'Provider JSON did not match the supported DHRU Legacy v6.1 schema.',
  LEGACY_VERSION_MISMATCH:'Provider account response declares an unsupported Legacy API version. Version validation remains strict.',
  LEGACY_SUCCESS_ENVELOPE_INVALID:'Provider account response has an unsupported SUCCESS envelope or root structure.',
  LEGACY_ACCOUNT_CONTAINER_MISSING:'Provider account response is missing the supported AccoutInfo object or uses an unsupported container.',
  LEGACY_ACCOUNT_CURRENCY_INVALID:'Provider account response contains an unsupported currency value.',
  LEGACY_ACCOUNT_CREDIT_INVALID:'Provider account response contains an unsupported credit value.',
  LEGACY_ERROR_ENVELOPE_INVALID:'Provider account response contains a malformed or unsupported ERROR envelope.',
  UPSTREAM_REJECTION:'Provider returned an error without a recognized safe diagnostic. Verify provider configuration.',
  UNSUPPORTED_CONTENT_ENCODING:'Provider used unsupported response compression despite an identity encoding request.',
  RESPONSE_TOO_LARGE:'Provider response exceeded the safe size limit.',
  NETWORK_FAILURE:'Provider network request could not be completed. Check DNS, TLS and availability.',
};
export function providerFailureMessage(category:string,diagnostic?:string|null,upstreamHttpStatus?:number|null){
  const code=diagnostic??category.split(':')[1];
  const savedStatus=category.split(':')[2];
  const status=upstreamHttpStatus??(savedStatus&&/^[1-5][0-9]{2}$/.test(savedStatus)?Number(savedStatus):undefined);
  if(code==='HTTP_FAILURE'&&typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599)
    return `Provider returned an unsuccessful upstream HTTP response (HTTP ${status}). Check endpoint, access permissions and availability.`;
  if(code&&Object.hasOwn(messages,code))return messages[code]!;
  const health=category.split(':')[0];
  if(health==='AUTHENTICATION_FAILED'||health==='AUTH_FAILED')return 'Provider access was rejected. Verify credentials and upstream access permissions.';
  if(health==='UNREACHABLE')return 'Provider could not be reached. Check DNS, TLS and availability.';
  if(health==='CREDENTIALS_UNAVAILABLE')return 'Saved provider credentials are unavailable. Check encryption configuration.';
  return 'Provider operation failed. Verify endpoint, configuration and provider access permissions.';
}
/** Preserve pre-existing plain-code display (including REST); only expand new diagnostics. */
export function providerSavedFailureMessage(error:string){
  if(error.includes(':'))return providerFailureMessage(error);
  return ['AUTH_FAILED','AUTHENTICATION_FAILED','UNSUPPORTED_PROVIDER','UNREACHABLE',
    'INVALID_RESPONSE','CONFIGURATION_CHANGED','CREDENTIALS_UNAVAILABLE','SYNC_FAILED'].includes(error)
    ?error:'Provider operation failed.';
}
