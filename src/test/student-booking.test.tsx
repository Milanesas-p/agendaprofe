import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/alumnos";

const { store } = vi.hoisted(() => ({ store: {
  students: [], lessons: [] as { date: string; start: string; status: string }[],
  settings: { startHour: 8, endHour: 22, blockMin: 60 }, busy: false, loading: false,
  addStudent: vi.fn(), updateStudent: vi.fn(), addLesson: vi.fn(), adjustBalance: vi.fn(),
} }));
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
describe("booking from student form", () => {
  it("saves four paid classes and books the selected date and time for that student", async () => {
    openEditor();
    fireEvent.change(screen.getByLabelText("Clases pagadas (cantidad)"), { target: { value: "4" } });
    chooseLesson();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y reservar" }));
    await waitFor(() => expect(store.addLesson).toHaveBeenCalledWith({ date: "2026-11-02", start: "09:00", studentId: "student-1" }));
    expect(store.addStudent).toHaveBeenCalledWith({ name: "María Pérez", type: "fijo", pay: "mensual", phone: null, recurringWeekday: null, recurringTime: null, balance: 4 });
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