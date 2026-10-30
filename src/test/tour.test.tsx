import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tour } from "@/components/Tour";

const { store } = vi.hoisted(() => ({
  store: {
    user: { id: "u1", email: "profe@example.com", name: "Genaro", tourDone: false } as null | {
      id: string;
      email: string;
      name: string | null;
      tourDone: boolean;
    },
    busy: false,
    finishTour: vi.fn(),
  },
}));

vi.mock("@/lib/store", () => ({ useStore: () => store }));

beforeEach(() => {
  vi.clearAllMocks();
  store.user = { id: "u1", email: "profe@example.com", name: "Genaro", tourDone: false };
});
afterEach(cleanup);

describe("welcome tour", () => {
  it("starts on the first bubble when the account never finished it", () => {
    render(<Tour />);

    expect(screen.getByText("1 de 4")).toBeTruthy();
    expect(screen.getByText("Elegí el día")).toBeTruthy();
  });

  it("walks the four bubbles and closes on the last one", () => {
    render(<Tour />);

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("2 de 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByText("4 de 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));

    expect(store.finishTour).toHaveBeenCalledTimes(1);
  });

  it("lets the teacher skip it from any bubble", () => {
    render(<Tour />);

    fireEvent.click(screen.getByRole("button", { name: "Saltear" }));

    expect(store.finishTour).toHaveBeenCalledTimes(1);
  });

  it("stays out of the way once the account has seen it", () => {
    store.user = { id: "u1", email: "profe@example.com", name: "Genaro", tourDone: true };
    render(<Tour />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("also stays out when nobody is signed in", () => {
    store.user = null;
    render(<Tour />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
