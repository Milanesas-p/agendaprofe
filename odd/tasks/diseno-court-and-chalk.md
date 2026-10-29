# Rediseño "Court & Chalk"

Objetivo: llevar la app al sistema de diseño del export de Stitch (`stitch_padel_coach_scheduler.zip`: `DESIGN.md`, `screen.png`, `code.html`) sin cambiar la lógica ni inventar funciones que el mockup muestra y esta app no tiene.
Branch: `migracion-node-mysql` (sin push). Delivery: `ask-on-risk`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Paleta y tipografía.** Base vellum cálido `#fcf9f2`, texto carbón `#1b1c18`, verde turf `#2f5c3e` reservado para confirmaciones (presente, libre), rojo sólo para error/ausente/deuda. Una sola familia: **Hanken Grotesk** en todos los roles (reemplaza Barlow Condensed + DM Sans). Los hex del export se convirtieron a OKLCH con la fórmula de Ottosson, no a ojo.
- **S2 — Shell.** Barra de cuenta clara con hairline; encabezado de página claro, título `text-3xl font-semibold tracking-tight`, subtítulo en versalitas chicas; navegación inferior clara con blur, activo en carbón y etiquetas de 11px. La barra queda **Agenda · ⊕ · Alumnos** con el botón redondo carbón en el centro (decisión del usuario): el ⊕ abre la pantalla Nueva clase. Resumen sale de la barra y pasa a un botón en el encabezado de la agenda. Se van las bandas verde oscuro y los bordes de 2px.
- **S3 — Superficies.** Tarjetas blancas (`card`) con borde de 1px `border`, radios 8–12px, sin sombras difusas (sólo la hoja inferior lleva una sombra contenida). Jerarquía por tono y hairline, no por contorno grueso.
- **S4 — Agenda.** Franja semanal como chips tonales, tarjeta de clase blanca con hairline, estados como chips tonales (`presente` verde turf, `ausente` rojo suave, `cancelada` tachada), asistencia con dos botones circulares de 40px que se llenan al marcar, bloque libre en verde turf punteado.
- **S5 — Login.** Misma piel: fondo vellum, título `Pádel Pro` en Hanken, formulario en tarjeta blanca con hairline.
- **S6 — Resto.** Alumnos, Resumen y las hojas internas de esas pantallas quedan para el siguiente pase; heredan shell, paleta y tipografía automáticamente.

## Decisiones de alcance

El mockup es de otro producto (clases particulares con pista, cobro en euros, sesión, pizarra, cajón de bolas). Se adopta **el lenguaje visual**, no las funciones: no se agrega Pista, Cobro, Pizarra, Cajón ni estados de pago. La agenda sigue siendo la de esta app: un bloque con hasta 4 alumnos y asistencia por alumno, que es la decisión de producto ya tomada en `clases-multiples.md`.

## Tasks

| ID | Tarea | Spec | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Paleta en OKLCH + Hanken Grotesk + radios | S1 | inline | hecho · `src/styles.css`, `src/routes/__root.tsx` |
| T2 | Shell: barra de cuenta, PageHeader, navegación inferior | S2 | inline | hecho · `AppShell.tsx`, `styles.css` |
| T3 | Superficies base: Button, Sheet, hoja inferior | S3 | inline | hecho · `components/ui/button.tsx`, `components/Sheet.tsx` |
| T4 | Agenda: franja semanal, tarjetas de clase, asistencia, estados | S4 | inline | hecho · `src/routes/index.tsx` |
| T5 | Login | S5 | inline | hecho · `LoginScreen.tsx` |
| T6 | Alumnos: buscador, filtros, directorio y tarjetas con acciones | S4, S6 | inline | hecho · `src/routes/alumnos.tsx` |
| T7 | Nueva clase: ruta `/nueva-clase`, pasos 1-2 y CTA; ⊕ en la barra | S2, S6 | inline | hecho · `src/routes/nueva-clase.tsx` + 5 tests |
| T8 | Resumen: piel nueva (quedó heredando shell y paleta) | S6 | — | pendiente |

## Log

- **L1** — *"vamos con el diseño, fijate que en descargar vas a encontrar un .zip, q se llama stitch_padel_coach_scheduler"*. El zip trae `DESIGN.md` (sistema "Court & Chalk"), `screen.png` (mockup de la agenda) y `code.html` (esa pantalla en Tailwind).
- **L2** — Fundación + agenda + login implementados. La paleta se derivó con un conversor sRGB→OKLab propio (el proyecto exige OKLCH en `styles.css`) y quedó registrada en `:root`. Se verificó con una captura real en Chrome headless del login (server de Vite en `:3111`, `--headless=new --virtual-time-budget=8000`): fondo vellum, tarjeta blanca con hairline, botones carbón y Hanken Grotesk cargada. 120 tests en 21 archivos, `tsc` limpio, build OK. Pendiente: la agenda no se pudo capturar porque requiere sesión iniciada; se revisa a ojo al abrirla.
- **L5** — Pantalla **Nueva clase** implementada como ruta propia `/nueva-clase` (decisión: entrar por el ⊕ del centro de la barra). Dos pasos con tarjeta numerada: 1) ¿Quién entrena? buscador + chips de alumnos; 2) ¿Cuándo juegan? chips Hoy/Mañana/Pasado, selector de otro día y chips de bloques libres; CTA "Reservar clase". Los bloques libres respetan el tope de 4 y excluyen un bloque donde el alumno ya tiene clase. Del mockup se omitieron Duración, Pista y Estado del cobro: esta app no los tiene. Para que el ⊕ funcione hubo que tocar `routeTree.gen.ts` (se regeneró con el build) y actualizar dos mocks de router en tests que renderizan `AppShell` o la agenda sin router. 127 tests en 22 archivos, `tsc` limpio, build OK.
- **L3** — Nota de deuda: el bloque `.dark` de `styles.css` sigue con la paleta vieja. No hay toggle de tema ni un solo `dark:` en el código, así que está inerte; si algún día se habilita, hay que rehacerlo para esta paleta.
- **L4** — *"fijate que tambien tenes una que se llama 'nueva clase' y 'alumnos', ahi tenes más diseño"*. Aparecieron dos exports más en Descargas: `alumnos.zip` y `nueva clase.zip`, con el mismo `DESIGN.md` y un `screen.png`/`code.html` por pantalla. De `alumnos` se tomaron: buscador en tarjeta blanca, filtros como segmented track, rótulo "Directorio" con el conteo a la derecha, y tarjeta de alumno con nombre, línea de datos, frase de saldo (`Debe 2 clases` en rojo, `3 clases a favor`, `Al día`), punto de estado y dos botones (Restar / Sumar). Efecto colateral deliberado: se fue el badge cuadrado con el número grande; el saldo ahora se lee en palabras. Se descartaron del mockup las acciones que este producto no tiene (WhatsApp, Cobrar €, Renovar, "Nivel", "Bono") y se conservó `fijo/rotativo`, categoría, posición y horario fijo. 121 tests en 21 archivos, `tsc` limpio.
