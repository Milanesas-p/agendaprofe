# Pixel Perfect Match

Class schedule, students and credit balance for a padel coach. Mobile first.

## Stack

- React 19 + TanStack Start / TanStack Router (SSR)
- Tailwind CSS 4 + shadcn/ui (Radix)
- Supabase (Postgres + Auth) — in migration to MySQL 8 + a Node API
- Vitest

## Development

Requires Node.js 22+ and a local MySQL 8 server.

```sh
npm install
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Test suite |
| `npm run build` | Production build (Node server output in `.output/`) |
| `npm run lint` | ESLint |
| `npm run create-account` | Creates a teacher account (asks for the password) |
| `npm run reset-password` | Replaces a password and revokes that account's sessions |
| `npm run make-admin` | Promotes an existing account to operator (role `admin`) |

## Database

The MySQL schema lives in `db/schema.sql`. Apply it to an empty database:

```sh
mysql -u padel -p padel < db/schema.sql
```

## Accounts

Accounts are provisioned by the operator, not by self-registration.

- A new account starts as `role = 'profe'` and active.
- `npm run make-admin -- <email>` promotes an existing account to `admin`: that is
  the only role that opens `/admin`, where the operator creates teachers, resets
  their password and suspends or reactivates them.
- `active = 0` parks an account: the login is refused and an open session stops
  resolving on the next request.
- The panel manages accounts only. Students and classes stay isolated per owner
  (`owner_id`); an admin never reads another teacher's data.