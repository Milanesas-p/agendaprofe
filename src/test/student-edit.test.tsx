import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "@/lib/store";

const { updateStudent } = vi.hoisted(() => ({ updateStudent: vi.fn() }));

vi.mock("@/server/data", () => ({
  getSnapshot: vi.fn(async () => ({
    students: [],
    lessons: [],
    settings: { startHour: 8, endHour: 22, blockMin: 60 },
  })),
  updateStudent,
  addStudent: vi.fn(),
  addLesson: vi.fn(),
  adjustBalance: vi.fn(),
  setLessonStatus: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "owner", email: "owner@test" })),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => { vi.clearAllMocks(); });

describe("student editing", () => {
  it("saves name, type and payment without sending a balance", async () => {
    updateStudent.mockResolvedValue(undefined);
    let store: ReturnType<typeof useStore> | undefined;
    function Probe() { store = useStore(); return null; }

    const view = render(<StoreProvider><Probe /></StoreProvider>);
    await waitFor(() => expect(store?.loading).toBe(false));

    await act(async () => {
      await store?.updateStudent("student-1", { name: " María Pérez ", type: "rotativo", pay: "semanal", phone: "5492302666351" });
    });

    expect(updateStudent).toHaveBeenCalledWith({
      data: { id: "student-1", name: "María Pérez", type: "rotativo", pay: "semanal", phone: "5492302666351" },
    });
    view.unmount();
  });
});
