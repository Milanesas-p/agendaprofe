import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/configuracion";

const { store, navigate } = vi.hoisted(() => ({
  store: {
    user: { id: "u1", email: "profe@padel.com", name: "Genaro Stocco" } as {
      id: string;
      email: string;
      name: string | null;
    },
    settings: {
      startHour: 8,
      endHour: 17,
      blockMin: 60,
      breakStart: null as number | null,
      breakEnd: null as number | null,
    },
    busy: false,
    loading: false,
    setSettings: vi.fn(),
    updateProfile: vi.fn(),
    signOut: vi.fn(),
    startTour: vi.fn(),
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
  getSnapshot: vi.fn(),
  addStudent: vi.fn(),
  updateStudent: vi.fn(),
  addLesson: vi.fn(),
  adjustBalance: vi.fn(),
  setLessonStatus: vi.fn(),
  saveSettings: vi.fn(),
  materializeRecurring: vi.fn(),
  moveLesson: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  getCurrentUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing settings page");
  render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.user = { id: "u1", email: "profe@padel.com", name: "Genaro Stocco" };
  store.settings = { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null };
  store.setSettings.mockResolvedValue(true);
  store.updateProfile.mockResolvedValue(true);
  document.documentElement.classList.remove("dark");
});
afterEach(cleanup);

describe("settings screen", () => {
  it("shows who is signed in and saves a new display name", async () => {
    renderPage();

    const input = screen.getByLabelText("Nombre y apellido del profesor") as HTMLInputElement;
    expect(input.value).toBe("Genaro Stocco");

    fireEvent.change(input, { target: { value: "  Genaro Stocco Prado " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));

    await waitFor(() => expect(store.updateProfile).toHaveBeenCalledWith("Genaro Stocco Prado"));
  });

  it("saves a working day with a break in the middle", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Inicio del corte"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Fin del corte"), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar horarios" }));

    await waitFor(() =>
      expect(store.setSettings).toHaveBeenCalledWith({
        startHour: 8,
        endHour: 17,
        blockMin: 60,
        breakStart: 12,
        breakEnd: 14,
      }),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("saves a plain day when no break is chosen", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Guardar horarios" }));

    await waitFor(() =>
      expect(store.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ breakStart: null, breakEnd: null }),
      ),
    );
  });

  it("reopens the welcome tour from the settings screen", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Ver el tutorial" }));

    expect(store.startTour).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
  });

  it("switches the app to the dark theme", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
