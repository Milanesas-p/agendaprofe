# Deshabilitar alumnos (pausa indefinida)

Feature: un alumno se puede deshabilitar (por ejemplo en verano) sin perder historial ni saldo, y reactivar después. Mientras está inactivo no ocupa la agenda.
Branch: migracion-node-mysql. Delivery: ask-on-risk. Runner: `npx vitest run`.

## Specs

- **S1** — El alumno tiene un estado persistido `active` (`students.active TINYINT(1) NOT NULL DEFAULT 1`). Todos los alumnos existentes quedan activos al aplicar la migración. El snapshot y el store lo exponen como `active: boolean`.
- **S2** — Deshabilitar un alumno corre en **una sola transacción**: marca `active = 0`, borra sus clases **futuras** (`lesson_date > hoy`) que estén `programada` o `confirmado` (el cupo queda libre) y deja `last_generated = ayer` en sus `student_slots`, para que al reactivar se regenere desde hoy. No toca clases pasadas, `presente`/`ausente`, clases canceladas a mano, el saldo ni los horarios semanales.
- **S3** — Un alumno inactivo no participa de la materialización: no se le generan clases nuevas ni al abrir la app, ni al guardar horarios, ni al reactivar. La validación de jornada contra horarios fijos ignora a los inactivos.
- **S4** — Reactivar un alumno corre en la misma transacción que el cambio de estado y vuelve a materializar sus horarios fijos desde hoy, respetando el cupo y los conflictos ya existentes.
- **S5** — Los alumnos inactivos no se ofrecen en "Nueva clase" ni en las sugerencias de la agenda.
- **S6** — El directorio de Alumnos muestra la marca "Inactivo" y un filtro para verlos; el editor de alumno tiene un switch "Alumno activo" para deshabilitarlo o reactivarlo.
- **S7** — Importar la planilla no cambia el estado de un alumno existente (un inactivo sigue inactivo) y los alumnos nuevos nacen activos.
- **S8** — El saldo y el historial no cambian al deshabilitar ni al reactivar (deshabilitar no genera movimientos de saldo).

## Tasks

| ID | Qué | Specs | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Columna `active`, migración, snapshot y tipos del store | S1 | inline | hecho — `db/migrations/2026-11-25-students-active.sql` |
| T2 | Transición deshabilitar/reactivar en `updateStudent` (transacción, borrado de futuras, top-up al reactivar) | S2, S3, S4, S8 | inline | hecho — RED 7 → GREEN 7 |
| T3 | Materialización y validación de jornada ignoran inactivos | S3 | inline | hecho — query con `s.active = 1` en ambos caminos |
| T4 | Sugerencias y "Nueva clase" excluyen inactivos | S5 | inline | hecho — tests de sugerencias y nueva-clase |
| T5 | UI: switch en el editor, marca y filtro "Inactivos" en el directorio | S6 | inline | hecho — tests de directorio |
| T6 | Import respeta el estado existente | S7 | inline | hecho — UPDATE sin `active` |
| T7 | Tests, suite completa, `tsc` y lint | S1-S8 | inline | hecho — 450/450 tests, `tsc` limpio |

## Log

- **L1** — *"agreguemos una opcion para poder "deshabilitar" a los alumnos. existen situaciones como por ejemplo el verano en el cual hay alumnos que no van a clase por un tiempo indeterminado"*.
- **L2** — Decisión del usuario (2026-11-25): al deshabilitar, **liberar el cupo** de las clases futuras; el horario semanal, el historial y el saldo quedan intactos, y al reactivar se vuelve a agendar desde ese momento.
- **L3** — Decisión de implementación: para que reactivar restaure la agenda sin resucitar clases que el profesor canceló a propósito, el deshabilitado **borra** solo las clases futuras `programada`/`confirmado` (nunca tocó asistencia ni historial) y retrocede `last_generated` a ayer. Las canceladas a mano se preservan y siguen bloqueando su fecha.
- **L4** — Implementación inline. `students.active` + migración; `getSnapshot` y `Student` exponen `active`; `updateStudent` lee el estado con `FOR UPDATE`, actualiza en la misma transacción, borra futuras al deshabilitar y materializa al reactivar; `materializeOn` y la validación de jornada filtran `s.active = 1`; sugerencias y "Nueva clase" excluyen inactivos; el editor tiene el switch "Alumno activo" y el directorio marca y filtra "Inactivos". `importStudents` no toca `active`. Tests nuevos: `student-active.test.ts` (7), sugerencias, directorio, editor, nueva clase e import. Suite 448/448, `tsc` limpio.
- **L5** — Operación: antes de desplegar hay que aplicar `db/migrations/2026-11-25-students-active.sql` en la base real; sin la columna el snapshot falla.
- **L6** — Verificación independiente (base `0fe1814^`, candidato `0fe1814`): S1, S2, S4-S8 cumplidas; un blocker en S3: la validación de jornada del cliente (`store.tsx`) seguía mirando a los alumnos inactivos, así que pausar a alguien no liberaba el achicado de la jornada aunque el servidor sí. Corregido en `db0cc1d` con el filtro `active !== false` y la regresión `src/test/settings-paused-student.test.tsx` (RED → GREEN). Recheck del blocker en verde; suite final 450/450 y `tsc` limpio. Avisos no bloqueantes: reactivar no informa conflictos de cupo, y `addLesson` no rechaza inactivos en el servidor (la exclusión es de UI).
