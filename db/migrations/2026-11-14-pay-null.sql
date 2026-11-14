-- Payment is optional: the teacher leaves `pago` blank for students whose mode is
-- still undecided (individual or grupal). NULL means "sin definir"; the old default
-- of completing "mensual" is gone.
--
-- MySQL cannot alter a CHECK in place, and the column has to accept NULL before the
-- new constraint can, so the order is drop, change, add.

ALTER TABLE students DROP CHECK students_pay;

ALTER TABLE students MODIFY pay VARCHAR(16) NULL;

ALTER TABLE students ADD CONSTRAINT students_pay CHECK (
  pay IS NULL OR pay IN ('mensual', 'individual', 'grupal')
);
