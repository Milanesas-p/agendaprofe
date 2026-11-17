import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StoreProvider, useStore } from "@/lib/store";
import type { Student } from "@/lib/store";

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

const fixedBeto: Student = {
  id: "s1",
  name: "Beto",
  type: "fijo",
  pay: null,
  phone: null,
  category: null,
  courtSide: null,
  slots: [{ weekday: 5, time: "17:00" }],
  balance: 0,
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

describe("saving the working hours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSnapshot.mockResolvedValue({ students: [], lessons: [], settings: hours });
    materializeRecurring.mockResolvedValue({ created: 0, conflicts: [] });
    saveSettings.mockResolvedValue({ created: 0, conflicts: [] });
  });

  it("needs no second round trip: the save already topped up the fixed slots", async () => {
    const view = await mount();
    // The first load already topped up; only the save is under test here.
    materializeRecurring.mockClear();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(materializeRecurring).toHaveBeenCalledTimes(0);
    view.unmount();
  });

  it("shows the conflicts the save came back with", async () => {
    saveSettings.mockResolvedValue({
      created: 0,
      conflicts: [
        { studentId: "s1", studentName: "Ana", date: "2026-10-30", time: "14:00", reason: "full" },
      ],
    });
    const view = await mount();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "No se pudo agendar a Ana el 2026-10-30 a las 14:00: la clase está llena.",
    );
    view.unmount();
  });

  it("refuses a day that leaves a fixed student out, before asking the server", async () => {
    getSnapshot.mockResolvedValue({ students: [fixedBeto], lessons: [], settings: hours });
    const view = await mount();
    let saved: boolean | undefined;

    await act(async () => {
      saved = await store?.setSettings({ ...hours, endHour: 17 });
    });

    expect(saved).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Beto tiene horario fijo fuera de la jornada: 17:00.");
    view.unmount();
  });

  it("blames the workday, not a full block, when a fixed slot fell outside it", async () => {
    materializeRecurring.mockResolvedValue({
      created: 0,
      conflicts: [
        {
          studentId: "s1",
          studentName: "Beto",
          date: "2026-10-28",
          time: "23:00",
          reason: "outside-blocks",
        },
      ],
    });

    render(
      <StoreProvider>
        <div />
      </StoreProvider>,
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Beto tiene horario fijo a las 23:00, fuera de la jornada configurada.",
      ),
    );
  });
});
