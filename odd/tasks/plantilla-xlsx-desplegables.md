# Plantilla .xlsx con desplegables para importar alumnos

Objetivo: que la plantilla descargable sea una planilla .xlsx con menús desplegables en las columnas cerradas, y que el archivo completado se pueda subir tal cual, sin exportarlo a CSV.
Estado: **implementado** (T1-T4, commit `250514f`). Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest, jsdom).

## Specs

- **S1 — La descarga es una planilla .xlsx.** El botón "Descargar plantilla" entrega `plantilla-alumnos.xlsx` con la fila de títulos `nombre`, `telefono`, `tipo`, `pago`, `categoria`, `posicion`, `dia`, `hora`. Se arma en el navegador con ZIP nativo (`CompressionStream`), sin dependencias nuevas.
- **S2 — Desplegables en las columnas cerradas.** Validación de lista en: `tipo` (fijo, rotativo), `pago` (mensual, semanal), `categoria` (1ra a 8va), `posicion` (Drive, Revés, Indistinto), `dia` (lunes a domingo) y `hora` (los bloques configurados del profe, `HH:MM`). `nombre` y `telefono` quedan libres.
- **S3 — Se sube el .xlsx tal cual.** El selector acepta `.xlsx` además de `.csv`, `.tsv` y `.txt`. La planilla entra a la misma previsualización y al mismo parser, sin exportar nada.
- **S4 — Los valores quedan como texto.** Las columnas de datos se marcan como texto en la planilla, así `14:00` no se vuelve hora ni `1ra` se vuelve número. Si igual llega una hora como fracción numérica (`0.5833`), se interpreta `14:00`.
- **S5 — Errores claros.** Un archivo que no se puede leer como planilla muestra "No pudimos leer la planilla. Probá de nuevo."; un formato no soportado, "Subí la plantilla .xlsx o un archivo CSV.".
- **S6 — Sin regresiones.** Pegar texto y subir CSV siguen funcionando igual; la importación y la agenda no cambian. La planilla se rechaza si supera las 200 filas que acepta el servidor (las validaciones llegan hasta la fila 201).

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | ZIP + planilla .xlsx con validaciones (`src/lib/xlsx.ts`) + tests | S1, S2, S4 | hecho · RED → GREEN |
| T2 | Lector de .xlsx (ZIP deflate + sheet + shared strings) que devuelve filas | S3, S4 | hecho · RED → GREEN |
| T3 | Conectar descarga/subida en `/importar` y actualizar textos | S3, S5 | hecho · `importar.test.tsx` |
| T4 | Regresión de pegado/CSV y del flujo .xlsx completo | S5, S6 | hecho · suite completa + `tsc` |

## Log

- **L3** — Verificado: 263 tests en 37 archivos, `tsc --noEmit` limpio, `npm run build` OK y `/importar` responde 200 en el dev server. El .xlsx generado se abrió con la implementación de ZIP de .NET (`System.IO.Compression`): 6 entradas, XML bien formado y las 6 validaciones con sus listas (`C2:C201`…`H2:H201`), más la fila de títulos y una fila de datos intactas. Nota: `npm run lint` ya falla en archivos que no toqué (prettier/CRLF), así que no es un gate de este repo; los archivos nuevos sí quedaron formateados.
- **L2** — Decisión del profe: **flujo completo .xlsx** (descargar con desplegables y subir el mismo archivo), no sólo la plantilla. Se descarta la dependencia de turno: `CompressionStream`/`DecompressionStream("deflate-raw")` están en Chrome, Safari 16.4+ y Node 21+, así que el ZIP se arma y se lee sin paquetes nuevos.
- **L1** — *"podriamos armar para el que descargable contenga menus desplegables?"*: los CSV no admiten validación de datos, por eso el desplegable obliga a .xlsx.
