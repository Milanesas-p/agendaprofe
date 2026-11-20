-- Accounts get a role and a switch the operator controls.
-- `role = 'admin'` is what opens the operator panel; `active = 0` parks an account
-- (no login, and an already open session stops resolving).
-- Existing accounts stay teachers and active.
ALTER TABLE users
  ADD COLUMN role   ENUM('profe','admin') NOT NULL DEFAULT 'profe' AFTER display_name,
  ADD COLUMN active TINYINT(1)            NOT NULL DEFAULT 1       AFTER role;
