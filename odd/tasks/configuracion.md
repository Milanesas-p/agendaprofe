# Configuración: cuenta, horario con corte y modo oscuro

Objetivo: que el profesor vea su nombre arriba, y que pueda configurar la app desde un solo lugar: horario de trabajo partido (ej. 8–12 y 14–17), tema claro/oscuro y su cuenta.
Branch: `migracion-node-mysql` (sin push). Delivery: `ask-on-risk`. Runner: `npm test` (Vitest).

## Specs

- **S1 — El nombre arriba.** *"la parte de arriba que dice 'Mi cuenta', debería decir Nombre, Apellido del profesor"*. Criterio: la barra superior muestra nombre y apellido (o el correo hasta la arroba si no hay nombre) y una línea chica con `N alumnos · N clases hoy`. Tocar la barra abre Configuración. El nombre se guarda en `users.display_name` y se pide al crear la cuenta por CLI.
- **S2 — Horario partido.** *"configurar que horario hace (que pueda cortarlo), es decir trabajar de 8 a 12 y después de 14 a 17"*. Criterio: la jornada se define con apertura y cierre, más un **corte opcional** (desde/hasta). El modelo es ventana + corte: 8 a 17 con corte 12–14 genera 08, 09, 10, 11, 14, 15, 16. El corte tiene que caer en un borde de bloque y dentro de la jornada; si no, se rechaza. `slots()` es la única fuente: agenda, mover, reservar y recurrencia lo respetan sin cambios propios.
- **S3 — Modo oscuro.** *"modo oscuro"*. Criterio: Configuración ofrece Claro / Oscuro, se aplica al instante, se recuerda en el dispositivo y no destella en blanco al cargar (se aplica antes del primer render).
- **S4 — Una sola pantalla.** Horarios, apariencia y cuenta viven en `/configuracion`, accesible desde la barra superior. La hoja de bloques que estaba en la agenda se retira para no tener dos lugares donde se cambian las mismas horas.

## Modelo

`users` gana `display_name VARCHAR(120) NULL`. `court_settings` gana `break_start INT NULL` y `break_end INT NULL` con `CHECK`: o los dos son NULL o los dos están, dentro de la jornada e invertidos no. Ojo: un `CHECK` sólo falla con `FALSE`, y con `NULL` pasa, por eso la restricción exige `IS NOT NULL` explícito en la rama del corte configurado.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Esquema + migración aplicada (users.display_name, break_start/end + CHECK) | S1, S2 | inline | hecho · 4 filas de conteo intactas |
| T2 | `slots()` y `validSettings()` con corte | S2 | inline | hecho · 8 casos en `rules.test.ts` |
| T3 | Servidor: SettingsDto, readSettings, saveSettings, updateProfile | S1, S2 | inline | hecho · `src/server/data.ts` |
| T4 | Cuenta: AuthUser con nombre, CLI que lo pide, login y sesión | S1 | inline | hecho · `auth.ts`, `session-user.ts`, `accounts.ts`, `scripts/create-account.ts` |
| T5 | Store: Settings con corte, `updateProfile` | S1, S2 | inline | hecho · `src/lib/store.tsx` |
| T6 | Pantalla `/configuracion` con las tres secciones | S1, S2, S3, S4 | inline | hecho · `src/routes/configuracion.tsx` |
| T7 | Barra superior con nombre y resumen del día | S1 | inline | hecho · `src/components/Account.tsx` |
| T8 | Tema oscuro: paleta, persistencia y aplicación previa al paint | S3 | inline | hecho · `src/lib/theme.ts`, `styles.css` |

## Log

- **L1** — *"Deberiamos mejorar un poco la parte de arriba que dice 'Mi cuenta', deberia decir, Nombre, Apellido del profesor y alguna que otra info más que podria rescatar. Además estaria bueno que pueda configurar la app, por ejemplo, modo oscuro, configurar que horario hace (que pueda cortarlo), es decir trabajar de 8 a 12 y despues de 14 a 17"*.
- **L2** — Decisión de modelo: jornada + **corte**, no dos rangos independientes. Cubre el caso pedido con dos columnas nullable, no rompe las validaciones existentes y deja `slots()` como única fuente de verdad para agenda, mover, reservar y recurrencia.
- **L3** — Implementado. La migración se aplicó sin cambios de conteo (1 usuario, 2 alumnos, 11 clases, 1 fila de settings) y el `CHECK` se probó contra la base real: acepta `NULL/NULL` y `12–14`, y rechaza corte a medias, fuera de la jornada e invertido. Primera versión del `CHECK` **dejaba pasar el corte a medias** porque `NULL` no viola un `CHECK`; se corrigió con `IS NOT NULL` explícito antes de dar la migración por buena. `updateProfile` verificado con round-trip y rollback (`display_name` → `name` en el SELECT). 140 tests en 24 archivos, `tsc` limpio, build OK.
- **L4** — El resumen de la barra (`N alumnos · N clases hoy`) se calcula después de hidratar, igual que la fecha de la agenda: el día local no existe en el render del servidor y comparar dos "hoy" distintos rompería el markup.
