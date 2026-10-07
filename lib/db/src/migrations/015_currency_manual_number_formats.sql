-- Expand presentation-format support only. No currency values, rates or money are rewritten.
-- Existing four formats continue to pass; precision still comes from currency.decimals.
ALTER TABLE subscriber_currencies
 DROP CONSTRAINT subscriber_currencies_number_format_check,
 ADD CONSTRAINT subscriber_currencies_number_format_check CHECK (
  length(number_format) <= 24
  AND (
   number_format ~ '^[0-9]{1,3}[., ][0-9]{3}[.,][0-9]{2}$'
   OR number_format ~ '^[0-9]{4,18}[.,][0-9]{2}$'
  )
  AND regexp_replace(number_format, '[0-9]', '', 'g') IN (',.', '.,', ' .', ' ,', '.', ',')
 );
