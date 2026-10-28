-- Pixel Perfect Match — MySQL 8 schema.
-- Replaces the Postgres/Supabase schema in drizzle/migrations/0000_padel_students_lessons_settings.sql.
--
-- Differences from the Postgres version, on purpose:
--   * No RLS. "Owner scoped" rows are enforced by the Node API, which is the only
--     client allowed to touch this database.
--   * No attendance trigger. Credit accounting moves into a server transaction so
--     it can be tested; a MySQL trigger would duplicate that rule.
--   * one_active_slot used a partial index (WHERE status <> 'cancelada'). MySQL has
--     no partial indexes, so it is a STORED generated column + UNIQUE key, which
--     tolerates multiple NULLs (cancelled lessons). The key also carries student_id,
--     so a slot can hold several students but never the same one twice.
--   * date/start are reserved words, renamed to lesson_date/start_time.

CREATE TABLE users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE students (
  id         CHAR(36)     NOT NULL,
  owner_id   CHAR(36)     NOT NULL,
  name       VARCHAR(120) NOT NULL,
  type       VARCHAR(16)  NOT NULL,
  pay        VARCHAR(16)  NOT NULL,
  -- Optional: needed for the future "message this student on WhatsApp" button.
  phone      VARCHAR(32)  NULL,
  -- Weekly fixed slot, optional. weekday: 0=Sunday .. 6=Saturday.
  -- last_date is the last date already resolved, so generation only ever moves
  -- forward and a moved or cancelled occurrence can never be regenerated.
  recurring_weekday   TINYINT NULL,
  recurring_time      CHAR(5) NULL,
  recurring_last_date DATE    NULL,
  balance    INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Required so lessons can reference (id, owner_id) as a composite foreign key.
  UNIQUE KEY students_owner (id, owner_id),
  KEY students_owner_name (owner_id, name),
  CONSTRAINT students_name_len CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT students_phone_len CHECK (phone IS NULL OR CHAR_LENGTH(TRIM(phone)) BETWEEN 6 AND 32),
  CONSTRAINT students_recurring_pair CHECK (
    (recurring_weekday IS NULL AND recurring_time IS NULL)
    OR (recurring_weekday BETWEEN 0 AND 6
        AND recurring_time REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  ),
  CONSTRAINT students_type CHECK (type IN ('fijo', 'rotativo')),
  CONSTRAINT students_pay CHECK (pay IN ('mensual', 'semanal')),
  CONSTRAINT students_owner_fk FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lessons (
  id          CHAR(36)     NOT NULL,
  owner_id    CHAR(36)     NOT NULL,
  lesson_date DATE         NOT NULL,
  start_time  CHAR(5)      NOT NULL,
  student_id  CHAR(36)     NOT NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'programada',
  -- NULL when cancelled, so the UNIQUE key below only guards active rows.
  slot_key    VARCHAR(20)  GENERATED ALWAYS AS (
    IF(status = 'cancelada', NULL, CONCAT(lesson_date, '#', start_time))
  ) STORED,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- A slot holds up to MAX_STUDENTS_PER_LESSON students (enforced by the API), and
  -- the same student cannot be booked twice into it. Cancelled rows have a NULL
  -- slot_key, so they never collide.
  UNIQUE KEY one_active_student_slot (owner_id, slot_key, student_id),
  KEY lessons_owner_date (owner_id, lesson_date),
  CONSTRAINT lessons_start_fmt CHECK (start_time REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT lessons_status CHECK (status IN ('programada', 'presente', 'ausente', 'cancelada')),
  CONSTRAINT lessons_student_fk FOREIGN KEY (student_id, owner_id)
    REFERENCES students (id, owner_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE court_settings (
  owner_id   CHAR(36) NOT NULL,
  start_hour INT      NOT NULL DEFAULT 8,
  end_hour   INT      NOT NULL DEFAULT 22,
  block_min  INT      NOT NULL DEFAULT 60,
  PRIMARY KEY (owner_id),
  CONSTRAINT settings_start CHECK (start_hour BETWEEN 0 AND 23),
  CONSTRAINT settings_end CHECK (end_hour BETWEEN 1 AND 24),
  CONSTRAINT settings_block CHECK (block_min BETWEEN 15 AND 240),
  CONSTRAINT settings_range CHECK (end_hour > start_hour),
  CONSTRAINT settings_fit CHECK (block_min <= (end_hour - start_hour) * 60),
  CONSTRAINT settings_owner_fk FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Opaque session tokens. Only the SHA-256 of the cookie value is stored, so a
-- database leak does not hand out live sessions.
-- Expiry uses MySQL's own clock (NOW()) to avoid server/client clock mismatch.
CREATE TABLE sessions (
  token_hash CHAR(64)  NOT NULL,
  user_id    CHAR(36)  NOT NULL,
  expires_at DATETIME  NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY sessions_user (user_id),
  KEY sessions_expiry (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Housekeeping: expired sessions are already invisible to every query (they all
-- filter on `expires_at > NOW()`), so this only keeps the table small.
-- Requires `event_scheduler=ON`, a server-wide setting that is not carried by this
-- file. If the scheduler is off the event silently does nothing, which is harmless.
CREATE EVENT IF NOT EXISTS purge_expired_sessions
  ON SCHEDULE EVERY 1 DAY
  DO DELETE FROM sessions WHERE expires_at < NOW();
