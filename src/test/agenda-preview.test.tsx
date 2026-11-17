import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgendaPreview } from "@/components/AgendaPreview";

// Wednesday 18/11/2026: the week on the card is Monday 16 to Sunday 22.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T12:00:00"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const dayButton = (name: string) => screen.getByRole("button", { name });

describe("login agenda preview", () => {
  it("starts on today and follows the tapped day", () => {
    render(<AgendaPreview />);

    expect(dayButton("miércoles 18").getAttribute("aria-pressed")).toBe("true");
    expect(dayButton("09:00, 2 alumnos")).toBeTruthy();
    expect(dayButton("17:00, 1 alumno")).toBeTruthy();

    fireEvent.click(dayButton("viernes 20"));

    expect(dayButton("viernes 20").getAttribute("aria-pressed")).toBe("true");
    expect(dayButton("miércoles 18").getAttribute("aria-pressed")).toBe("false");
    expect(dayButton("17:00, 2 alumnos")).toBeTruthy();
  });

  it("opens a block to show its students", () => {
    render(<AgendaPreview />);
    fireEvent.click(dayButton("jueves 19"));

    const block = dayButton("10:00, 3 alumnos");
    expect(block.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(block);

    expect(block.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Vale")).toBeTruthy();
    expect(screen.getByText("6ta · Drive · 10:00")).toBeTruthy();
    expect(screen.getByText("Joaco")).toBeTruthy();
    expect(screen.getByText("Lu")).toBeTruthy();
  });

  it("says Libre on a day without classes", () => {
    render(<AgendaPreview />);

    fireEvent.click(dayButton("domingo 22"));

    expect(screen.getByText("No hay clases programadas.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /alumno/ })).toBeNull();
  });
});
