-- Add the two literal dropdown styles without changing any saved formats or money.
-- Preserve the complete 015 constraint domain for existing subscriber configurations.
ALTER TABLE subscriber_currencies
 DROP CONSTRAINT subscriber_currencies_number_format_check,
 ADD CONSTRAINT subscriber_currencies_number_format_check CHECK (
  number_format IN ('1,000,99', '1,000')
  OR (
   length(number_format) <= 24
   AND (
    number_format ~ '^[0-9]{1,3}[., ][0-9]{3}[.,][0-9]{2}$'
    OR number_format ~ '^[0-9]{4,18}[.,][0-9]{2}$'
   )
   AND regexp_replace(number_format, '[0-9]', '', 'g') IN (',.', '.,', ' .', ' ,', '.', ',')
  )
 );
