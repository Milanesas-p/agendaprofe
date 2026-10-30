# Agenda con horarios desplegables y aviso de WhatsApp marcado

Objetivo: la agenda del día muestra todos los horarios como una lista cerrada; al tocar un horario se despliega con sus alumnos y sólo ahí se habilita la edición. Además, cada clase recuerda si el profesor ya le habló al alumno por WhatsApp.
Estado: **en curso**. Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Todos los horarios, cerrados.** *"que se muestren todos los horarios"*. La agenda del día lista **todos** los bloques configurados, uno por fila, cerrados. Cada fila dice la hora y un resumen: `2 alumnos`, `1 alumno` o `Libre`.
- **S2 — El horario se despliega con sus alumnos.** *"si el profesor selecciona un horario se le abra el desplegable con los alumnos"*. Tocar la fila la abre y muestra los alumnos de ese horario; tocarla de nuevo la cierra. Puede haber más de una abierta; abrir una no cierra las demás.
- **S3 — La edición vive adentro.** *"y recien ahi, se activa toda la edicion del horario"*. Con la fila cerrada no hay marcas, ni opciones, ni alta de alumno. Abierta aparecen: presente/ausente por alumno, opciones del alumno, recordatorio de WhatsApp y "Agregar alumno" cuando hay lugar.
- **S4 — Avisado por WhatsApp.** *"un boton donde diga, si ya le hablo al alumno o no tocando el boton de wsp"*. Tocar el botón de WhatsApp de un alumno abre el chat **y** deja la clase marcada como avisada; la fila lo muestra con un tilde. El estado se guarda en la base por clase, no en el dispositivo (AGENTS.md).
- **S5 — Se puede deshacer.** Desde las opciones del alumno se puede volver a "sin avisar". La marca no toca el saldo, la asistencia ni el estado de la clase.
- **S6 — Nada más cambia.** Semana, saldo, asistencia con descuento, mover y cancelar siguen igual. Al mover una clase a otro día/horario, la marca de avisado se limpia: es un aviso de otro horario.
- **S7 — Lo que ya existía sigue existiendo.** El resumen de la fila cerrada cuenta sólo clases no canceladas, igual que antes el encabezado de la tarjeta.
- **S8 — Deslizar el nombre confirma o libera.** *"Podriamos apretar al alumno y deslizar su nombre de izq o de derecha, para confirmar presencia o para dejar confirmando que no va"*. Deslizar el nombre hacia la derecha deja la clase en **confirmado** (el alumno avisó que va). Deslizar hacia la izquierda la deja **cancelada** (avisó que no va). Las dos cosas se pueden deshacer.
- **S9 — Nada descuenta solo.** Decisión del profesor: ni "confirmado" ni "cancelada" tocan el saldo. `presente` y `ausente` siguen siendo los únicos que consumen una clase, y se marcan a mano como hoy.
- **S10 — Los botones no se van.** El gesto es un atajo, no la única puerta: ✓ presente y ✗ ausente siguen en la fila, porque un deslizamiento no se descubre solo. Desde las opciones también se puede quitar la confirmación.

## Datos

- `lessons.notified_at TIMESTAMP NULL`, aplicada a mano a la base local; `db/schema.sql` es el esquema canónico.
- `LessonDto`/`Lesson` ganan `notified: boolean` (`notified_at IS NOT NULL`).

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Columna `lessons.notified_at` + `schema.sql` + migración local | S4 | hecho |
| T2 | Snapshot con `notified` y `setLessonNotified` en el servidor | S4, S5 | hecho |
| T3 | `setNotified` en el store | S4, S5 | hecho |
| T4 | Lista desplegable de horarios en la agenda | S1, S2, S3, S7 | hecho |
| T5 | Botón de WhatsApp que marca avisado y opción de deshacer | S4, S5, S6 | hecho |
| T6 | Tests de los dos comportamientos y verificación en Chrome real | S1-S7 | hecho |
| T7 | Estado `confirmado` en la base, las reglas y el servidor | S8, S9 | hecho |
| T8 | Deslizamiento del nombre con deshacer | S8, S10 | hecho |
| T9 | Tests del deslizamiento y del saldo intacto | S8, S9, S10 | hecho |

## Log

- **L4** — Implementado y probado en Chrome real a 420px con la base del profesor y restaurada al terminar. Cerrada: los 9 bloques del día se listan con "1 alumno" / "Libre". Abierta la de 08:00 aparecen el alumno, el recordatorio y "Agregar alumno". Tocar el botón de WhatsApp abrió el chat y dejó `notified_at` escrito en la base, con la fila pasando a "Ya le avisaste a Maxi Salas". Deslizar el nombre a la derecha dejó `confirmado` en la base, el tilde "va" en la fila y el aviso con "Deshacer"; a la izquierda dejó `cancelada` y el bloque pasó a "Cancelada". 209 tests en 30 archivos, `tsc` limpio, build OK.
- **L4 (decisiones menores)** — El gesto se mide con punteros y `touch-action: pan-y`, así el deslizamiento vertical de la página sigue mandando; un arrastre menor a 56px no hace nada y el clic que sigue a un arrastre se descarta para no marcar asistencia sin querer. La fila muestra una sola etiqueta (estado o perfil) para que el nombre nunca se corte.
- **L3** — Ideas nuevas del profesor: *"estaria bueno también, buscar la manera de dejar al alumno en el caso de que te confirme, dejarlo confirmado. Podriamos apretar al alumno y deslizar su nombre de izq o de derecha, para confirmar presencia o para dejar confirmando que no va/no puede ir?"*. Decisión sobre el saldo: **"Nada descuenta solo"** — `confirmado` y `cancelada` no tocan el saldo; `ausente` sigue descontando a mano.
- **L2** — Alcance aclarado por el profesor: *"que se muestren todos los horarios y si el profesor selecciona un horario se le abra el desplegable con los alumnos y recien ahi, se activa toda la edicion del horario y eso"*. Se descartó cambiar la configuración de horarios: el cambio es cómo se ve y se edita la agenda.
- **L1** — *"Otra cosa, creo que va ser mejor tener los horarios tipo lista, que el profesor, apete un horario y les marque los alumnos, y recien ahí, pueda editar clase/horario. Además deberiamos agregar un boton donde diga, si ya le hablo al alumno o no tocando el boton de wsp"*.
