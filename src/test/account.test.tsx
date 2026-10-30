import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Account } from "@/components/Account";
import { greeting } from "@/lib/greeting";

const { store } = vi.hoisted(() => ({
  store: {
    user: { id: "u1", email: "profe@example.com", name: "Genaro Stocco", tourDone: true } as null | {
      id: string;
      email: string;
      name: string | null;
      tourDone: boolean;
    },
    students: [{ id: "s1" }, { id: "s2" }],
    lessons: [{ id: "l1", date: "2026-10-30", start: "08:00", status: "programada" }],
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} {...rest}>{children as React.ReactNode}</a>
  ),
}));
vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));

afterEach(cleanup);

describe("barra de la cuenta", () => {
  it("saluda por el nombre de pila según la hora local", async () => {
    render(<Account />);

    const expected = `${greeting(new Date().getHours())}, Genaro`;
    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it("sigue mostrando el resumen del día", async () => {
    render(<Account />);

    expect(await screen.findByText(/2 alumnos · /)).toBeTruthy();
  });
});
