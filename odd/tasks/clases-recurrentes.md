# Clases recurrentes y mover una clase

Objetivo: un alumno fijo con horario semanal (ej. viernes 14:00) se agenda solo hacia adelante; una ocurrencia puntual se puede mover a otro día libre sin romper la serie.
Branch: `migracion-node-mysql` (sin push). Delivery: `ask-on-risk`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Horario fijo semanal.** *"si el profesor marca a un alumno como fijo y elije por ejemplo, que entrena los Viernes a las 14hs"*. Criterio: el alumno guarda día de semana + hora, opcional y editable; se puede quitar. Un alumno sin horario se comporta como hoy.
- **S2 — Se agenda solo, 4 semanas hacia adelante.** *"Me gustaria que automaticamente se acomode en lo siguientes Viernes a las 14hs"* + *"vamos con 4 semanas"*. Criterio: al abrir la app se completan las ocurrencias que falten hasta hoy + 4 semanas. Es idempotente: abrir diez veces no duplica nada.
- **S3 — Lo ya generado no se regenera.** Criterio: una ocurrencia movida no vuelve a aparecer en su fecha original. La generación es monótona: nunca revisa fechas ya resueltas.
- **S3b — Tres conceptos separados, no uno.** *"se supone que si alumno es fijo, se le respeta el viernes a las 14hs, pero esa semana se hace una excepción"*. Criterio: la **serie** (el horario fijo) no se toca nunca al mover una semana; la **excepción** afecta sólo a esa ocurrencia y deja el viernes libre esa semana; la **baja** (quitar el horario) corta la generación sin borrar lo ya creado. Mover no es cancelar: el alumno sigue siendo fijo y el viernes que viene vuelve a las 14:00.
- **S4 — Mover una ocurrencia.** *"seleccionado esa casilla de ese viernes a las 14hs, lo puedas mover a una libre de otra dia, ya sea de esa semana q esta pasando o la siguiente"*. Criterio: se elige fecha destino y un horario libre; la clase cambia de día y hora, la serie sigue igual y el saldo no se mueve.
- **S5 — Sólo se mueven clases sin marcar.** Criterio: una clase `presente`, `ausente` o `cancelada` no se mueve hasta deshacerla; si no, la asistencia quedaría en un día que no ocurrió.
- **S6 — El destino respeta las reglas existentes.** Criterio: el horario destino está en los bloques configurados, tiene menos de 4 alumnos, y el alumno no está ya en ese bloque.
- **S7 — Un bloque lleno no se traga en silencio.** Criterio: si una semana no se pudo generar porque el bloque tiene 4 alumnos, se avisa al abrir la agenda con el alumno y la fecha.
- **S8 — Cambiar o quitar el horario no borra clases ya creadas.** Criterio: las ocurrencias existentes quedan; se dejan de generar las nuevas. El cambio no es retroactivo.

## Modelo

`students` gana tres columnas nullable: `recurring_weekday TINYINT` (0=domingo … 6=sábado), `recurring_time CHAR(5)`, `recurring_last_date DATE`.

`recurring_last_date` es la clave: la generación sólo mira fechas **posteriores** a esa fecha. Por eso una ocurrencia movida o cancelada no puede resucitar, sin necesidad de filas fantasma ni marcas extra.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Esquema: columnas de recurrencia en `students` | S1, S2 | inline | hecho · `db/schema.sql` + ALTER aplicado a `padel` (2 alumnos, 2 clases intactas) |
| T2 | Regla pura de ocurrencias por día de semana | S2 | inline | hecho · `src/lib/recurrence.ts` + 9 tests |
| T3 | Datos: horario en el DTO/alta/edición | S1 | inline | hecho · `src/server/data.ts` |
| T4 | Datos: `materializeRecurring` idempotente con aviso de conflictos | S2, S3, S7 | inline | hecho · 5 tests |
| T5 | Datos: `moveLesson` con validaciones | S4, S5, S6 | inline | hecho · 5 tests |
| T6 | Store: tipos, acciones y aviso de conflicto | S2, S4, S7 | inline | hecho · top-up al cargar y al guardar horario |
| T7 | UI: horario fijo en el editor de alumno | S1 | inline | hecho · día + hora, opcional |
| T8 | UI: mover clase desde la agenda | S4, S5 | inline | hecho · hoja de acciones → mover |
| T9 | Tests + verificación en Chrome real | S1–S8 | inline | hecho · 95 tests, build OK, 7/7 E2E |

## Log

- **L1** — *"Algo que me gustaria automatizar es lo siguiente. Si el profesor marca a un alumno como fijo y elije por ejemplo, que entrena los Viernes a las 14hs. Me gustaria que automaticamente se acomode en lo siguientes Viernes a las 14hs"*.
- **L2** — *"Que esa persona por ejemplo, tiene los viernes a las 14hs, pero esa semana no puede y elegi otra dia para ir, seleccionado esa casilla de ese viernes a las 14hs, lo puedas mover a una libre de otra dia, ya sea de esa semana q esta pasando o la siguiente"*.
- **L3** — *"vamos con 4 semanas"* → horizonte de generación.
- **L4** — Verificado antes de diseñar: `type: "fijo"` hoy es **sólo una etiqueta**. Se usa para el chip de filtro y el tag del listado (`alumnos.tsx:28,41,112`), sin efecto en agenda, saldo ni reportes. Este cambio le da significado por primera vez, y por eso el horario se guarda aparte del tipo: un alumno `rotativo` puede tener horario fijo y uno `fijo` puede no tenerlo.
- **L5** — Interacción detectada entre L1 y L2: mover una ocurrencia deja la fecha original vacía y el generador la volvería a crear. Se resuelve con generación monótona desde `recurring_last_date`, no con filas fantasma: la agenda queda limpia y no hay estados ocultos.
- **L6** — Confirmado por el usuario: *"si yo tengo esa semana el viernes a las 14hs, pero voy el jueves a las 15 como excepcion, se libera ese cupo de las viernes de las 14hs, para otra persona. Esa es al idea, la mayor organización y la mayor posibilidad de tener todas las horas llenas"*. Mover actualiza la fila, así que el bloque original queda libre de verdad. Consecuencia asumida: como otro puede tomarlo, volver atrás no está garantizado y el servidor lo rechaza si se llenó.
- **L7** — Implementado y verificado. Evidencia: 95 tests en 19 archivos; migración aplicada sin perder filas (2 alumnos, 2 clases antes y después); build `node-server`. E2E en Chrome real 7/7 sobre una alumna con viernes 14:00: agenda los 4 viernes del horizonte, la excepción cae el jueves 15:00, el viernes queda **Libre**, los viernes siguientes siguen agendados, y tras recargar el viernes **no se regenera** y la clase movida sigue en pie. La generación corre al abrir la app y también al guardar un horario, para que no haya que recargar.
