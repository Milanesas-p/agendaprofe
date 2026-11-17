import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "@/lib/store";

const { getSnapshot, materializeRecurring, saveSettings } = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  materializeRecurring: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@/server/data", () => ({
  getSnapshot,
  materializeRecurring,
  saveSettings,
  addStudent: vi.fn(),
  updateStudent: vi.fn(),
  addLesson: vi.fn(),
  adjustBalance: vi.fn(),
  setLessonStatus: vi.fn(),
  setLessonNotified: vi.fn(),
  moveLesson: vi.fn(),
  importStudents: vi.fn(),
  saveNoticeTemplate: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "owner", email: "owner@test" })),
  completeTour: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const hours = {
  startHour: 8,
  endHour: 18,
  blockMin: 60,
  breakStart: null,
  breakEnd: null,
  noticeTemplate: null,
};

describe("saving the working hours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSnapshot.mockResolvedValue({ students: [], lessons: [], settings: hours });
    materializeRecurring.mockResolvedValue({ created: 0, conflicts: [] });
    saveSettings.mockResolvedValue(undefined);
  });

  it("tops up the fixed slots right away, so a widened day needs no reload", async () => {
    let store: ReturnType<typeof useStore> | undefined;
    function Probe() {
      store = useStore();
      return null;
    }

    const view = render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await waitFor(() => expect(store?.loading).toBe(false));

    // The first load already topped up; only the save is under test here.
    materializeRecurring.mockClear();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(materializeRecurring).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
