# Migración Lovable/Supabase → Node + MySQL

Objetivo: sacar Lovable del proyecto y migrar backend y datos a un servidor Node propio con MySQL local.
Branch: `main` (sin push a remoto hasta que el usuario lo decida). Runner: `npm test` (Vitest).

## Specs

- **S1** — Erradicar Lovable: *"necesito que elimines todo lo relacionado a lovable"*. Criterio: cero referencias en código, config y lockfile; `Account.tsx` conserva email/contraseña.
- **S2** — *"empecemos a migrar todo a mysql y node.js"*. Criterio: el esquema de datos vive en MySQL (`db/schema.sql`) y el acceso a datos pasa por un servidor Node propio, sin PostgREST ni RLS.
- **S3** — *"vamos a empezar ejecutar el sistema desde local"*. Criterio: `npm run dev` levanta la app contra MySQL local; build con preset `node-server`.
- **S4** — Login propio con **email + contraseña** (confirmado por el usuario con "si"). Criterio: registro, login, logout y sesión persistida en cookie httpOnly; contraseñas con hash scrypt; el token de sesión se guarda hasheado.
- **S5** — El saldo (`balance`) se mueve en una transacción del servidor al marcar asistencia y al ajuste manual. Criterio: no hay doble descuento ni actualización perdida.
- **S6** — Ninguna query puede devolver filas de otro dueño: el `owner_id` sale siempre de la sesión, nunca del cliente.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Desacoplar Lovable (config, integraciones, docs, lockfile) | S1 | inline | hecho · commit pendiente |
| T2 | Esquema MySQL + constraints verificadas | S2 | inline | hecho · 11 asserts OK |
| T3 | Pool de conexión MySQL | S2 | inline | hecho · `src/server/db.ts` |
| T4 | Hash scrypt de contraseñas | S4 | inline | hecho · `src/server/password.ts` + 4 tests |
| T5 | Tokens de sesión hasheados | S4 | inline | hecho · `src/server/session.ts` + 3 tests |
| T6 | Server functions de auth (registro/login/logout/me) | S4 | inline | hecho · `src/server/auth.ts` |
| T7 | Endpoints de datos: alumnos, clases, horarios, saldo | S2, S5, S6 | hecho · `src/server/data.ts` + verificación con SQL real |
| T8 | Reescribir `store.tsx` y `Account.tsx` contra la API propia | S3, S4 | hecho · sin Supabase en el cliente |
| T9 | Borrar `src/integrations/supabase/*`, `supabase/`, `.env` viejo | S2 | hecho · 0 referencias a supabase/lovable/drizzle |
| T10 | Verificación end-to-end local | S3 | hecho · registro, alta de alumno, reserva y presente con descuento de saldo, probado por el usuario |
| T11 | Purga automática de sesiones vencidas | S4 | hecho · `EVENT purge_expired_sessions` diario en `db/schema.sql`, verificado con un evento temporal de 1 s |

## Log

- **L1** — *"Termina con lo del saldo inicial, despues yo creo y pruebo"* → resultó que ya estaba implementado en `2ff8a2a`; sólo se marcó el roadmap.
- **L2** — *"Necesito que hagamos un analisis completo del proyecto, necesito que elimines todo lo relacionado a lovable y empecemos a migrar todo a mysql y node.js. Además vamos a empezar ejecutar el sistema desde local"*.
- **L3** — *"resolvemos primero lo de mysql"* → se creó la base `padel`, usuario dedicado y `db/schema.sql`; root no tenía contraseña conocida y se reseteó.
- **L4** — *"vamos con S0 primero"* → T1 cerrado. Único cambio de comportamiento deliberado: el build pasa de `cloudflare-module` a `node-server`.
- **L5** — *"si"* a "auth propia + endpoints sobre MySQL con email + contraseña" → T3–T6 implementados.
- **L6** — *"funciona tambien"* → verificación end-to-end en navegador: registro, alta de alumno con clases pagadas, reserva y marcado de presente con descuento de saldo. T10 cerrado. Todo commiteado en la rama `migracion-node-mysql`, sin pushear.
- **L7** — *"1. Vamos a seguir desde local, no tocamos lovable"* / *"2. Dejalo como lo proximo a resolver y 3. Tenemos que ver la manera de resolverlo automatico a eso"* → se sigue en rama, `main` intacto. Purga de sesiones resuelta con un `EVENT` diario de MySQL (el scheduler de esta instalación ya está en `ON`); validado con un evento temporal de 1 segundo: borra las vencidas y conserva las vigentes. Recuperación de contraseña queda como próximo pendiente.
