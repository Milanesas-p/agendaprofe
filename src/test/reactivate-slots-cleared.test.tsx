import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as AlumnosRoute } from "@/routes/alumnos";
import { Route as AgendaRoute } from "@/routes/index";
import { Route as NuevaClaseRoute } from "@/routes/nueva-clase";
import { iso } from "@/lib/store";

/**
 * Guided reactivation (S4/S5): every shortcut must send `slots: []` so the old
 * weekly schedule dies with the pause, the agenda keeps booking the picked
 * class, "Nueva clase" keeps the student selected, and the directory row opens
 * the editor empty with the guidance notice.
 */

const { store, success } = vi.hoisted(() => ({
  store: {
    students: [] as unknown[],
    lessons: [] as unknown[],
    settings: { startHour: 8, endHour: 22, blockMin: 60 },
    busy: false,
    loading: false,
    addStudent: vi.fn(),
    updateStudent: vi.fn(),
    addLesson: vi.fn(),
    adjustBalance: vi.fn(),
    moveLesson: vi.fn(),
    setSettings: vi.fn(),
    setStatus: vi.fn(),
    setNotified: vi.fn(),
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
    useNavigate: () => async () => {},
  };
});
vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));
vi.mock("@/server/data", () => ({
  getSnapshot: vi.fn(), addStudent: vi.fn(), updateStudent: vi.fn(), addLesson: vi.fn(),
  adjustBalance: vi.fn(), setLessonStatus: vi.fn(), setLessonNotified: vi.fn(),
  saveSettings: vi.fn(), saveNoticeTemplate: vi.fn(), importStudents: vi.fn(),
  updateProfile: vi.fn(), materializeRecurring: vi.fn(), moveLesson: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn(), completeTour: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success }) }));

const today = iso(new Date());

const student = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "Baja Verano",
  type: "rotativo",
  pay: "mensual",
  phone: null,
  category: null,
  courtSide: null,
  slots: [{ weekday: 3, time: "09:00" }],
  balance: 0,
  active: false,
  ...over,
});

/** The exact payload a reactivation shortcut must send: old schedule cleared. */
const expectedPayload = {
  name: "Baja Verano",
  type: "rotativo",
  pay: "mensual",
  phone: null,
  category: null,
  courtSide: null,
  slots: [],
  active: true,
};

const renderRoute = (route: { options: { component?: unknown } }) => {
  const Component = route.options.component as React.ComponentType;
  if (!Component) throw new Error("Missing page component");
  render(<Component />);
};

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.lessons = [];
  store.addLesson.mockResolvedValue(true);
  store.updateStudent.mockResolvedValue(true);
  store.adjustBalance.mockResolvedValue(true);
});
afterEach(cleanup);

describe("reactivation from the directory row (S4)", () => {
  it("sends slots: [], toasts and opens the editor empty with the guidance notice", async () => {
    store.students = [student()];
    renderRoute(AlumnosRoute);

    fireEvent.click(screen.getByRole("button", { name: "Reactivar a Baja Verano" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, reactivar" }));

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Baja Verano reactivado. Configurá el alumno nuevamente."),
    );
    expect(store.updateStudent).toHaveBeenCalledTimes(1);
    expect(store.updateStudent).toHaveBeenCalledWith("s1", expectedPayload);
    expect(
      screen.getByText("Cargá los nuevos horarios de Baja Verano y guardá para volver a agendarlo."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Día del horario 1")).toBeNull();
  });
});

describe("reactivation from the agenda (S5)", () => {
  it("sends slots: [], toasts and books the picked class", async () => {
    store.students = [student()];
    renderRoute(AgendaRoute);

    fireEvent.click(screen.getByRole("button", { name: /^09:00,/ }));
    fireEvent.click(screen.getByRole("button", { name: /Agregar alumno/ }));
    fireEvent.click(screen.getByRole("button", { name: /Baja Verano/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, reactivar" }));

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Baja Verano reactivado. Configurá sus horarios en Alumnos."),
    );
    expect(store.updateStudent).toHaveBeenCalledTimes(1);
    expect(store.updateStudent).toHaveBeenCalledWith("s1", expectedPayload);
    await waitFor(() =>
      expect(store.addLesson).toHaveBeenCalledWith({ date: today, start: "09:00", studentId: "s1" }),
    );
  });

  it("does nothing when the teacher declines", async () => {
    store.students = [student()];
    renderRoute(AgendaRoute);

    fireEvent.click(screen.getByRole("button", { name: /^09:00,/ }));
    fireEvent.click(screen.getByRole("button", { name: /Agregar alumno/ }));
    fireEvent.click(screen.getByRole("button", { name: /Baja Verano/ }));
    fireEvent.click(screen.getByRole("button", { name: "No" }));

    expect(store.updateStudent).not.toHaveBeenCalled();
    expect(store.addLesson).not.toHaveBeenCalled();
  });
});

describe("reactivation from Nueva clase (S5)", () => {
  it("sends slots: [] and keeps the student selected", async () => {
    store.students = [student()];
    renderRoute(NuevaClaseRoute);

    fireEvent.click(screen.getByRole("button", { name: /Baja Verano/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, reactivar" }));

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Baja Verano reactivado. Configurá sus horarios en Alumnos."),
    );
    expect(store.updateStudent).toHaveBeenCalledTimes(1);
    expect(store.updateStudent).toHaveBeenCalledWith("s1", expectedPayload);
    expect(screen.getByRole("button", { name: /Baja Verano/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves the student unselected when the teacher declines", async () => {
    store.students = [student()];
    renderRoute(NuevaClaseRoute);

    fireEvent.click(screen.getByRole("button", { name: /Baja Verano/ }));
    fireEvent.click(screen.getByRole("button", { name: "No" }));

    expect(store.updateStudent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Baja Verano/ }).getAttribute("aria-pressed")).toBe("false");
  });
});
