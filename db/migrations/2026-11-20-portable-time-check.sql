-- MySQL 8.0 refuses REGEXP (stored as regexp_like) inside a CHECK constraint:
-- "Function or expression 'regexp_like()' cannot be used in the CHECK clause".
-- The local 8.4 server accepted it, so the dump could not be imported on the
-- hosting. Same guarantee, spelled with deterministic string functions.
ALTER TABLE student_slots
  DROP CHECK student_slots_time,
  ADD CONSTRAINT student_slots_time CHECK (
    CHAR_LENGTH(start_time) = 5
    AND SUBSTR(start_time, 1, 2) BETWEEN '00' AND '23'
    AND SUBSTR(start_time, 3, 1) = ':'
    AND SUBSTR(start_time, 4, 2) BETWEEN '00' AND '59'
  );

ALTER TABLE lessons
  DROP CHECK lessons_start_fmt,
  ADD CONSTRAINT lessons_start_fmt CHECK (
    CHAR_LENGTH(start_time) = 5
    AND SUBSTR(start_time, 1, 2) BETWEEN '00' AND '23'
    AND SUBSTR(start_time, 3, 1) = ':'
    AND SUBSTR(start_time, 4, 2) BETWEEN '00' AND '59'
  );
