# Escalado a varios profesores

Objetivo: que la app aguante decenas o cientos de cuentas sin degradarse, sin cambiar lo que el profe ve hoy.
Estado: **en curso**. Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Throttle de login.** Después de 5 intentos fallidos seguidos en una ventana de 15 minutos, la cuenta queda bloqueada 15 minutos. El bloqueo se informa con un mensaje propio y no revela si el correo existe: `Demasiados intentos. Esperá unos minutos y volvé a probar.` Un login correcto resetea el contador. El bloqueo se calcula con el reloj de MySQL, no con el de Node.
- **S2 — Snapshot acotado.** `getSnapshot` deja de traer todas las clases desde el año cero: trae una ventana de **180 días atrás** y **120 días adelante** (`src/lib/lesson-window.ts`), decidida con el reloj de MySQL. La agenda no deja navegar fuera de la ventana (botones y selector de fecha acotados), así nunca queda un mes vacío que parezca data perdida. Nada se borra: las filas viejas siguen en la base.
- **S3 — Resumen de los últimos 6 meses.** Decisión del profe: `/resumen` cuenta la ventana y lo dice en pantalla (`Tomadas y ausencias de los últimos 6 meses.`). No se calculan totales históricos.
- **S4 — Sin cambios de contrato.** Las rutas, el store y los componentes siguen leyendo `lessons` como hoy; el recorte es de datos, no de forma.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Política pura de throttle + columnas en `users` + `loginUser` | S1 | hecho |
| T2 | Ventana de fechas en `getSnapshot` + agenda acotada | S2 | hecho |
| T3 | Resumen acotado con el período a la vista | S3 | hecho |

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

### L3 — decisión de S3 y cierre de T2/T3 (2026-11-13)

> "con lo ultimos 6 meses esta bien"

- Ventana: 180 días atrás y 120 adelante, resuelta por MySQL con DATE_SUB(CURDATE(), INTERVAL ? DAY) / DATE_ADD(...).
- La agenda deshabilita "Semana anterior"/"Semana siguiente" y acota el selector de fecha a la ventana; se calcula después de hidratar para no romper SSR.
- /resumen suma la nota del período; las cifras ahora son de la ventana, no históricas.
- Verificación: 250 tests (248 + 2 de 	our.test.tsx que pasan aislados: timeout conocido de 5s bajo carga), 	sc limpio, y la query nueva corrida contra la base real: 18 clases, las 18 dentro de la ventana.
- Límite aceptado: una clase movida más allá de los 120 días no vuelve a aparecer en la agenda hasta que entre en la ventana.
