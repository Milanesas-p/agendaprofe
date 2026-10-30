import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/importar";

const { store, navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  store: {
    settings: { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null },
    busy: false,
    importStudents: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: Record<string, unknown>) => <a href={String(to)} {...rest}>{children as React.ReactNode}</a>,
    useNavigate: () => navigate,
  };
});
vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));
vi.mock("@/server/data", () => ({
  getSnapshot: vi.fn(),
  addStudent: vi.fn(),
  updateStudent: vi.fn(),
  addLesson: vi.fn(),
  adjustBalance: vi.fn(),
  setLessonStatus: vi.fn(),
  saveSettings: vi.fn(),
  saveNoticeTemplate: vi.fn(),
  importStudents: vi.fn(),
  moveLesson: vi.fn(),
  materializeRecurring: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing import page");
  return render(<Component />);
}

const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText("Alumnos pegados"), { target: { value: text } });
};

beforeEach(() => {
  vi.clearAllMocks();
  store.settings = { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null };
  store.importStudents.mockResolvedValue(1);
});
afterEach(cleanup);

describe("import page", () => {
  it("previews the pasted rows before saving anything", () => {
    renderPage();
    paste("nombre,telefono\nMaxi Salas,2302666351");

    expect(screen.getByText("Maxi Salas")).toBeTruthy();
    expect(screen.getByText("1 listo · 0 con problemas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar 1 alumno" })).toBeTruthy();
  });

  it("explains the broken rows and still offers the good ones", () => {
    renderPage();
    paste("nombre,telefono,categoria\nMaxi Salas,2302666351,8va\n,2302666351,4ta");

    expect(screen.getByText("Falta el nombre.")).toBeTruthy();
    expect(screen.getByText("1 listo · 1 con problemas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar 1 alumno" })).toBeTruthy();
  });

  it("warns when the paste has no header row", () => {
    renderPage();
    paste("Maxi Salas\t2302666351");

    expect(screen.getByText("La primera fila tiene que traer los títulos de las columnas.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Importar \d/ })).toBeNull();
  });

  it("sends only the ready rows and goes back to the directory", async () => {
    renderPage();
    paste("nombre,telefono,dia,hora\nMaxi Salas,2302666351,lunes,14:00\n,2302666351,,");
    fireEvent.click(screen.getByRole("button", { name: "Importar 1 alumno" }));

    await vi.waitFor(() => expect(store.importStudents).toHaveBeenCalledTimes(1));
    expect(store.importStudents.mock.calls[0]?.[0]).toEqual([
      {
        name: "Maxi Salas",
        phone: "5492302666351",
        type: "fijo",
        pay: "mensual",
        category: null,
        courtSide: null,
        recurringWeekday: 1,
        recurringTime: "14:00",
      },
    ]);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/alumnos" }));
  });

  it("shows nothing to import on an empty page", () => {
    renderPage();

    expect(screen.queryByText(/listo/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Importar \d/ })).toBeNull();
  });
});
