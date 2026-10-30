import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
afterEach(() => {
  cleanup();
  delete (window as unknown as { innerHeight?: number }).innerHeight;
});

/** Puts an element where the layout would have put it and returns it. */
function anchor(name: string, rect: { top: number; left: number; width: number; height: number }) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", name);
  el.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  });
  document.body.appendChild(el);
  return el;
}

const spotlight = () => document.querySelector("[data-tour-spotlight]") as HTMLElement | null;

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

  it("cuts a hole exactly over the control the bubble is talking about", () => {
    const date = anchor("date", { top: 240, left: 16, width: 388, height: 40 });
    render(<Tour />);

    const hole = spotlight();
    expect(hole).toBeTruthy();
    expect(hole?.style.top).toBe(`${240 - 8}px`);
    expect(hole?.style.left).toBe(`${16 - 8}px`);
    expect(hole?.style.width).toBe(`${388 + 16}px`);
    expect(hole?.style.height).toBe(`${40 + 16}px`);
    date.remove();
  });

  it("finds the anchor when the agenda paints after the tour mounted", async () => {
    render(<Tour />);
    expect(spotlight()).toBeNull();

    anchor("date", { top: 240, left: 16, width: 388, height: 40 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 40)));

    expect(spotlight()?.style.top).toBe(`${240 - 8}px`);
  });

  it("moves the bubble away from a control that sits in the lower half", () => {
    (window as unknown as { innerHeight: number }).innerHeight = 800;
    const add = anchor("add", { top: 700, left: 180, width: 48, height: 48 });
    render(<Tour />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    const card = screen.getByText("2 de 4").parentElement as HTMLElement;
    expect(card.className).toContain("top-4");
    expect(card.className).not.toContain("bottom-24");
    add.remove();
  });
});
