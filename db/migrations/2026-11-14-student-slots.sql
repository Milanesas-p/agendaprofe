-- A student can have several weekly slots, and only a `fijo` gets them booked.
--
-- The old single pair (recurring_weekday, recurring_time) and its generation marker
-- move to `student_slots`, one row per slot. The copy keeps every existing series and
-- its `last_generated` marker, so nothing is regenerated behind the teacher's back.
-- The live rows are test data; the copy is still written so the migration is safe.

CREATE TABLE student_slots (
  id         CHAR(36)  NOT NULL,
  owner_id   CHAR(36)  NOT NULL,
  student_id CHAR(36)  NOT NULL,
  weekday    TINYINT   NOT NULL,
  start_time CHAR(5)   NOT NULL,
  last_generated DATE   NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY student_slots_unique (owner_id, student_id, weekday, start_time),
  KEY student_slots_owner (owner_id),
  CONSTRAINT student_slots_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT student_slots_time CHECK (start_time REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT student_slots_student_fk FOREIGN KEY (student_id, owner_id)
    REFERENCES students (id, owner_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO student_slots (id, owner_id, student_id, weekday, start_time, last_generated)
SELECT UUID(), owner_id, id, recurring_weekday, recurring_time, recurring_last_date
FROM students
WHERE recurring_weekday IS NOT NULL AND recurring_time IS NOT NULL;

-- The check that guarded the old pair depends on the columns, so it goes first.
ALTER TABLE students DROP CHECK students_recurring_pair;

ALTER TABLE students
  DROP COLUMN recurring_weekday,
  DROP COLUMN recurring_time,
  DROP COLUMN recurring_last_date;
