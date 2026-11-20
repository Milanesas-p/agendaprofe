import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/admin";

const { store, listAccounts, createTeacher, setTeacherActive, resetTeacherPassword } = vi.hoisted(() => ({
  store: { user: { id: "admin-1", email: "duenio@padel.com", name: null, role: "admin" } as { role: string } | null },
  listAccounts: vi.fn(),
  createTeacher: vi.fn(),
  setTeacherActive: vi.fn(),
  resetTeacherPassword: vi.fn(),
}));

vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));
vi.mock("@/server/admin", () => ({ listAccounts, createTeacher, setTeacherActive, resetTeacherPassword }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const eze = {
  id: "user-1",
  email: "ezeprueba@gmail.com",
  name: "Eze",
  role: "profe" as const,
  active: true,
  students: 62,
  lessons30: 18,
  lastLogin: "2026-11-20 10:00:00",
};

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing admin page");
  render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.user = { role: "admin" };
  listAccounts.mockResolvedValue([eze]);
  createTeacher.mockResolvedValue({ id: "user-2", email: "nuevo@padel.com" });
  setTeacherActive.mockResolvedValue(null);
  resetTeacherPassword.mockResolvedValue(null);
});
afterEach(cleanup);

describe("operator panel", () => {
  it("lists each account with its usage", async () => {
    renderPage();

    expect(await screen.findByText("ezeprueba@gmail.com")).toBeTruthy();
    expect(screen.getByText(/62 alumnos/)).toBeTruthy();
    expect(screen.getByText(/18 clases en 30 días/)).toBeTruthy();
  });

  it("closes the door to a teacher without asking the server", async () => {
    store.user = { role: "profe" };
    renderPage();

    expect(screen.getByText("No tenés permiso para ver esta pantalla.")).toBeTruthy();
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("suspends an active account", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Suspender" }));

    await waitFor(() => expect(setTeacherActive).toHaveBeenCalledWith({ data: { id: "user-1", active: false } }));
  });

  it("creates a teacher with the typed values", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Correo del profe"), { target: { value: "nuevo@padel.com" } });
    fireEvent.change(screen.getByLabelText("Nombre del profe"), { target: { value: "Nuevo" } });
    fireEvent.change(screen.getByLabelText("Clave inicial"), { target: { value: "clave1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear profe" }));

    await waitFor(() =>
      expect(createTeacher).toHaveBeenCalledWith({
        data: { email: "nuevo@padel.com", name: "Nuevo", password: "clave1234" },
      }),
    );
  });

  it("resets a password only after the operator types a new one", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Resetear clave" }));
    fireEvent.change(screen.getByLabelText("Nueva clave para ezeprueba@gmail.com"), {
      target: { value: "otraClave1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar clave" }));

    await waitFor(() =>
      expect(resetTeacherPassword).toHaveBeenCalledWith({
        data: { email: "ezeprueba@gmail.com", password: "otraClave1" },
      }),
    );
  });
});
