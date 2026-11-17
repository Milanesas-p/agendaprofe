import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemePrompt } from "@/components/ThemePrompt";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(cleanup);

describe("first-run theme prompt", () => {
  it("asks on a fresh device and applies the chosen theme", () => {
    render(<ThemePrompt />);

    expect(screen.getByText("¿Cómo querés ver la app?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar el tema oscuro" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("ppm-theme")).toBe("dark");
    expect(screen.queryByText("¿Cómo querés ver la app?")).toBeNull();
  });

  it("stays quiet when the device already saved a choice", () => {
    localStorage.setItem("ppm-theme", "light");

    render(<ThemePrompt />);

    expect(screen.queryByText("¿Cómo querés ver la app?")).toBeNull();
  });
});
