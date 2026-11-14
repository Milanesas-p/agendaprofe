import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/alumnos";

const { store } = vi.hoisted(() => ({
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
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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
});
