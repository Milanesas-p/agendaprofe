import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/alumnos";

const { store } = vi.hoisted(() => ({ store: {
  students: [], lessons: [] as { date: string; start: string; status: string }[],
  settings: { startHour: 8, endHour: 22, blockMin: 60 }, busy: false, loading: false,
  addStudent: vi.fn(), updateStudent: vi.fn(), addLesson: vi.fn(), adjustBalance: vi.fn(),
} }));
vi.mock("@/lib/store", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/store")>(), useStore: () => store }));
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
    expect(store.addStudent).toHaveBeenCalledWith({ name: "María Pérez", type: "fijo", pay: "mensual", balance: 4 });
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
  it("does not offer occupied slots on the selected day", () => {
    store.lessons = [{ date: "2026-11-02", start: "09:00", status: "programada" }];
    openEditor(); chooseLesson();
    expect(screen.queryByRole("option", { name: "09:00" })).toBeNull();
  });
});