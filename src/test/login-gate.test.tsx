import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  store: {
    user: null as { id: string; email: string } | null,
    loading: false,
    busy: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    students: [],
    lessons: [],
    settings: { startHour: 8, endHour: 22, blockMin: 60 },
  },
}));

vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));

// AppShell renders router primitives that need a live route tree; only the gate matters here.
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  Link: ({ to, activeOptions: _activeOptions, children, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} {...rest}>{children as React.ReactNode}</a>
  ),
  useNavigate: () => navigate,
}));

import { AppShell } from "@/components/AppShell";

const CONTACT = /sumar nuestro sistema a tus clases/i;

beforeEach(() => {
  vi.clearAllMocks();
  store.user = null;
  store.loading = false;
});
afterEach(cleanup);

describe("login gate", () => {
  it("shows only the login screen when there is no session", () => {
    render(<AppShell />);

    expect(screen.getByLabelText("Correo electrónico")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    // The agenda and its navigation are not reachable while logged out.
    expect(screen.queryByText("Agenda")).toBeNull();
    expect(screen.queryByText("Resumen")).toBeNull();
  });

  it("offers the contact section instead of a registration form", () => {
    render(<AppShell />);

    expect(screen.getByText(CONTACT)).toBeTruthy();
    expect(screen.getByRole("link", { name: /contactate/i }).getAttribute("href")).toBe(
      "https://wa.me/5492302666351",
    );
    expect(screen.queryByText(/crear cuenta/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /crear cuenta/i })).toBeNull();
  });

  it("shows the app shell once there is a session", () => {
    store.user = { id: "owner", email: "profe@padel.com" };
    render(<AppShell />);

    // Both navigations render; CSS picks the sidebar or the tab bar by width.
    expect(screen.getByRole("navigation", { name: "Navegación lateral" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Navegación inferior" })).toBeTruthy();
    expect(screen.getAllByText("Agenda").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alumnos").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Nueva clase").length).toBeGreaterThan(0);
    expect(screen.queryByText(CONTACT)).toBeNull();
  });
});
