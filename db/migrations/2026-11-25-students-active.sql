-- A student can be paused (e.g. summer) without losing the schedule or history.
-- Existing students start active; the app writes this flag from the student editor.
ALTER TABLE students
  ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER balance;
