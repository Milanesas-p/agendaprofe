import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, signIn } = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => ({ signIn, busy: false }),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

import { LoginScreen } from "@/components/LoginScreen";

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("login screen", () => {
  it("sends the teacher to the calendar after a successful login", async () => {
    signIn.mockResolvedValue(null);
    render(<LoginScreen />);

    fill("profe@padel.com", "clave1234");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(signIn).toHaveBeenCalledWith("profe@padel.com", "clave1234");
  });

  it("shows the error and stays on the login screen when credentials are rejected", async () => {
    signIn.mockResolvedValue("Correo o contraseña incorrectos.");
    render(<LoginScreen />);

    fill("profe@padel.com", "clave1234");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Correo o contraseña incorrectos."),
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
