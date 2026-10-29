# Ficha del alumno: reserva solo para fijos, horario visible y perfil de jugador

Objetivo: que el editor de alumno no ofrezca reservar una clase a un rotativo, que el horario fijo se vea sin abrir el editor, y que el alumno tenga categoría y posición.
Branch: `migracion-node-mysql` (sin push). Delivery: `ask-on-risk`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Reservar desde el editor es solo para fijos.** *"Estaria bueno que esa opcion solo aparezca cuando el alumno es Fijo, si es rotatito no"*. Criterio: el switch "Agregar clase a la agenda" solo existe con `type === "fijo"`. Si se elige fecha y hora y después se pasa el alumno a rotativo, esa reserva no se hace y el botón vuelve a "Guardar".
- **S2 — El horario fijo se ve en la lista.** *"en la configuracion del alumno una vez colocado el turno, se quede guardada esa configuración"* + elección explícita de mostrarlo en la lista. Criterio: cada alumno con día y hora muestra un tag `Viernes 14:00` junto a `FIJO` y `MENSUAL`; sin horario no aparece nada. El horario ya se persistía en `students`; esto lo hace visible.
- **S3 — Categoría y posición como listas fijas.** *"me gustaria que en la informacion del jugador, aparezca la categoria y la posición"* + *"Las dos como lista fija"*. Criterio: categoría ∈ {1ra…8va}, posición ∈ {Drive, Revés, Indistinto}, ambas opcionales. Se eligen del editor, se guardan en `students.category` / `students.court_side` y se ven como tag en la lista. Un valor fuera del conjunto lo rechaza la app y también un `CHECK` en la base.

## Modelo

`students` gana dos columnas nullable: `category VARCHAR(8)` y `court_side VARCHAR(12)`. Los tokens se guardan sin acentos (`reves`) y las etiquetas las pone la UI (`Revés`), igual que `type` guarda `fijo` y no `Fijo`. Las listas viven en `src/lib/player.ts`, compartidas por cliente y servidor, y están duplicadas como `CHECK` en `db/schema.sql` para que la base no dependa de la app.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Switch de reserva solo para `fijo`, derivado para que no se reserve al cambiar de tipo | S1 | inline | hecho · `src/routes/alumnos.tsx` + 2 tests |
| T2 | Horario fijo como tag en la lista | S2 | inline | hecho · `fixedSlot()` + 2 tests |
| T3 | `src/lib/player.ts` con las listas y etiquetas compartidas | S3 | inline | hecho · 2 tests |
| T4 | Esquema + migración aplicada a `padel` | S3 | inline | hecho · 2 columnas + 2 `CHECK`, filas intactas |
| T5 | Datos: DTO, alta y edición del perfil | S3 | inline | hecho · `src/server/data.ts` |
| T6 | Store + editor + tags de la lista | S1, S2, S3 | inline | hecho · `src/lib/store.tsx`, `alumnos.tsx` |
| T7 | Tests del editor y de la lista | S1, S2, S3 | inline | hecho · 115 tests en 21 archivos, build OK |

## Log

- **L1** — *"Estaria bueno que esa opcion solo aparezca cuando el alumno es Fijo, si es rotatito no"*.
- **L2** — *"me gustaria que en la configuracion del alumno una vez colocado el turno, se quede guardada esa configuración"* → aclarado con una pregunta: se verificó que el horario fijo **ya se persiste** y se eligió mostrarlo en la lista de alumnos para que la configuración quede a la vista sin abrir el editor.
- **L3** — *"otra cosa, me gustaria que en la informacion del jugador, aparezca la categoria y la posición"* → *"Las dos como lista fija"*. Categoría 1ra–8va; posición Drive / Revés / Indistinto, asumiendo que "posición" es el lado de la cancha.
- **L4** — Implementado y verificado. RED→GREEN en los tres frentes. La migración se aplicó sobre la base local con las filas intactas (2 alumnos, 10 clases y los mismos IDs antes y después) y se comprobó que el `CHECK` rechaza `category = '9na'` con `ER_CHECK_CONSTRAINT_VIOLATED`, que un valor válido se acepta, y que un `ROLLBACK` deja la fila en `NULL`. El `SELECT` real de `getSnapshot` devuelve las dos columnas nuevas. 115 tests en 21 archivos, `tsc` limpio, build `node-server`. Riesgo residual: ninguna acción — las columnas son nullable y aditivas, así que un alumno sin perfil se comporta como antes.
- **L5** — *"creo que lo de semanal y mensual esta de más en la parte del inicio, en la data del alumno. No es tan importante como la posicion, categoria. Eso si lo deberiamos agregar en la parte de agendas"* → decisión de producto (preguntada y confirmada): **"En la fila y también al tocar"**. `pay` sale de la fila de alumnos (sigue en el editor: es dato de facturación, no de cancha). Categoría y posición se muestran en el renglón de la agenda como sufijo chico y gris después del nombre (`Maxi Salas · 4ta · Revés`), y la hoja que abre el nombre suma una línea con perfil y horario fijo (`4ta · Revés · Viernes 14:00`), sin reemplazar la línea de fecha · hora · estado. No se agrega el saldo numérico a la hoja: sigue vigente la decisión L5 de la ficha de clases múltiples (sólo punto rojo). `weeklySlotLabel` y `WEEKDAYS` se movieron a `src/lib/agenda.ts` para no tener tres copias de los días. 119 tests en 21 archivos, `tsc` limpio, build OK.
