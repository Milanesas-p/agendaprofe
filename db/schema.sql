-- Portability note: tables do not pin a collation. MySQL 8 and MariaDB disagree on
-- the utf8mb4_0900_* names, so each server uses its own utf8mb4 default.

-- Pixel Perfect Match — MySQL 8 / MariaDB schema.
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
  -- Shown in the app header. Set when the account is provisioned or from the
  -- settings screen; the email is still the identity.
  display_name  VARCHAR(120) NULL,
  -- Only an admin opens the operator panel. Everyone else manages their own students.
  role          ENUM('profe', 'admin') NOT NULL DEFAULT 'profe',
  -- 0 parks the account: the login is refused and an open session stops resolving.
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  -- NULL until the welcome tour is finished or skipped: the tour only shows on
  -- the first sessions of an account.
  tour_done_at  TIMESTAMP    NULL,
  -- Login throttle, decided with MySQL's clock: consecutive failures, when the
  -- last one happened (to expire the streak) and until when the account is parked.
  failed_logins INT          NOT NULL DEFAULT 0,
  last_failed_at DATETIME    NULL,
  locked_until  DATETIME     NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE students (
  id         CHAR(36)     NOT NULL,
  owner_id   CHAR(36)     NOT NULL,
  name       VARCHAR(120) NOT NULL,
  type       VARCHAR(16)  NOT NULL,
  -- Null means the teacher has not decided the mode yet; the sheet may leave it blank.
  pay        VARCHAR(16)  NULL,
  -- Optional: needed for the future "message this student on WhatsApp" button.
  phone      VARCHAR(32)  NULL,
  -- Optional player profile. Closed sets, mirrored in src/lib/player.ts.
  category   VARCHAR(12) NULL,
  court_side VARCHAR(12) NULL,
  -- Weekly slots live in student_slots: a student can have several, and only a
  -- `fijo` gets them booked. A `rotativo` keeps them as habitual times.
  balance    INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Required so lessons can reference (id, owner_id) as a composite foreign key.
  UNIQUE KEY students_owner (id, owner_id),
  KEY students_owner_name (owner_id, name),
  CONSTRAINT students_name_len CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 120),
  CONSTRAINT students_phone_len CHECK (phone IS NULL OR CHAR_LENGTH(TRIM(phone)) BETWEEN 6 AND 32),
  CONSTRAINT students_type CHECK (type IN ('fijo', 'rotativo')),
  CONSTRAINT students_pay CHECK (pay IS NULL OR pay IN ('mensual', 'individual', 'grupal')),
  CONSTRAINT students_category CHECK (
    category IS NULL OR category IN (
      '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '6ta firme', '7ma', '7ma firme', '8va', '8va firme'
    )
  ),
  CONSTRAINT students_court_side CHECK (
    court_side IS NULL OR court_side IN ('drive', 'reves', 'indistinto')
  ),
  CONSTRAINT students_owner_fk FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE student_slots (
  id         CHAR(36)  NOT NULL,
  owner_id   CHAR(36)  NOT NULL,
  student_id CHAR(36)  NOT NULL,
  -- 0 = Sunday .. 6 = Saturday. Several slots per student are allowed.
  weekday    TINYINT   NOT NULL,
  start_time CHAR(5)   NOT NULL,
  -- Last date already resolved for this slot, so generation only moves forward and
  -- a moved or cancelled occurrence can never be regenerated.
  last_generated DATE   NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- The same weekday and time cannot repeat for one student.
  UNIQUE KEY student_slots_unique (owner_id, student_id, weekday, start_time),
  KEY student_slots_owner (owner_id),
  CONSTRAINT student_slots_weekday CHECK (weekday BETWEEN 0 AND 6),
  -- Spelled with string functions: MySQL 8.0 refuses REGEXP (regexp_like) inside a
  -- CHECK constraint, which made the dump impossible to import on the hosting.
  CONSTRAINT student_slots_time CHECK (
    CHAR_LENGTH(start_time) = 5
    AND SUBSTR(start_time, 1, 2) BETWEEN '00' AND '23'
    AND SUBSTR(start_time, 3, 1) = ':'
    AND SUBSTR(start_time, 4, 2) BETWEEN '00' AND '59'
  ),
  CONSTRAINT student_slots_student_fk FOREIGN KEY (student_id, owner_id)
    REFERENCES students (id, owner_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE lessons (
  id          CHAR(36)     NOT NULL,
  owner_id    CHAR(36)     NOT NULL,
  lesson_date DATE         NOT NULL,
  start_time  CHAR(5)      NOT NULL,
  student_id  CHAR(36)     NOT NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'programada',
  -- Set when the teacher sends the WhatsApp reminder for this class; NULL means
  -- nobody was told yet. Moving the class clears it: it was a different slot.
  notified_at TIMESTAMP    NULL,
  -- Where the class came from when it was moved; NULL means it never moved.
  moved_from_date  DATE    NULL,
  moved_from_start CHAR(5) NULL,
  -- NULL when cancelled, so the UNIQUE key below only guards active rows. The app
  -- writes it on every insert, status change and move: MariaDB refuses IF() and CASE
  -- in a GENERATED ALWAYS AS expression (error 1901), so the database cannot
  -- compute it. Value format: `YYYY-MM-DD#HH:MM`.
  slot_key    VARCHAR(20)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- A slot holds up to MAX_STUDENTS_PER_LESSON students (enforced by the API), and
  -- the same student cannot be booked twice into it. Cancelled rows have a NULL
  -- slot_key, so they never collide.
  UNIQUE KEY one_active_student_slot (owner_id, slot_key, student_id),
  KEY lessons_owner_date (owner_id, lesson_date),
  CONSTRAINT lessons_start_fmt CHECK (
    CHAR_LENGTH(start_time) = 5
    AND SUBSTR(start_time, 1, 2) BETWEEN '00' AND '23'
    AND SUBSTR(start_time, 3, 1) = ':'
    AND SUBSTR(start_time, 4, 2) BETWEEN '00' AND '59'
  ),
  CONSTRAINT lessons_status CHECK (status IN ('programada', 'confirmado', 'presente', 'ausente', 'cancelada')),
  CONSTRAINT lessons_student_fk FOREIGN KEY (student_id, owner_id)
    REFERENCES students (id, owner_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE court_settings (
  owner_id   CHAR(36) NOT NULL,
  start_hour INT      NOT NULL DEFAULT 8,
  end_hour   INT      NOT NULL DEFAULT 22,
  block_min  INT      NOT NULL DEFAULT 60,
  -- Optional daily break: the app works from start_hour to end_hour minus this gap
  -- (e.g. 8-17 with a 12-14 break). Both sides are set together.
  break_start INT     NULL,
  break_end   INT     NULL,
  -- Template for the bulk WhatsApp notices, with [nombre] [dia] [hora].
  -- NULL means "use the factory template", so a row saved before this column
  -- existed keeps working without a backfill.
  notice_template VARCHAR(400) NULL,
  PRIMARY KEY (owner_id),
  CONSTRAINT settings_start CHECK (start_hour BETWEEN 0 AND 23),
  CONSTRAINT settings_end CHECK (end_hour BETWEEN 1 AND 24),
  CONSTRAINT settings_block CHECK (block_min BETWEEN 15 AND 240),
  CONSTRAINT settings_range CHECK (end_hour > start_hour),
  CONSTRAINT settings_fit CHECK (block_min <= (end_hour - start_hour) * 60),
  -- Both sides are set together, so a bare break_start can never slip through:
  -- a CHECK is only violated by FALSE, and NULL would pass silently.
  CONSTRAINT settings_break CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (break_start IS NOT NULL AND break_end IS NOT NULL
        AND break_start > start_hour AND break_end < end_hour
        AND break_start BETWEEN 0 AND 23 AND break_end BETWEEN 1 AND 24
        AND break_end > break_start)
  ),
  CONSTRAINT settings_owner_fk FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Housekeeping: expired sessions are already invisible to every query (they all
-- filter on `expires_at > NOW()`), so this only keeps the table small.
-- Requires `event_scheduler=ON`, a server-wide setting that is not carried by this
-- file. If the scheduler is off the event silently does nothing, which is harmless.
CREATE EVENT IF NOT EXISTS purge_expired_sessions
  ON SCHEDULE EVERY 1 DAY
  DO DELETE FROM sessions WHERE expires_at < NOW();
