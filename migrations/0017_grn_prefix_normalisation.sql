-- Data fix: normalise GRN receipt_number prefixes
-- Two legacy goods receipts were created with the old "GR" prefix before
-- company settings standardised on "GRN". Rename them to the next available
-- sequential numbers (GRN0018, GRN0019) to avoid conflicts with GRN0001–GRN0017.
-- Also advance the next_grn_number counter so new receipts start at GRN0020.

UPDATE goods_receipts
SET receipt_number = 'GRN0018'
WHERE receipt_number = 'GR0001';

UPDATE goods_receipts
SET receipt_number = 'GRN0019'
WHERE receipt_number = 'GR0002';

UPDATE company_settings
SET next_grn_number = 20
WHERE next_grn_number < 20;
