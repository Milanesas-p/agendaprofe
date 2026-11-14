# Planilla real de Eze: horarios múltiples y pago sin definir

Objetivo: cargar la planilla real del profe (`C:\Users\genar\Downloads\AlumnosEze.xlsx`, 62 alumnos) sin perder días ni inventar datos: varios horarios semanales por alumno, horarios "habituales" para los no fijos, y pago vacío cuando la planilla lo deja vacío.
Rama: `migracion-node-mysql`. Entrega: commits por work unit. Runner: `npx vitest run`.

## Specs

- **S1** — `students.pay` acepta `NULL`. Un `pago` vacío en la planilla se guarda como `NULL` y la app muestra **"Sin definir"**. No se completa "Mensual" por defecto. _(pedido textual: "Los que no tiene pago mensual, son los que pagan individual o grupal... Eso lo dejalo vacio si es posible")_
- **S2** — Un alumno tiene N horarios semanales (`student_slots`). Los `fijo` se agendan solos en **todos** sus horarios; los horarios de un `rotativo` son **habituales** y **nunca** se agendan solos. _(respuesta: "Varios horarios por alumno")_
- **S3** — La agenda sugiere a un `rotativo` cuando el horario coincide con uno **habitual** suyo, aunque no haya historial; el historial sigue ordenando candidatos.
- **S4** — El importador acepta la notación real del profe: teléfonos numéricos en notación científica (`3.544612527E9`), horas `8AM` / `9am` / `15hs`, `comodin` como `indistinto`, varios días en `dia` (`Martes y viernes`) y celdas compuestas (`martes 11hs - sab 12hs`).
- **S5** — La plantilla descargable hace round-trip de varios horarios en las mismas celdas `dia`/`hora`, sin perder ninguno.
- **S6** — La planilla real importa los 62 alumnos con todos sus horarios; los totales se contrastan contra el archivo. _(pedido textual: "borra la base de datos y te paso un archivo con los alumnos reales, asi lo vemos y testeo")_
- **S7** — Los alumnos con `tipo` vacío son `rotativo`, aunque tengan día y hora. _(pedido textual: "los que no tienen fijo es porque no son fijos")_

## Tasks

| ID | Spec | Ruta | Estado |
|----|------|------|--------|
| T1 | S1 | inline | hecho: `c710f06` + tests `649d7a9` |
| T2 | S2, S7 | inline | hecho |
| T3 | S2, S5 | inline | hecho |
| T4 | S4 | inline | hecho |
| T5 | S3 | inline | hecho |
| T6 | S6 | inline | hecho: 62 alumnos, 82 horarios |

## Log

- **L1** — "borra la base de datos y te paso un archivo con los alumnos reales, asi lo vemos y testeo"
- **L2** — "esta acá C:\Users\genar\Downloads y se llama AlumnosEze, fijate que no esta configurado bien, decime si no entendes algo"
- **L3** — "los que no tienen fijo es porque no son fijos"
- **L4** — "Pará antes de que avances. Los que no tiene pago mensual, son los que pagan individual o grupal, como te dije ayer. Eso lo dejalo vacio si es posible, ya lo resolveré con el profe. SIno, decime que sugeris"
- **L5** — Decisión de modelo: "Varios horarios por alumno (Recomendado)".
- **L6** — Diagnóstico del archivo (0 de 62 importables): 62/62 teléfonos en notación científica; 62/62 horas en formato no soportado; 4 `comodin`; 20 filas con dos días; 22 `pago` vacío; 9 `tipo` vacío; 0 filas sin día/hora.
- **L7** — "Perfecto" (aprueba pago `NULL` + "Sin definir").
- **L8** — T1 hecho: migración aplicada a la base viva (columna `NULL` + CHECK con `IS NULL`), suite 321/321, `tsc` limpio, verificador independiente sin blockers (7/7 ítems); `review assess` = `medium`, `under_budget` (la revisión nativa queda pendiente en la slice).
- **L9** — T2-T5 hechos: `student_slots` reemplaza al par `recurring_*`; los `fijo` se agendan en todos sus horarios y los `rotativo` quedan como habituales. La plantilla round-trips varios horarios; el parser acepta `8AM`/`15hs`, teléfonos en notación científica, `comodin` y celdas compuestas. Las sugerencias priorizan el horario habitual. 344 tests verdes, `tsc` limpio, migraciones aplicadas a la base viva.
- **L10** — Bug encontrado al insertar: `students.category` era `VARCHAR(8)` y "8va firme" mide 9, así que toda categoría firme fallaba. Migración `2026-11-14-category-width.sql` (a `VARCHAR(12)`) aplicada.
- **L11** — T6 hecho: 62 alumnos y 82 horarios cargados (53 fijo, 9 rotativo; 40 mensual, 22 sin definir; 42 con un horario, 20 con dos). La planilla escribe "vir" por viernes en Lucia Gutierrez: el parser lo rechaza y se corrigió a viernes sólo para esta carga; conviene arreglar la celda en el Excel.
- **L12** — Verificación independiente del bloque S2-S5/S7: 7/7 ítems cumplidos, sin blockers, 107/107 tests dirigidos + 24 probes. Advertencia A1 corregida: el formato `14h30` que el parser aceptaba antes volvió a aceptarse (con test). A2 aceptada: una celda `hora` compuesta exige los días también en `dia`; falla en voz alta y la plantilla siempre escribe las dos celdas. Suite completa 344/344 con `--maxWorkers=2` (el pool paralelo por defecto resulta flaky por timeouts bajo carga).
