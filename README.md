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

## Database

The MySQL schema lives in `db/schema.sql`. Apply it to an empty database:

```sh
mysql -u padel -p padel < db/schema.sql
```
