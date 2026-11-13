-- Payment modes: mensual / semanal became mensual / individual / grupal.
--
-- MySQL cannot alter a CHECK in place, and the old value has to go before the new
-- constraint can accept it, so the order is drop, backfill, add.
-- The rows in this database are test data; `semanal` is mapped to `individual`.

ALTER TABLE students DROP CHECK students_pay;

UPDATE students SET pay = 'individual' WHERE pay = 'semanal';

ALTER TABLE students ADD CONSTRAINT students_pay CHECK (pay IN ('mensual', 'individual', 'grupal'));
