# Recordatorio por WhatsApp desde la agenda (pendiente)

Objetivo: que el profesor, el día antes, toque un botón al lado del alumno en la agenda y se abra el chat de WhatsApp con un mensaje de recordatorio ya escrito.
Estado: **pendiente de implementar**. Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs (borrador)

- **S1 — Botón en la agenda.** *"agregar el boton de wsp al lado del alumno en la agenda"*. Criterio: cada alumno con teléfono muestra un botón de WhatsApp en su renglón de la clase. Un alumno sin teléfono no muestra nada (el campo es opcional).
- **S2 — Abre el chat, no la app.** Criterio: abre `https://wa.me/<digitos>?text=<mensaje>` en una pestaña nueva, con el texto ya escrito en el compositor. El envío lo decide el profesor, siempre.
- **S2b — Teléfono en formato internacional.** Decidido: se antepone **`549`** al guardar, para que `wa.me` no abra un chat equivocado. Reglas: sacar separadores; si ya viene con `54` (o `549`) se respeta; si empieza con `0` se descarta el `0`; si es local (10 dígitos) queda `549` + número. Resultado esperado: `2302666351` → `5492302666351`.
- **S3 — El mensaje nombra la hora.** *"Buenas! Te recuerdo tu clase de las [HORA]. Confirmame por favor."* Criterio: la hora es la del bloque de esa clase, sin ceros ni formato raro (09:00 se lee 09:00). El texto se puede ajustar; WhatsApp deja editarlo antes de enviar.
- **S4 — Solo cuando corresponde.** *"el dia antes apriete ahí"*. Decisión pendiente: mostrar el botón siempre, o sólo en las clases de mañana.

## Datos que ya existen

- `students.phone` guarda **sólo dígitos** (`normalizePhone`), que es exactamente lo que `wa.me` necesita. No hace falta migración.
- Ya hay un precedente de link: `LoginScreen` usa `https://wa.me/${CONTACT_PHONE}`.
- `StudentRow` (agenda) hoy tiene: ✓ presente, ✗ ausente, nombre, perfil (categoría · posición) y punto de deuda. El botón entra ahí, y conviene repetirlo en la hoja que abre el nombre para no perderlo si el renglón queda apretado en la vista semanal.

## Decisiones abiertas para mañana

1. **Siempre visible o sólo el día antes.** Visible siempre es más simple y sirve para cualquier aviso; sólo-para-mañana evita ruido pero esconde la función.
2. ~~Número sin código de país~~ — **decidido**: anteponer `549` (ver S2b).
3. **Texto fijo o por alumno.** Un texto único alcanza; si más adelante quieren variantes por tipo de alumno, se agrega entonces.
4. **Filas ya guardadas sin prefijo.** Los alumnos cargados antes de este cambio pueden tener el número local. Hay que decidir entre normalizar al leer (el link aplica el prefijo como red de seguridad) o hacer un backfill único de `students.phone`. El backfill toca datos reales: se hace con conteo antes/después y valores comprobados.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | `whatsappLink(phone, text)` puro en `src/lib/` + tests | S2 | pendiente |
| T2 | Botón en `StudentRow` y en la hoja de acciones | S1, S4 | pendiente |
| T3 | `normalizePhone` antepone `549` (con sus casos: local, con 0, ya internacional) | S2b | pendiente |
| T4 | Verificar/backfillear teléfonos ya guardados | S2b | pendiente |

## Log

- **L2** — *"anota directamente el +549"* → decisión: el teléfono se normaliza a formato internacional argentino anteponiendo `549`, en vez de exigirle al profesor que lo escriba. Pendiente para mañana: resolver si se normaliza al leer o con un backfill de las filas existentes.
- **L1** — *"agrega mañana para agregar el boton de wsp al lado del alumno en la agenda, la idea de esto es que el profesor, el dia antes apriete ahí, y lo lleve directamente al chat del alumno, con un msj de recordatorio, tipo 'Buenas! Te recuerdo tu clase de las [HORA]. Confirmame por favor.' Algo asi, obvio que lo podemos mejorar, pero eso seria la idea"*. Se deja anotado para la próxima sesión, sin implementar.
