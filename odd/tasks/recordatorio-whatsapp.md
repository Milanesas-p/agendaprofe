# Recordatorio por WhatsApp desde la agenda (pendiente)

Objetivo: que el profesor, el día antes, toque un botón al lado del alumno en la agenda y se abra el chat de WhatsApp con un mensaje de recordatorio ya escrito.
Estado: **implementado** (T1 y T2). Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs (borrador)

- **S1 — Botón en la agenda.** *"agregar el boton de wsp al lado del alumno en la agenda"*. Criterio: cada alumno con teléfono muestra un botón de WhatsApp en su renglón de la clase. Un alumno sin teléfono no muestra nada (el campo es opcional).
- **S2 — Abre el chat, no la app.** Criterio: abre `https://wa.me/<digitos>?text=<mensaje>` en una pestaña nueva, con el texto ya escrito en el compositor. El envío lo decide el profesor, siempre.
- **S2b — Teléfono en formato internacional, automático.** *"el sistema deberá detectar si tiene +549 o no, si no lo tiene, que se lo agregue"* y *"si el alumno es de otro país, va a estar especificado sí o sí"*. Criterio: al guardar, sacar separadores y ceros iniciales; si ya empieza con `549` se deja; si empieza con `54` se le inserta el `9` que falta; si tiene **más de 10 dígitos** se asume que ya trae el código de otro país y se deja intacto; si tiene 10 o menos se asume argentino y se le antepone `549`. El profesor nunca escribe el código; el que es del exterior lo escribe con el suyo.
- **S3 — El mensaje nombra la hora.** *"Buenas! Te recuerdo tu clase de las [HORA]. Confirmame por favor."* Criterio: la hora es la del bloque de esa clase, sin ceros ni formato raro (09:00 se lee 09:00). El texto se puede ajustar; WhatsApp deja editarlo antes de enviar.
- **S4 — Solo cuando corresponde.** *"el dia antes apriete ahí"*. **Decidido (L4): siempre visible.** Un alarm de "sólo mañana" esconde la función y no cubre avisos de hoy. Excepción: una clase cancelada no muestra el botón (no hay nada que recordar).

## Datos que ya existen

- `students.phone` guarda **sólo dígitos** (`normalizePhone`), que es exactamente lo que `wa.me` necesita. No hace falta migración.
- Ya hay un precedente de link: `LoginScreen` usa `https://wa.me/${CONTACT_PHONE}`.
- `StudentRow` (agenda) hoy tiene: ✓ presente, ✗ ausente, nombre, perfil (categoría · posición) y punto de deuda. El botón entra ahí, y conviene repetirlo en la hoja que abre el nombre para no perderlo si el renglón queda apretado en la vista semanal.

## Decisiones abiertas para mañana

1. **Siempre visible o sólo el día antes.** Visible siempre es más simple y sirve para cualquier aviso; sólo-para-mañana evita ruido pero esconde la función.
2. ~~Número sin código de país~~ — **decidido y ya implementado**: detección automática (ver S2b).
3. **Texto fijo o por alumno.** Un texto único alcanza; si más adelante quieren variantes por tipo de alumno, se agrega entonces.
4. ~~Filas ya guardadas sin prefijo~~ — resuelto sin backfill: los 2 alumnos de la base tienen `phone` en NULL, así que no hay datos viejos que corregir. Si en el futuro aparece una fila local, se puede normalizar al armar el link como red de seguridad.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | `whatsappLink(phone, text)` puro en `src/lib/` + tests | S2, S3 | hecho · `src/lib/whatsapp.ts` + 7 casos (RED → GREEN) |
| T2 | Botón en `StudentRow` y en la hoja de acciones | S1, S4 | hecho · botón redondo al final del renglón + link en la hoja, sólo con teléfono y sin cancelar |
| T3 | `normalizePhone` detecta y completa el código de país | S2b | hecho · `src/lib/phone.ts` + 7 casos |
| T4 | Filas viejas sin prefijo | S2b | hecho · sin backfill: los teléfonos actuales son NULL |

## Log

- **L4** — *"¿el botón aparece siempre o sólo en las clases de mañana?"* → **siempre visible**, decidido por el profesor: es más simple y sirve para cualquier aviso, no sólo el del día antes. Se implementó el botón en el renglón (`MessageCircle`, `target="_blank"`, `rel="noopener noreferrer"`) y repetido en la hoja del alumno. Dos reglas que no estaban escritas y quedaron fijadas: sin teléfono no hay botón, y una clase cancelada no muestra el botón (no hay nada que recordar). El link lleva el teléfono tal como está guardado y `withCountryCode` actúa como red de seguridad si alguna fila vieja no trae el `549`. 154 tests en 25 archivos, `tsc` limpio, build `node-server` OK.
- **L3** — *"el sistema deberá detectar si tiene +549 o no, si no lo tiene, que se lo agregue, automaticemos eso. Porque si el alumno es de otro pais, va a estar especificado si o si"* → implementado en `normalizePhone`: local (≤10 dígitos) recibe `549`, `54` sin el `9` lo recibe, más de 10 dígitos se respeta como código de otro país. Probado con Argentina local, con `0` inicial, `54` incompleto, ya `549`, Brasil, Chile y Uruguay. 144 tests en 24 archivos.
- **L2** — *"anota directamente el +549"* → decisión: el teléfono se normaliza a formato internacional argentino anteponiendo `549`, en vez de exigirle al profesor que lo escriba. Pendiente para mañana: resolver si se normaliza al leer o con un backfill de las filas existentes.
- **L1** — *"agrega mañana para agregar el boton de wsp al lado del alumno en la agenda, la idea de esto es que el profesor, el dia antes apriete ahí, y lo lleve directamente al chat del alumno, con un msj de recordatorio, tipo 'Buenas! Te recuerdo tu clase de las [HORA]. Confirmame por favor.' Algo asi, obvio que lo podemos mejorar, pero eso seria la idea"*. Se deja anotado para la próxima sesión, sin implementar.
