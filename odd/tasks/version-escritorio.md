# Versión escritorio (layout responsive)

Misma app y mismos datos con un layout de escritorio que se adapta por ancho; mobile queda intacto.
Rama: `migracion-node-mysql`. Entrega: commits por unidad de trabajo en la rama. Runner: `npm test` (vitest).

## Specs

- **S1** — Es la misma app, las mismas rutas y la misma data: no hay app nativa, ni backend nuevo, ni una segunda base.
- **S2** — En escritorio (desde `lg`, 1024px) se muestra una **sidebar izquierda fija** con Agenda, Alumnos, Avisos, Resumen, Configuración y un botón primario "Nueva clase".
- **S3** — En mobile (menos de 1024px) se conserva el layout actual: contenedor `max-w-md`, barra de cuenta arriba y nav inferior de 3 ítems (Agenda, +, Alumnos).
- **S4** — El contenido de escritorio vive en un contenedor ancho centrado (`max-w-6xl`) y usa grillas de dos columnas donde aportan valor: agenda + resumen del día, alumnos en tabla, avisos con vista previa, configuración en dos columnas.
- **S5** — El sistema visual "Court & Chalk", el modo oscuro y los componentes compartidos se mantienen; no se rediseña la identidad.
- **S6** — Deploy/hosting (Hostinger) queda fuera de alcance: solo layout y comportamiento en el navegador.

## Tasks

- **T1** — Shell responsive: sidebar de escritorio, contenedor ancho, mobile intacto, test de navegación actualizado. (inline)
- **T2** — Agenda (`/`): grilla agenda + resumen del día en escritorio. (inline)
- **T3** — Alumnos (`/alumnos`): tabla en escritorio. (inline)
- **T4** — Avisos (`/avisos`): lista + vista previa en escritorio. (inline)
- **T5** — Resumen (`/resumen`): tarjetas/gráficos en grilla ancha. (inline)
- **T6** — Configuración (`/configuracion`): formulario en dos columnas. (inline)
- **T7** — Nueva clase e importar: formularios centrados y cómodos. (inline)
- **T8** — Login: tarjeta centrada en escritorio. (inline)

## Log

### L1 — pedido original (2026-11-02)

"Necesito crear una version escritorio por si alguno profe le gusta configurar todo desde PC y despues llevar el dia a dia desde el celular"

### L2 — aclaración de alcance (2026-11-02)

"osea, que sea todo igual, es decir, vos entras desde el celu y se te carga lo que tenemos ahora, pero si abre el escritorio, q abra una version parecida pero para escritorio"

### L3 — decisión de diseño (2026-11-02)

"1. sidebar a la izquierda. 2. si, no te preocupes, eso lo vemos cuando la carguemos en hostinger"
