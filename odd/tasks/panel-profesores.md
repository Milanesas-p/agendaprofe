# Panel de profesores (operador)

Objetivo: que el operador dé de alta, resetee la clave y suspenda cuentas de profesores desde la app, sin consola ni SQL.
Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest). Entrega: commits por unidad en la rama; push/PR queda a decisión del usuario.

## Specs

- **S1 — Rol y estado en `users`.** `role ENUM('profe','admin') NOT NULL DEFAULT 'profe'` y `active BOOLEAN NOT NULL DEFAULT 1`. Migración en `db/migrations/2026-11-20-users-role-active.sql` y `db/schema.sql` al día. Las cuentas existentes quedan `profe` y activas.
- **S2 — Suspender corta el acceso.** Una cuenta con `active = 0` no puede iniciar sesión: el login responde `Esta cuenta está suspendida.` (decisión del operador, no se oculta el motivo). Una sesión ya abierta deja de resolver en `findSessionUser`, así que al siguiente request queda afuera.
- **S3 — Panel solo para admin.** Ruta `/admin` y sus server functions exigen `role = 'admin'` en el servidor; el resto recibe `No tenés permiso para ver esta pantalla.` El enlace de navegación solo aparece para un admin. Sin rol admin las funciones no escriben nada.
- **S4 — Alta de profe.** Email, nombre y clave inicial. Reusa `createAccount` (normaliza email, valida clave, scrypt). El alta crea siempre `role = 'profe'` y `active = 1`. Un correo repetido devuelve `Ese correo ya está registrado.`
- **S5 — Reset de clave.** Reusa `resetAccountPassword`: cambia el hash y revoca todas las sesiones de esa cuenta.
- **S6 — Suspender y reactivar.** Alterna `active` y, al suspender, revoca las sesiones abiertas. El admin no puede suspenderse a sí mismo: `No podés suspender tu propia cuenta.`
- **S7 — Listado con uso.** Cada fila: email, nombre, rol, estado, cantidad de alumnos, clases de los últimos 30 días y último ingreso (`MAX(sessions.created_at)`; el logout borra la fila, así que es una aproximación y se rotula como tal).
- **S8 — Sin acceso a datos ajenos.** El panel gestiona cuentas, no alumnos ni clases: no se agrega ninguna vía para que un admin lea o edite la data de otro profe. El aislamiento por `owner_id` no cambia.
- **S9 — Primer admin.** `npm run make-admin -- <email>` promueve una cuenta existente a admin (y la reactiva). Sin eso no hay forma de entrar al panel.
- **S10 — Regresión.** Login, throttle, sesiones, alumnos, agenda y configuración siguen comportándose igual para las cuentas `profe`. Unidad que toca `users` o `sessions` suma su test de comportamiento previo.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Esquema `role`/`active` + `AuthUser.role` + login y sesión respetan `active` | S1, S2, S10 | inline | hecho (`10ac8b4`) |
| T2 | `src/server/admin.ts`: `requireAdmin`, listado, alta, reset, suspender/reactivar | S3-S7 | inline | hecho (`434e780`) |
| T3 | Ruta `/admin` + UI + enlace de navegación solo para admin | S3, S7 | inline | hecho (`d6806f9`) |
| T4 | Script `make-admin` + README | S9 | inline | hecho (`3c773b6`) |

Forecast: ~650 líneas autoradas (código + tests + docs). Estrategia de entrega: `ask-on-risk`.

## Log

### L1 — pedido original (2026-11-20)

> "Me estoy dando cuenta que tendriamos que crear un panel para poder administradar los profesores"

> "para yo manejarlos"

> "1"

Contexto: la opción 1 es rol admin en la cuenta propia, no una pantalla con clave aparte. Hoy las cuentas solo se crean y resetean por consola (`npm run create-account`, `npm run reset-password`) y `users` no tiene rol ni estado.
### L2 — implementación (2026-11-20)

- T1: migración 2026-11-20-users-role-active.sql aplicada a la base local; indSessionUser filtra u.active = 1 y devuelve ole; el login corta antes de verificar la clave con Esta cuenta está suspendida.
- T2: src/server/admin.ts con equireAdmin() en cada endpoint. Listado con alumnos, clases de los últimos 30 días y último ingreso (MAX(sessions.created_at), aproximado porque el logout borra la fila).
- T3: /admin + entrada en la barra lateral y acceso desde Configuración, ambos solo para admin. La página se cierra sin llamar al servidor si el rol no es admin.
- T4: 
pm run make-admin -- <email>; genaro.stocco195@gmail.com quedó como admin en la base local.
- Verificación: 434 tests; build de producción compila; migración aplicada a mano a padel.
- Pendiente operativo: aplicar la migración en phpMyAdmin de producción ANTES de subir el build (el login nuevo consulta ctive y ole).