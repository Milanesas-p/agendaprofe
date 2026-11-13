# Escalado a varios profesores

Objetivo: que la app aguante decenas o cientos de cuentas sin degradarse, sin cambiar lo que el profe ve hoy.
Estado: **en curso**. Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Throttle de login.** Después de 5 intentos fallidos seguidos en una ventana de 15 minutos, la cuenta queda bloqueada 15 minutos. El bloqueo se informa con un mensaje propio y no revela si el correo existe: `Demasiados intentos. Esperá unos minutos y volvé a probar.` Un login correcto resetea el contador. El bloqueo se calcula con el reloj de MySQL, no con el de Node.
- **S2 — Snapshot acotado.** `getSnapshot` deja de traer todas las clases desde el año cero: trae una ventana de fechas. Propuesta por defecto: **180 días atrás** y **120 días adelante** (las recurrentes se materializan hasta `HORIZON_DAYS = 28`; el resto son altas y movimientos manuales). Nada se borra: las filas viejas siguen en la base.
- **S3 — Resumen con totales reales.** Pendiente de decisión del profe: (a) mantener los totales históricos calculándolos en el servidor con agregados, o (b) mostrar el resumen de la ventana con un rótulo de período.
- **S4 — Sin cambios de contrato.** Las rutas, el store y los componentes siguen leyendo `lessons` como hoy; el recorte es de datos, no de forma.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Política pura de throttle + columnas en `users` + `loginUser` | S1 | hecho |
| T2 | Ventana de fechas en `getSnapshot` | S2 | pendiente de S3 |
| T3 | Resumen acorde a la ventana | S3 | pendiente de S3 |

## Log

### L1 — pedido original (2026-11-13)

> "Hasta cuantos profesores en simulteaneo crees que pueden usar la app? Cada uno con su usuario y contraseña? Me refiero a recursos, peso y demas"

> "si"

Contexto: el análisis encontró que el multiusuario ya está scopeado por `owner_id` y que los dos problemas reales son el payload sin techo de `getSnapshot` (`src/server/data.ts:221`) y la ausencia de throttle en el login.

### L2 — implementación de T1 (2026-11-13)

- Política pura en `src/lib/login-throttle.ts` (`nextFailures`, `LOGIN_MAX_FAILURES`, `LOGIN_WINDOW_MINUTES`), con tests propios.
- `users` suma `failed_logins`, `last_failed_at` y `locked_until` (`db/schema.sql`; aplicado a mano a la base local, como el resto de las migraciones).
- `loginUser` lee el estado con dos banderas calculadas por MySQL (`locked`, `stale`), corta antes de verificar la contraseña si está bloqueada, y escribe el resultado con `IF(...)` sobre el reloj de la base.
- Límite conocido: el throttle es por cuenta, no por IP. Un correo inexistente no se puede castigar por cuenta; la defensa de la enumeración sigue siendo el error genérico.
