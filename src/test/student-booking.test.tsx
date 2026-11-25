import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/alumnos";

const { store } = vi.hoisted(() => ({ store: {
  students: [], lessons: [] as { date: string; start: string; status: string }[],
  settings: { startHour: 8, endHour: 22, blockMin: 60 }, busy: false, loading: false,
  addStudent: vi.fn(), updateStudent: vi.fn(), addLesson: vi.fn(), adjustBalance: vi.fn(),
} }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, activeOptions: _activeOptions, children, ...rest }: Record<string, unknown>) => (
      <a href={String(to)} {...rest}>{children as React.ReactNode}</a>
    ),
  };
});
vi.mock("@/lib/store", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/store")>(), useStore: () => store }));
vi.mock("@/server/data", () => ({
  getSnapshot: vi.fn(), addStudent: vi.fn(), updateStudent: vi.fn(), addLesson: vi.fn(),
  adjustBalance: vi.fn(), setLessonStatus: vi.fn(), saveSettings: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); store.lessons = []; store.addStudent.mockResolvedValue("student-1"); store.addLesson.mockResolvedValue(true); });

function openEditor() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing student page");
  render(<Component />);
  fireEvent.click(screen.getByRole("button", { name: "Nuevo alumno" }));
  fireEvent.change(screen.getByLabelText("Nombre y apellido"), { target: { value: "María Pérez" } });
}
function chooseLesson() {
  fireEvent.click(screen.getByRole("switch", { name: "Agregar clase a la agenda" }));
  fireEvent.change(screen.getByLabelText("Día de la clase"), { target: { value: "2026-11-02" } });
  fireEvent.change(screen.getByLabelText("Horario"), { target: { value: "09:00" } });
}
describe("payment modes in the editor", () => {
  it("offers the three modes plus an undecided option", () => {
    openEditor();

    expect(screen.getByRole("button", { name: "Mensual" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pago individual" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paga grupal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sin definir" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Semanal" })).toBeNull();
  });
});

describe("weekly slots in the editor", () => {
  it("adds several slots and saves them", async () => {
    openEditor();

    fireEvent.click(screen.getByRole("button", { name: "Agregar horario" }));
    fireEvent.change(screen.getByLabelText("Día del horario 1"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Hora del horario 1"), { target: { value: "14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar horario" }));
    fireEvent.change(screen.getByLabelText("Día del horario 2"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Hora del horario 2"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(store.addStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          slots: [
            { weekday: 5, time: "14:00" },
            { weekday: 2, time: "09:00" },
          ],
        }),
      ),
    );
  });

  it("will not save while a slot still has no time", () => {
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Agregar horario" }));

    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("booking from student form", () => {
  it("saves four paid classes and books the selected date and time for that student", async () => {
    openEditor();
    fireEvent.change(screen.getByLabelText("Clases pagadas (cantidad)"), { target: { value: "4" } });
    chooseLesson();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y reservar" }));
    await waitFor(() => expect(store.addLesson).toHaveBeenCalledWith({ date: "2026-11-02", start: "09:00", studentId: "student-1" }));
    expect(store.addStudent).toHaveBeenCalledWith({ name: "María Pérez", type: "fijo", pay: null, phone: null, category: null, courtSide: null, slots: [], balance: 4, active: true });
  });
  it("retries a failed booking without creating another student", async () => {
    store.addLesson.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    openEditor(); chooseLesson();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y reservar" }));
    await screen.findByText("Alumno guardado. Falta confirmar la reserva.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar y reservar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar y reservar" }));
    await waitFor(() => expect(store.addLesson).toHaveBeenCalledTimes(2));
    expect(store.addStudent).toHaveBeenCalledTimes(1);
  });
  // The student form now also has a weekly-slot time selector, so these must be
  // scoped to the booking selector.
  const bookingSlots = () =>
    [...screen.getByLabelText("Horario").querySelectorAll("option")].map((o) => o.textContent);

  it("still offers a slot that already has students but room for more", () => {
    store.lessons = [
      { date: "2026-11-02", start: "09:00", status: "programada" },
      { date: "2026-11-02", start: "09:00", status: "programada" },
      { date: "2026-11-02", start: "09:00", status: "programada" },
    ];
    openEditor(); chooseLesson();
    expect(bookingSlots()).toContain("09:00");
  });
  it("does not offer a slot that already has four students", () => {
    store.lessons = Array.from({ length: 4 }, () => ({ date: "2026-11-02", start: "09:00", status: "programada" }));
    openEditor(); chooseLesson();
    expect(bookingSlots()).not.toContain("09:00");
  });
  it("does not count a cancelled student against the four places", () => {
    store.lessons = [
      { date: "2026-11-02", start: "09:00", status: "programada" },
      { date: "2026-11-02", start: "09:00", status: "programada" },
      { date: "2026-11-02", start: "09:00", status: "programada" },
      { date: "2026-11-02", start: "09:00", status: "cancelada" },
    ];
    openEditor(); chooseLesson();
    expect(bookingSlots()).toContain("09:00");
  });
});

describe("booking is only offered for a fijo student", () => {
  it("hides the option once the student is rotativo", () => {
    openEditor();
    expect(screen.getByRole("switch", { name: "Agregar clase a la agenda" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rotativo" }));

    expect(screen.queryByRole("switch", { name: "Agregar clase a la agenda" })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("does not book a class chosen before switching the student to rotativo", async () => {
    openEditor();
    chooseLesson();
    fireEvent.click(screen.getByRole("button", { name: "Rotativo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(store.addStudent).toHaveBeenCalled());
    expect(store.addLesson).not.toHaveBeenCalled();
  });
});

describe("player profile in the student form", () => {
  it("saves the padel category and the court side with the student", async () => {
    openEditor();
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "3ra" } });
    fireEvent.change(screen.getByLabelText("Posición"), { target: { value: "reves" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(store.addStudent).toHaveBeenCalledWith(expect.objectContaining({ category: "3ra", courtSide: "reves" })),
    );
  });

  it("starts empty and stores no profile by default", async () => {
    openEditor();
    expect((screen.getByLabelText("Categoría") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Posición") as HTMLSelectElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(store.addStudent).toHaveBeenCalledWith(expect.objectContaining({ category: null, courtSide: null })),
    );
  });
});