# Avisos de WhatsApp (pantalla en lote)

Objetivo: una pantalla donde el profesor ve los alumnos con clase en los próximos días, con la plantilla de aviso editable, y abre el chat de cada uno con el mensaje ya armado.
Estado: **implementado**. T1-T4 hechos; migración aplicada a la base local. Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Ventana de 3 días.** Lista las clases de **mañana, pasado y el día siguiente** (3 fechas), agrupadas por día y ordenadas por hora y nombre. Una clase cancelada no aparece. Decidido por el profesor: *"Próximos 3 días"*.
- **S2 — Plantilla editable y guardada.** Variables `[nombre]`, `[dia]`, `[hora]`; el texto se guarda en la base (`court_settings.notice_template`), no en el dispositivo (AGENTS.md). Plantilla vacía = la de fábrica. De fábrica: *"Buenas [nombre]! Te recuerdo tu clase del [dia] a las [hora]. Confirmame por favor."*
- **S3 — Un link por alumno.** Cada fila con teléfono abre `wa.me` con el mensaje ya escrito (`whatsappLink`). Sin teléfono la fila se ve igual, marcada **Sin teléfono**, sin link: el profesor necesita saber a quién le falta el dato.
- **S4 — Entrada desde la agenda.** Un ícono en el encabezado de la agenda, junto a Resumen y Configuración.
- **S5 — Nada de "enviado".** WhatsApp no confirma el envío; la app no inventa ese estado.

## Datos

- `students.phone` ya viene normalizado a `549...` y `whatsappLink` completó el código como red de seguridad.
- `court_settings` gana `notice_template VARCHAR(400) NULL`; las filas viejas quedan en NULL y caen en la plantilla de fábrica.
- El teléfono del alumno es opcional, así que la pantalla tiene que convivir con filas sin link.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Helpers puros: `nextDays`, `dayLabel`, `fillTemplate`, `noticeText`, `upcomingNotices` + tests | S1, S2 | hecho · `src/lib/notices.ts` + 10 casos (RED → GREEN) |
| T2 | `court_settings.notice_template` + `saveNoticeTemplate` + snapshot + store | S2 | hecho · columna aplicada a la base local (fila existente intacta) |
| T3 | Ruta `/avisos`: plantilla, días, filas y links | S1, S2, S3 | hecho · `src/routes/avisos.tsx` + 5 casos |
| T4 | Ícono de acceso en el encabezado de la agenda | S4 | hecho · caso nuevo en `agenda-multi.test.tsx` |

## Log

- **L3** — Implementado y probado en Chrome real a 420px. Ventana de 3 días: sólo aparecen el 01/11 y el 02/11 (el 31/10 no tenía clases). La fila de Pepe, sin teléfono, se ve marcada **Sin teléfono** y sin link; la de Maxi abre `wa.me` con el mensaje ya escrito. Se guardó una plantilla nueva, se recargó la página y volvió de MySQL tal cual, con el link ya armado: *"Buenas Maxi Salas! Te espero el lunes 02/11 a las 14:00. Avisame si no llegás."*. Cero errores de consola. 170 tests en 27 archivos, `tsc` limpio, build OK.
- **L3 (decisiones menores)** — El link usa la plantilla que está en pantalla, no la guardada: así el profesor edita y ve el mensaje antes de guardar. El campo tiene tope de 400 caracteres igual que la columna. `saveSettings` no toca `notice_template`, así que cambiar horarios nunca pisa la plantilla. La migración se aplicó a mano (convención del repo): `ALTER TABLE court_settings ADD COLUMN notice_template VARCHAR(400) NULL`.
- **L2** — Decisiones del profesor al retomar: ventana de **3 días**, todo lo demás resuelto por el agente (ruta `/avisos`, plantilla en la base, sin marcar enviado).
- **L1** — *"queda ver lo q te pase de profepadel"*: se retoma la idea de la pantalla de avisos en lote del relevamiento (memoria `producto/ideas-profepadel`), después de haber cerrado el botón por alumno en la agenda.
