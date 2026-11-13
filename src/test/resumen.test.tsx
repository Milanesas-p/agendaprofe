import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/resumen";

const { store } = vi.hoisted(() => ({
  store: {
    students: [] as Array<{ id: string; name: string; balance: number }>,
    lessons: [] as Array<{ id: string; date: string; start: string; studentId: string; status: string }>,
  },
}));

vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing summary page");
  render(<Component />);
}

afterEach(cleanup);

describe("summary period", () => {
  it("says which window the counts come from", () => {
    renderPage();

    expect(screen.getByText("Tomadas y ausencias de los últimos 6 meses.")).toBeInTheDocument();
  });

  it("keeps counting the lessons it receives", () => {
    store.lessons = [
      { id: "l1", date: "2026-11-02", start: "09:00", studentId: "s1", status: "presente" },
      { id: "l2", date: "2026-11-03", start: "09:00", studentId: "s1", status: "ausente" },
    ];
    store.students = [{ id: "s1", name: "Maxi Salas", balance: -1 }];

    renderPage();

    expect(screen.getAllByText("Maxi Salas").length).toBeGreaterThan(0);
    expect(screen.getByText("Ausencias")).toBeInTheDocument();
  });
});
