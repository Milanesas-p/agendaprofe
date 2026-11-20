-- MariaDB rejects IF() and CASE inside a GENERATED ALWAYS AS expression (error
-- 1901), so the database can no longer compute the slot key. It becomes a plain
-- column written by the app (src/server/data.ts) on insert, status change and
-- move; the unique key still prevents booking the same student twice into the
-- same active slot.
--
-- Dropping the column also drops the unique key that uses it; both are recreated.
ALTER TABLE lessons
  DROP INDEX one_active_student_slot,
  DROP COLUMN slot_key,
  ADD COLUMN slot_key VARCHAR(20) NULL AFTER moved_from_start,
  ADD UNIQUE KEY one_active_student_slot (owner_id, slot_key, student_id);

UPDATE lessons
  SET slot_key = CASE WHEN status = 'cancelada' THEN NULL
    ELSE CONCAT(lesson_date, '#', start_time) END;
