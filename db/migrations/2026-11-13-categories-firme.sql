-- Categories: the teacher also uses "6ta firme", "7ma firme" and "8va firme".
--
-- The new set is a superset of the old one, so every stored row stays valid and
-- no backfill is needed. MySQL cannot alter a CHECK in place: drop and add.

ALTER TABLE students DROP CHECK students_category;

ALTER TABLE students ADD CONSTRAINT students_category CHECK (
  category IS NULL OR category IN (
    '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '6ta firme', '7ma', '7ma firme', '8va', '8va firme'
  )
);
