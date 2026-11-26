import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/alumnos";

const { store, success } = vi.hoisted(() => ({
  store: {
    students: [] as unknown[],
    lessons: [],
    settings: { startHour: 8, endHour: 22, blockMin: 60 },
    busy: false,
    loading: false,
    addStudent: vi.fn(),
    updateStudent: vi.fn(),
    addLesson: vi.fn(),
    adjustBalance: vi.fn(),
  },
  success: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, activeOptions: _activeOptions, children, ...rest }: Record<string, unknown>) => (
      <a href={String(to)} {...rest}>{children as React.ReactNode}</a>
    ),
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
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success } }));

const student = (over: Record<string, unknown> = {}) => ({
  id: "student-1",
  name: "María Pérez",
  type: "fijo",
  pay: "mensual",
  phone: null,
  category: null,
  courtSide: null,
  slots: [],
  balance: 0,
  active: true,
  ...over,
});

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing student page");
  render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.adjustBalance.mockResolvedValue(true);
  store.updateStudent.mockResolvedValue(true);
});
afterEach(cleanup);

describe("student list", () => {
  it("shows the weekly slot on the student line", () => {
    store.students = [student({ slots: [{ weekday: 5, time: "14:00" }] })];
    renderPage();

    expect(screen.getByText(/Viernes 14:00/)).toBeTruthy();
  });

  it("shows no slot for a student without a fixed schedule", () => {
    store.students = [student({ id: "student-2", name: "Beto Gómez" })];
    renderPage();

    expect(screen.queryByText(/^\w+ \d\d:\d\d$/)).toBeNull();
  });

  it("shows the padel category and the court side on the student line", () => {
    store.students = [student({ category: "3ra", courtSide: "reves" })];
    renderPage();

    expect(screen.getByText("fijo · 3ra · Revés")).toBeTruthy();
  });

  it("shows nothing extra when the profile is empty", () => {
    store.students = [student()];
    renderPage();

    expect(screen.queryByText(/Revés/)).toBeNull();
  });

  it("states the balance in words instead of the number tag", () => {
    store.students = [student({ balance: -2 })];
    renderPage();

    expect(screen.getByText("Debe 2 clases")).toBeTruthy();
  });

  it("keeps payment out of the row: it belongs to the editor", () => {
    store.students = [student({ pay: "grupal" })];
    renderPage();

    expect(screen.queryByText("Paga grupal")).toBeNull();
  });
  it("offers the import shortcut next to a new student", () => {
    renderPage();

    expect(screen.getByLabelText("Importar alumnos").getAttribute("href")).toBe("/importar");
  });

  it("adds a column header for the desktop directory table", () => {
    store.students = [student()];
    renderPage();

    expect(screen.getByText("Alumno")).toBeTruthy();
    expect(screen.getByText("Saldo")).toBeTruthy();
    expect(screen.getByText("Clases")).toBeTruthy();
  });

  it("marks a disabled student and keeps them in the directory", () => {
    store.students = [student({ name: "Baja Verano", active: false })];
    renderPage();

    expect(screen.getByText("Baja Verano")).toBeTruthy();
    expect(screen.getByText("Inactivo")).toBeTruthy();
  });

  it("filters the directory down to disabled students", async () => {
    store.students = [
      student({ id: "s1", name: "Activo Uno", active: true }),
      student({ id: "s2", name: "Baja Verano", active: false }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "inactivos" }));

    expect(screen.queryByText("Activo Uno")).toBeNull();
    expect(screen.getByText("Baja Verano")).toBeTruthy();
  });
});

describe("pausing from the row", () => {
  it("explains the consequence and pauses the student", async () => {
    store.students = [student()];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar a María Pérez" }));

    expect(screen.getByText("Deshabilitar alumno")).toBeTruthy();
    expect(
      screen.getByText(/Se borran sus clases futuras programadas y se libera el cupo/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar" }));

    await waitFor(() =>
      expect(store.updateStudent).toHaveBeenCalledWith(
        "student-1",
        expect.objectContaining({ active: false }),
      ),
    );
  });

  it("keeps the student active when the teacher cancels", () => {
    store.students = [student()];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar a María Pérez" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(store.updateStudent).not.toHaveBeenCalled();
  });

  it("reactivates a paused student from the row", async () => {
    store.students = [student({ id: "s1", name: "Baja Verano", active: false })];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Reactivar a Baja Verano" }));

    expect(screen.getByText("Ese alumno está inactivo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, reactivar" }));

    await waitFor(() =>
      expect(store.updateStudent).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ active: true }),
      ),
    );
  });
});

describe("monthly top-up", () => {
  it("adds a whole month from the presets and suggests the weekly plan", async () => {
    store.students = [
      student({ slots: [{ weekday: 3, time: "09:00" }, { weekday: 5, time: "09:00" }] }),
    ];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sumar clase" }));

    expect(screen.getByText("Cargá el mes de María Pérez en un solo movimiento.")).toBeTruthy();
    expect(screen.getByText("2 veces por semana")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sumar 8 clases" }));

    await waitFor(() => expect(store.adjustBalance).toHaveBeenCalledWith("student-1", 8));
    expect(success).toHaveBeenCalledWith(
      "Sumaste 8 clases a María Pérez",
      expect.objectContaining({ description: "8 clases a favor" }),
    );
  });

  it("keeps the single tap for a student who is not monthly", () => {
    store.students = [student({ pay: "individual" })];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sumar clase" }));

    expect(store.adjustBalance).toHaveBeenCalledWith("student-1", 1);
    expect(screen.queryByText(/Cargá el mes/)).toBeNull();
  });

  it("undoes a monthly top-up from the toast", async () => {
    store.students = [
      student({ slots: [{ weekday: 3, time: "09:00" }, { weekday: 5, time: "09:00" }] }),
    ];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sumar clase" }));
    fireEvent.click(screen.getByRole("button", { name: "Sumar 8 clases" }));
    await waitFor(() => expect(success).toHaveBeenCalled());

    const options = success.mock.calls[0]?.[1] as {
      action: { label: string; onClick: () => void };
    };
    expect(options.action.label).toBe("Deshacer");
    options.action.onClick();

    expect(store.adjustBalance).toHaveBeenLastCalledWith("student-1", -8);
  });
});
