# Clases con hasta 4 alumnos

Objetivo: un bloque horario deja de ser de un alumno y pasa a ser una clase con hasta 4, con asistencia por alumno y una agenda que no se desborde.
Branch: `migracion-node-mysql` (sin push). Delivery: `ask-on-risk`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Hasta 4 alumnos por clase.** *"El profesor puedo tener hasta 4 alumnos por clase"*. Criterio: se agregan alumnos a un mismo bloque hasta 4; el quinto se rechaza con `Esta clase ya tiene 4 alumnos.`; el mismo alumno no puede repetirse en el bloque (`Ese alumno ya está en esta clase.`). El tope se valida en el servidor, no sólo en la pantalla.
- **S2 — Asistencia por alumno en un toque.** *"Tanto para poner presente/ausente.."*. Criterio: cada alumno de la clase tiene ✓ y ✗ en su propio renglón; tocar el activo lo devuelve a `programada`; el saldo de cada alumno se mueve una sola vez por cambio de estado, igual que hoy.
- **S3 — Sin número de saldo en la agenda.** *"la parte de que dice +2 o 0, lo sacamos"* + *"que el alumno vaya y quede debiendo horas"*. Criterio: la agenda no muestra `+2` ni `0`; cuando el saldo es negativo aparece un punto rojo junto al nombre. El saldo completo sigue en Alumnos y Resumen.
- **S4 — Teléfono del alumno.** *"Sumemos el telefono si"*. Criterio: columna `phone` nullable en `students`; campo opcional en el editor de alumno; se guarda al crear y se edita al modificar; los alumnos existentes quedan sin teléfono.
- **S5 — La clase no se confunde con el horario siguiente.** *"para que no se junte tanto con el horario siguiente"*. Criterio: la hora vive en una columna fija fuera de la tarjeta y hay separación explícita entre bloques; una clase de un alumno ocupa menos alto que la tarjeta actual.
- **S6 — La deuda ya existe y no se le pone piso.** *"vamos a habilitar de que el alumno vaya y quede debiendo horas. Eso que lo pueda manipular el profesor"* / *"con + / - alcanza si"*. Criterio: no se agrega `CHECK >= 0` ni guardas de saldo; el profesor sigue ajustando de a ±1 desde Alumnos.
- **S7 — Reservar desde el editor de alumno respeta el tope.** Criterio: el selector de horarios ofrece bloques con menos de 4 alumnos activos y no ofrece los llenos.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Esquema: `students.phone` + unique `(owner_id, slot_key, student_id)` | S1, S4 | inline | hecho · `db/schema.sql` + ALTER aplicado a `padel` (filas intactas) |
| T2 | Regla compartida `MAX_STUDENTS_PER_LESSON` | S1 | inline | hecho · `src/lib/rules.ts` + 2 tests |
| T3 | Datos: teléfono en DTO/alta/edición; `addLesson` con tope y duplicado | S1, S4 | inline | hecho · `src/server/data.ts` + `src/lib/phone.ts` (3 tests) |
| T4 | Store: `Student` con teléfono | S4 | inline | hecho · `src/lib/store.tsx` |
| T5 | Agenda: tarjeta de clase multi-alumno con ✓/✗ y punto de deuda | S1, S2, S3, S5 | inline | hecho · `src/routes/index.tsx` + 7 tests |
| T6 | Agenda: vista semanal y horarios disponibles del editor | S1, S7 | inline | hecho · 3 tests en `student-booking` |
| T7 | Editor de alumno: campo teléfono | S4 | inline | hecho · `src/routes/alumnos.tsx` |
| T8 | Tests + verificación en Chrome real | S1–S7 | inline | hecho · 72 tests, build OK, 9/9 E2E + SQL |

## Log

- **L1** — *"El profesor puedo tener hasta 4 alumnos por clase, tenemos que buscar la manera de que le quede comodo a nivel visual. Tanto para poner presente/ausente.. y ademas para que no se junte tanto con el horario siguiente"*.
- **L2** — *"Mas adelante me gustaria agregar algo asi como un boton de wsp al lado de cada alumno como para que el dia previo el profe les pueda escribir para confimar la clase"* → queda para después; el renglón se diseña para admitir un tercer botón. El botón de la cabecera (avisar a los 4) es otro botón distinto y se decide en su momento.
- **L3** — *"Sumemos el telefono si, y la parte de que dice +2 o 0, lo sacamos. También vamos a habilitar de que el alumno vaya y quede debiendo horas. Eso que lo pueda manipular el profesor"* → el teléfono entra ahora (sin usarlo todavía) para no hacer dos migraciones sobre `students`. La deuda ya estaba habilitada: `db/schema.sql:29` no tiene `CHECK >= 0` y `src/server/data.ts:220` resta sin piso; se verificó y no se toca.
- **L4** — *"con + / - alcanza si"* → el ajuste de saldo sigue siendo ±1; no se agrega edición de saldo exacto.
- **L5** — Diseño acordado: la hora sale a una columna fija a la izquierda; cada alumno es un renglón con ✓ y ✗; cancelar deja de ser un botón fijo y pasa a la cabecera de la clase; el saldo numérico se va y queda un punto rojo sólo cuando debe.
- **L6** — Implementado y verificado. Migración aplicada a la base local sin perder filas (2 alumnos, 2 clases antes y después). El `UNIQUE` pasó de `(owner_id, slot_key)` a `(owner_id, slot_key, student_id)`, así que el tope de 4 lo valida la API y el duplicado lo corta la base. `addLesson` cuenta dentro de una transacción con `FOR UPDATE`. El teléfono se guarda como dígitos (`normalizePhone`), listo para `wa.me`. Cancelar quedó en la hoja que abre el nombre del alumno. Evidencia: 72 tests en 16 archivos, build `node-server`, y E2E en Chrome real 9/9 (dos alumnos en una clase, saldo sin número, punto de deuda, ＋ oculto con 4, marcar presente sólo afecta a ese alumno, teléfono que vuelve del editor) más verificación SQL: Ana 2→1, Beto siguió en −2, teléfono `5491100001111` guardado normalizado.
- **L7** — Verificación independiente: S1–S7 en PASS, cero blockers. Confirmó que el estado aplicado de la base coincide con `db/schema.sql` y que ampliar la clave única es seguro por construcción (la vieja es subconjunto estricto de la nueva). Dejó un hueco: no había test del rechazo del quinto alumno en el servidor, sólo del botón escondido. Se agregó `src/test/lesson-cap.test.ts` (4 tests) que ejecuta el handler real de `addLesson` con la base mockeada; se comprobó por mutación que falla si se quita la guarda. Total: 76 tests en 17 archivos. Advertencia pendiente de decisión: la hoja de "Reservar" de la agenda todavía muestra el saldo numérico de cada candidato (`index.tsx`), comportamiento previo a este cambio.
