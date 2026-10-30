# Importar alumnos desde un CSV pegado

Objetivo: dar de alta muchos alumnos de una vez pegando las filas copiadas de Excel o Sheets, con una previsualización fila por fila antes de guardar.
Estado: **implementado** (T1-T4). Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Pegar, no subir.** Una pantalla con un textarea donde se pega el texto. Acepta tabulaciones (lo que copia Excel), comas y punto y coma como separador.
- **S2 — Primera fila con títulos.** La primera fila nombra las columnas; sin títulos no se adivina nada y se avisa. Títulos aceptados (sin importar acentos, mayúsculas ni espacios): `nombre` (obligatorio), `telefono`, `tipo`, `pago`, `categoria`, `posicion`, `dia`, `hora`. Alias: alumno/nombre completo, celular/whatsapp/tel, modalidad/abona, cat, lado/cancha, semana, horario.
- **S3 — Cada fila se valida sola.** Nombre obligatorio; teléfono con la misma regla del alta (`normalizePhone`, que completa el `549`); categoría de la lista cerrada; posición `drive`/`reves`/`indistinto`; día por nombre (o `0`–`6`) y hora `HH:MM`, y ese horario tiene que existir en los bloques configurados. Una fila con error se muestra con su motivo y **no se importa**; las demás sí.
- **S4 — Previsualización antes de guardar.** Tabla con línea, nombre, teléfono, perfil y horario fijo, más el conteo "N listos · M con problemas". El botón dice cuántos va a importar y se deshabilita con cero listos.
- **S5 — Valores por defecto.** Sin `tipo`: `fijo` si trae día y hora, si no `rotativo`. Sin `pago`: `mensual`. Sin categoría ni posición: vacíos.
- **S6 — Alta real y agenda al día.** Los alumnos se crean en lote en una transacción del dueño de la sesión; si alguno trae horario fijo, la agenda se completa igual que al crear uno solo. Al terminar vuelve al directorio.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Parser puro `parseStudents` + tests | S1, S2, S3, S5 | hecho · `src/lib/import.ts` + 10 casos (RED → GREEN) |
| T2 | `importStudents` en el servidor + `importStudents` en el store | S3, S6 | hecho · transacción con revalidación de campos |
| T3 | Ruta `/importar` con textarea, previsualización y alta | S1, S4, S6 | hecho · `src/routes/importar.tsx` + 5 casos |
| T4 | Acceso desde el directorio de alumnos | S1 | hecho · ícono en el encabezado, caso en `student-list.test.tsx` |

## Log

- **L3** — Implementado y probado en Chrome real a 420px. Pegado con tabulaciones desde Excel: 2 filas listas, previsualización con teléfono ya normalizado (`549...`), perfil y horario, y alta en el directorio. La fila con `dia`+`hora` se materializó en la agenda: el lunes 02/11 a las 14:00 el bloque quedó con dos alumnos (el importado y Maxi). Cero errores de consola. 186 tests en 29 archivos, `tsc` limpio, build OK.
- **L3 (decisiones menores)** — Las filas rotas no bloquean la importación: se importan las listas y cada error queda visible con su motivo. El servidor revalida los campos aunque el cliente ya lo haya hecho. `importStudents` acepta hasta 200 filas por vez.
- **L2** — Decisión del profesor: **pegar el texto**, no subir archivos. Motivo: funciona igual en el celular y no hay que pelear con encoding ni tipos de archivo.
- **L1** — *"importar alumnos y tour guiado me sirve"*: se encaran las dos ideas que quedaban del relevamiento de ProfePadel; el tour va en su propio documento.
