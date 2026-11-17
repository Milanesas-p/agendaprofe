-- Where a class came from when the teacher moved it, so the new slot can say
-- "Clase movida desde …". NULL means the class never moved.
ALTER TABLE lessons
  ADD COLUMN moved_from_date   DATE   NULL AFTER notified_at,
  ADD COLUMN moved_from_start  CHAR(5) NULL AFTER moved_from_date;
