-- The "firme" categories are one character longer than the column: "8va firme"
-- has nine characters and the column was VARCHAR(8), so every one of them failed
-- with "Data too long". The CHECK already listed them; only the width was wrong.

ALTER TABLE students MODIFY category VARCHAR(12) NULL;
