import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
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
      await store?.updateStudent("student-1", { name: " María Pérez ", type: "rotativo", pay: "individual", phone: "5492302666351", slots: [{ weekday: 5, time: "14:00" }], category: "2da", courtSide: "drive", active: true });
    });

    expect(updateStudent).toHaveBeenCalledWith({
      data: { id: "student-1", name: "María Pérez", type: "rotativo", pay: "individual", phone: "5492302666351", slots: [{ weekday: 5, time: "14:00" }], category: "2da", courtSide: "drive", active: true },
    });
    view.unmount();
  });

  it("warns when a reactivated student cannot be booked in a full slot", async () => {
    updateStudent.mockResolvedValue({
      created: 0,
      conflicts: [
        { studentId: "s1", studentName: "Beto", date: "2026-11-27", time: "17:00", reason: "full" },
      ],
    });
    let store: ReturnType<typeof useStore> | undefined;
    function Probe() { store = useStore(); return null; }

    const view = render(<StoreProvider><Probe /></StoreProvider>);
    await waitFor(() => expect(store?.loading).toBe(false));

    await act(async () => {
      await store?.updateStudent("student-1", { name: "Beto", type: "fijo", pay: null, phone: null, slots: [], category: null, courtSide: null, active: true });
    });

    expect(toast.error).toHaveBeenCalledWith(
      "No se pudo agendar a Beto el 2026-11-27 a las 17:00: la clase está llena.",
    );
    view.unmount();
  });
});
