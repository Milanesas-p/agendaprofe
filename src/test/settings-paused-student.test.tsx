import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StoreProvider, useStore } from "@/lib/store";
import type { Student } from "@/lib/store";

// S3: the workday validation must ignore paused students, mirroring the server
// (saveSettings filters `s.active = 1`). Pausing must free the schedule.

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

const beto: Student = {
  id: "s1",
  name: "Beto",
  type: "fijo",
  pay: null,
  phone: null,
  category: null,
  courtSide: null,
  slots: [{ weekday: 5, time: "17:00" }],
  balance: 0,
  active: false,
};

let store: ReturnType<typeof useStore> | undefined;

function Probe() {
  store = useStore();
  return null;
}

async function mount() {
  store = undefined;
  const view = render(
    <StoreProvider>
      <Probe />
    </StoreProvider>,
  );
  await waitFor(() => expect(store?.loading).toBe(false));
  return view;
}

describe("workday validation with paused students", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSnapshot.mockResolvedValue({ students: [], lessons: [], settings: hours });
    materializeRecurring.mockResolvedValue({ created: 0, conflicts: [] });
    saveSettings.mockResolvedValue({ created: 0, conflicts: [] });
  });

  it("lets the teacher narrow the workday while a paused student slot falls outside it", async () => {
    getSnapshot.mockResolvedValue({ students: [beto], lessons: [], settings: hours });
    const view = await mount();

    await act(async () => {
      await store?.setSettings({ ...hours, endHour: 17 });
    });

    expect(saveSettings).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("still blocks an active student whose slot falls outside the narrowed workday", async () => {
    getSnapshot.mockResolvedValue({
      students: [{ ...beto, active: true }],
      lessons: [],
      settings: hours,
    });
    const view = await mount();
    let saved: boolean | undefined;

    await act(async () => {
      saved = await store?.setSettings({ ...hours, endHour: 17 });
    });

    expect(saved).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error).mock.calls.map((call) => String(call[0]))).toContain(
      "Beto tiene horario fijo fuera de la jornada configurada: 17:00.",
    );
    view.unmount();
  });
});
