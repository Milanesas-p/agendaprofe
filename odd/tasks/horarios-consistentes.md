# Horarios consistentes: la jornada manda también del lado del servidor

Feature: la invariante "todo horario fijo dentro de los bloques tiene clases hasta +28 días" deja de depender del cliente.
Branch: migracion-node-mysql. Delivery: ask-on-risk. Runner: `npx vitest run`.

## Specs

- **S1** — Guardar los horarios materializa los horarios fijos **dentro de la misma transacción** del servidor: `saveSettings` valida, escribe la jornada y llama a la materialización antes del commit, devolviendo el `MaterializeResult`. El cliente ya no necesita un segundo viaje para completar la agenda.
- **S2** — La validación de la jornada mira la fuente de verdad, no el derivado: si algún horario fijo (`student_slots` de alumnos `fijo`) queda fuera de los bloques nuevos, se rechaza el guardado **nombrándolos**, aunque ese horario no tenga lecciones generadas. El cliente aplica la misma regla con un helper puro compartido.
- **S3** — Un conflicto de materialización declara su causa (`reason: "full" | "outside-blocks"`) y cada mensaje dice la causa real. Guardar los horarios muestra los conflictos en vez de tragárselos.
- **S4** — Se preserva el comportamiento existente: generación monotónica desde `last_generated` (mover o cancelar nunca se recrea), tope de 4 alumnos por bloque con lock `FOR UPDATE` antes del snapshot, y el top-up del arranque de la app.
- **S5** — Los mensajes nuevos respetan el texto del usuario: "fuera de la jornada configurada" vs "la clase está llena" (no se inventan requisitos nuevos).

## Tasks

| ID | Qué | Specs | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Motivo del conflicto (`reason`) y mensajes que distingan bloque lleno de horario fuera de la jornada | S3 | inline | hecho — RED→GREEN, 347 tests |
| T2 | Helper puro compartido + validación de la jornada contra `student_slots` en el servidor y espejo en el cliente | S2 | inline | hecho — RED→GREEN, 46 tests en los 4 archivos tocados |
| T3 | Materialización dentro de la transacción de `saveSettings`, resultado con conflictos y cliente sin segundo viaje | S1, S4 | inline | hecho — suite 358 tests, `tsc` limpio |
| T4 | Verificación independiente (riesgo 4: concurrencia/orden transaccional) + suite y `tsc` | S1-S5 | delegated | hecho — 5/5 specs, 0 blockers, probes commiteados |

## Log

- **L1** — *"si, vamos con todo"*, autorizando las tres capas propuestas en la inspección: **A (recomendado)**: extraer el núcleo de `materializeRecurring` para que acepte una conexión y llamarlo dentro de la misma transacción de `saveSettings`. **B**: validar contra `student_slots` además de `lessons`, y decir qué alumnos quedan afuera. **C**: agregar `reason: "fuera-de-bloques" | "lleno"` al conflicto y mostrar el mensaje correcto; surfacear conflictos al guardar horarios.
- **L2** — Causa raíz investigada antes de empezar (ver observación Engram #223): omisión en 5b316c5, invariante orquestado por el cliente, validación contra filas derivadas, conflictos sin motivo y silencio del helper.
- **L3** — Implementación inline en dos work units. T1 (`891da7c`): `RecurringConflict.reason` + `conflictsMessage` en el store; RED de 3 tests antes del cambio. T2+T3: `FixedSlot`, `fixedSlotsOutsideBlocks` y `outsideBlocksMessage` en `src/lib/rules.ts`; `materializeOn(connection, …)` extraído de `materializeRecurring`; `saveSettings` valida contra `student_slots`, escribe la jornada y materializa dentro de la misma transacción, devolviendo `MaterializeResult`; el cliente rechaza localmente con el mismo helper y muestra los conflictos que vuelven del guardado, sin segundo viaje. RED de 11 tests, luego GREEN: 358 tests en 46 archivos y `tsc` limpio.
- **L4** — `Risk: item 4` (concurrencia/orden transaccional): la materialización se suma a la transacción del guardado y ambos caminos toman `FOR UPDATE` sobre los bloques. Verificación independiente delegada (T4) además de la suite propia.
- **L5** — Verificación independiente (commit base `d005b70`, candidato `891da7c..6624188`): 5/5 specs cumplidas, 0 blockers. Confirmó con probes propias una sola conexión/transacción, rollback conjunto de jornada y clases, idempotencia al guardar dos veces, marcador `last_generated` que nunca retrocede, y el `FOR UPDATE` antes de cada INSERT. Dos avisos no bloqueantes: (a) el mensaje de rechazo decía "fuera de la jornada" y los toasts "fuera de la jornada configurada" — se unificó al texto canónico (S5); (b) un `last_generated` malformado reinicia la generación a hoy, comportamiento heredado del baseline. Los probes del verificador se commitean como regresión en `src/test/settings-save-transaction.test.ts` y `src/test/settings-toasts.test.tsx`; suite final 376 tests en 48 archivos, `tsc` limpio.
