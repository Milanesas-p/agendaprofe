import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/nueva-clase";
import { iso } from "@/lib/store";

const { store, navigate } = vi.hoisted(() => ({
  store: {
    students: [] as { id: string; name: string; active?: boolean }[],
    lessons: [] as { id: string; date: string; start: string; studentId: string; status: string }[],
    settings: { startHour: 8, endHour: 11, blockMin: 60 },
    busy: false,
    loading: false,
    addLesson: vi.fn(),
    updateStudent: vi.fn(),
  },
  navigate: vi.fn(),
}));

vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("@/server/data", () => ({
  getSnapshot: vi.fn(), addStudent: vi.fn(), updateStudent: vi.fn(), addLesson: vi.fn(),
  adjustBalance: vi.fn(), setLessonStatus: vi.fn(), saveSettings: vi.fn(),
  materializeRecurring: vi.fn(), moveLesson: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const today = iso(new Date());
const student = (id: string, name: string) => ({ id, name });
const lesson = (id: string, studentId: string, start = "09:00") => ({
  id, date: today, start, studentId, status: "programada",
});

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing new-class page");
  render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.lessons = [];
  store.addLesson.mockResolvedValue(true);
});
afterEach(cleanup);

describe("new class flow", () => {
  it("books the chosen student in the chosen free block", async () => {
    store.students = [student("s1", "Mateo Rossi")];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Mateo Rossi" }));
    fireEvent.click(screen.getByRole("button", { name: "09:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Reservar clase" }));

    await waitFor(() => expect(store.addLesson).toHaveBeenCalledWith({ date: today, start: "09:00", studentId: "s1" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("keeps the button disabled until a student and a block are chosen", () => {
    store.students = [student("s1", "Mateo Rossi")];
    renderPage();

    expect(screen.getByRole("button", { name: "Reservar clase" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Mateo Rossi" }));
    expect(screen.getByRole("button", { name: "Reservar clase" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "09:00" }));
    expect(screen.getByRole("button", { name: "Reservar clase" })).toHaveProperty("disabled", false);
  });

  it("does not offer a block that already holds four students", () => {
    store.students = [student("s1", "Mateo Rossi")];
    store.lessons = ["a", "b", "c", "d"].map((id) => lesson(id, `other-${id}`));
    renderPage();

    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
    expect(screen.getByRole("button", { name: "10:00" })).toBeTruthy();
  });

  it("says there is no free block when every block is full", () => {
    store.students = [student("s1", "Mateo Rossi")];
    store.lessons = ["08:00", "09:00", "10:00"].flatMap((start) =>
      ["a", "b", "c", "d"].map((id) => lesson(`${start}-${id}`, `other-${start}-${id}`, start)),
    );
    renderPage();

    expect(screen.getByRole("status").textContent).toContain("No hay horarios libres");
  });

  it("does not offer a block where the chosen student already has a class", () => {
    store.students = [student("s1", "Mateo Rossi"), student("s2", "Sofía Valenzuela")];
    store.lessons = [lesson("l1", "s1")];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Mateo Rossi" }));

    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
    expect(screen.getByRole("button", { name: "10:00" })).toBeTruthy();
  });

  it("filters the student list with the search box", () => {
    store.students = [student("s1", "Mateo Rossi"), student("s2", "Sofía Valenzuela")];
    renderPage();

    fireEvent.change(screen.getByLabelText("Buscar alumno para la clase"), { target: { value: "sof" } });

    expect(screen.queryByRole("button", { name: "Mateo Rossi" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sofía Valenzuela" })).toBeTruthy();
  });

  it("offers a paused student and reactivates them before selecting", async () => {
    store.students = [
      { id: "s1", name: "Baja Verano", active: false },
      student("s2", "Mateo Rossi"),
    ];
    store.updateStudent.mockResolvedValue(true);
    renderPage();

    expect(screen.getByRole("button", { name: /Baja Verano/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Baja Verano/ }));

    expect(screen.getByText("Ese alumno está inactivo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, reactivar" }));

    await waitFor(() =>
      expect(store.updateStudent).toHaveBeenCalledWith("s1", expect.objectContaining({ active: true })),
    );
    expect(screen.getByRole("button", { name: /Baja Verano/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves a paused student unselected when the teacher says no", () => {
    store.students = [{ id: "s1", name: "Baja Verano", active: false }];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Baja Verano/ }));
    fireEvent.click(screen.getByRole("button", { name: "No" }));

    expect(store.updateStudent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Baja Verano/ }).getAttribute("aria-pressed")).toBe("false");
  });
});
