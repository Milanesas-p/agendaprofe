import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { StoreProvider, useStore } from "@/lib/store";
import { fixedSlotsOutsideBlocks, outsideBlocksMessage } from "@/lib/rules";

/**
 * The client half of "the workday decides": the shared pure helper and the
 * conflict toasts, including a save that comes back with mixed causes.
 */

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

beforeEach(() => {
  vi.clearAllMocks();
  getSnapshot.mockResolvedValue({ students: [], lessons: [], settings: hours });
  materializeRecurring.mockResolvedValue({ created: 0, conflicts: [] });
  saveSettings.mockResolvedValue({ created: 0, conflicts: [] });
});

describe("the shared fixed-slot rule", () => {
  it("is silent when there are no fixed slots at all", () => {
    expect(fixedSlotsOutsideBlocks(hours, [])).toEqual([]);
  });

  it("judges only by time, not by weekday", () => {
    expect(
      fixedSlotsOutsideBlocks(hours, [
        { name: "Beto", time: "23:00" },
        { name: "Ana", time: "23:00" },
      ]),
    ).toEqual([
      { name: "Beto", time: "23:00" },
      { name: "Ana", time: "23:00" },
    ]);
  });

  it("joins exactly two names without a counter", () => {
    expect(
      outsideBlocksMessage([
        { name: "Beto", time: "17:00" },
        { name: "Caro", time: "18:00" },
      ]),
    ).toBe("Beto y Caro tienen horario fijo fuera de la jornada configurada: 17:00, 18:00.");
  });
});

describe("the conflict toast after saving", () => {
  it("names both causes when the save returns full and outside-blocks conflicts", async () => {
    saveSettings.mockResolvedValue({
      created: 0,
      conflicts: [
        {
          studentId: "s1",
          studentName: "Beto",
          date: "2026-10-28",
          time: "23:00",
          reason: "outside-blocks",
        },
        { studentId: "s2", studentName: "Ana", date: "2026-10-30", time: "14:00", reason: "full" },
      ],
    });
    const view = await mount();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Beto tiene horario fijo a las 23:00, fuera de la jornada configurada. " +
        "No se pudo agendar a Ana el 2026-10-30 a las 14:00: la clase está llena.",
    );
    view.unmount();
  });

  it("summarizes several full conflicts without inventing a new cause", async () => {
    saveSettings.mockResolvedValue({
      created: 0,
      conflicts: [
        { studentId: "s1", studentName: "Ana", date: "2026-10-30", time: "14:00", reason: "full" },
        { studentId: "s2", studentName: "Beto", date: "2026-10-31", time: "15:00", reason: "full" },
      ],
    });
    const view = await mount();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "2 clases fijas quedaron sin agendar porque el horario está lleno.",
    );
    view.unmount();
  });

  it("summarizes several outside conflicts with the workday wording", async () => {
    saveSettings.mockResolvedValue({
      created: 0,
      conflicts: [
        {
          studentId: "s1",
          studentName: "Ana",
          date: "2026-10-28",
          time: "22:00",
          reason: "outside-blocks",
        },
        {
          studentId: "s2",
          studentName: "Beto",
          date: "2026-10-28",
          time: "23:00",
          reason: "outside-blocks",
        },
      ],
    });
    const view = await mount();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "2 alumnos fijos tienen horario fuera de la jornada configurada.",
    );
    view.unmount();
  });

  it("does not call materializeRecurring after the save succeeds", async () => {
    const view = await mount();
    materializeRecurring.mockClear();

    await act(async () => {
      await store?.setSettings(hours);
    });

    expect(materializeRecurring).toHaveBeenCalledTimes(0);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe("the conflict toast on load", () => {
  it("blames a full block with the exact user wording", async () => {
    materializeRecurring.mockResolvedValue({
      created: 0,
      conflicts: [
        { studentId: "s1", studentName: "Ana", date: "2026-10-30", time: "14:00", reason: "full" },
      ],
    });
    const view = await mount();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo agendar a Ana el 2026-10-30 a las 14:00: la clase está llena.",
      ),
    );
    view.unmount();
  });
});
