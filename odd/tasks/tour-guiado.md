# Tour guiado de bienvenida

Objetivo: que un profesor nuevo entienda la agenda en cuatro globos la primera vez que entra, y que no lo vuelva a ver nunca más.
Estado: **implementado**. Branch: `migracion-node-mysql`. Runner: `npm test` (Vitest).

## Specs

- **S1 — Sólo la primera vez.** *"Que el tour unicamente se active si el sistema detecta que es la primera vez q inicia sesion"*. Criterio: se muestra mientras `users.tour_done_at` sea NULL; al terminarlo o saltearlo se escribe la fecha una sola vez y no vuelve. Se guarda en la base, no en el dispositivo (AGENTS.md).
- **S2 — Cuatro globos sobre cosas que siempre existen.** Día (`data-tour="date"`), alta de clase (`add`, el botón del medio), avisos (`notices`, ícono del encabezado) y alumnos (`students`, la barra de abajo). Nada que dependa de tener clases ese día.
- **S3 — Se puede saltear.** "Siguiente" avanza, "Saltear" cierra en cualquier paso, el último dice "Entendido". El tour nunca atrapa al profesor: si el guardado falla, igual se cierra en esta sesión y avisa con un toast.
- **S4 — No bloquea datos.** Es una capa modal encima de la agenda: no toca el snapshot, ni las clases, ni el saldo.

## Datos

- `users.tour_done_at TIMESTAMP NULL`, aplicada a la base local. Las cuentas existentes quedan NULL y ven el tour una vez.
- `AuthUser` gana `tourDone`; `loginUser` y `findSessionUser` lo leen con `tour_done_at IS NOT NULL`.
- `completeTour()` no retrocede: `COALESCE(tour_done_at, NOW())`, así un reintento no lo revive.

## Tasks

| ID | Tarea | Spec | Estado |
| --- | --- | --- | --- |
| T1 | Columna, `AuthUser.tourDone`, `completeTour` y migración | S1 | hecho |
| T2 | `finishTour` en el store | S1, S3 | hecho · cierra igual si el servidor falla |
| T3 | Componente `Tour` con los cuatro globos y el destacado | S2, S3 | hecho · `src/components/Tour.tsx` + 5 casos |
| T4 | Anclas `data-tour` en agenda y barra de navegación | S2 | hecho |

## Log

- **L2** — Implementado y probado en Chrome real a 420px: con `tour_done_at` en NULL apareció el globo 1 de 4 con el recuadro verde sobre el selector de fecha; los pasos 2, 3 y 4 quedaron sobre el botón de alta, el ícono de avisos y "Alumnos". "Entendido" cerró, la columna quedó escrita y tras recargar el tour no volvió. Cero errores de consola. 191 tests en 30 archivos, `tsc` limpio, build OK.
- **L2 (decisiones menores)** — El destacado se dibuja con `box-shadow` y un anillo, así que no hay recortes ni cuatro copias del árbol. La capa es modal: durante el tour no se puede tocar la agenda, para que los pasos tengan sentido en orden.
- **L1** — *"importar alumnos y tour guiado me sirve. Que el tour unicamente se active si el sistema detecta que es la primera vez q inicia sesion"*.
