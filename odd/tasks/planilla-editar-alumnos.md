# Editar alumnos desde la planilla descargada

Objetivo: que la plantilla .xlsx venga pre-cargada con los alumnos actuales, y que al volver a subirla se **actualicen** esos alumnos en vez de duplicarlos.
Estado: **implementado** (T1-T4). Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest, jsdom).

## Specs

- **S1 — La descarga trae los alumnos.** Una fila por alumno con nombre, teléfono, tipo, pago, categoría, posición, día y hora, más una columna `id` al final que lo identifica. El saldo no se exporta.
- **S2 — El `id` decide.** Fila con `id` existente: actualiza ese alumno. Fila sin `id`: crea uno nuevo. Un `id` que no existe o es de otro profe es un error de fila, nunca un alta nueva.
- **S3 — Sin repetidos.** El mismo `id` dos veces en la planilla marca la segunda fila como error; el servidor rechaza el lote entero.
- **S4 — El saldo y las clases no se tocan.** Ni la planilla ni la actualización escriben `balance`; las clases ya agendadas quedan como están.
- **S5 — Borrar una fila no borra al alumno.** La plantilla edita, no reemplaza el directorio.
- **S6 — Previsualización clara.** Cada fila dice si crea o actualiza, y el resumen cuenta nuevos, a actualizar y con problemas.
- **S7 — La plantilla en blanco sigue.** Sin alumnos, se descarga sólo con títulos y desplegables. Pegar texto y subir CSV no cambian.
- **S8 — Todo o nada.** Las actualizaciones y las altas van en una transacción: si una fila falla, no se escribe ninguna.
- **S9 — Un alumno nuevo se agrega con el `id` vacío.** La ayuda de la pantalla lo dice, para que copiar una fila no pise a otro alumno.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Parser: columna `id`, ids conocidos y repetidos + tests | S2, S3, S9 | hecho · `src/lib/import.ts` + 9 casos |
| T2 | Servidor: UPDATE por dueño, INSERT sin `id`, sin tocar saldo + tests | S2, S4, S8 | hecho · `src/server/data.ts` + `import-update.test.ts` (9 casos) |
| T3 | Descarga pre-cargada (columna `id`, etiqueta de día) + tests | S1, S7 | hecho · `src/lib/xlsx.ts` + `importar.test.tsx` |
| T4 | Pantalla: previsualización "Actualiza", resumen y ayuda + tests | S6, S9 | hecho · `src/routes/importar.tsx` |

## Log

- **L1** — *"Estaria bueno si es posible, si"*: el profe quiere que la descarga venga con los alumnos actuales para editarlos y volver a subirlos. Sin columna `id` el re-upload duplicaría, así que la llave viaja en la planilla.
- **L2** — Decisión: el `id` va en la **última** columna (no escondido) y el saldo queda afuera de la planilla. Borrar una fila no elimina al alumno. Una fila con `id` desconocido se rechaza en vez de crear un duplicado.
- **L3** — Verificación independiente (`gentle-ai-verify`): S1-S9 en PASS, cero blockers. Avisos corregidos: el validador del server ahora compara ids sin distinguir mayúsculas (MySQL también) y el resumen dice "1 nuevo". 285 tests en 38 archivos, `tsc` limpio, build OK. El .xlsx pre-cargado se abrió con Excel 16 por COM: títulos con `id` al final, fila con el id como texto (`@`), desplegables intactos en `tipo` y `hora`.
- **L4** — Aviso aceptado sin cambio: un archivo descargado **antes** de esta feature no trae columna `id`, así que subirlo crea alumnos nuevos. Es lo que pide S2; la ayuda de la pantalla indica volver a descargar.
