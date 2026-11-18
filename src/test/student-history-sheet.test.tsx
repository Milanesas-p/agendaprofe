import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";
import { addDays, iso } from "@/lib/store";

const { store } = vi.hoisted(() => ({
  store: {
    students: [] as Record<string, unknown>[],
    lessons: [] as Record<string, unknown>[],
    settings: { startHour: 8, endHour: 10, blockMin: 60 },
    busy: false,
    loading: false,
    setStatus: vi.fn(),
    setNotified: vi.fn(),
    addLesson: vi.fn(),
    moveLesson: vi.fn(),
    setSettings: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, activeOptions: _activeOptions, children, ...rest }: Record<string, unknown>) => (
      <a href={String(to)} {...rest}>
        {children as React.ReactNode}
      </a>
    ),
  };
});
vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const today = iso(new Date());
const daysAgo = (n: number) => iso(addDays(new Date(), -n));

const student = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  type: "fijo",
  pay: "mensual",
  phone: null,
  category: null,
  courtSide: null,
  recurringWeekday: null,
  recurringTime: null,
  balance: 0,
  slots: [],
  ...over,
});
const lesson = (
  id: string,
  date: string,
  studentId: string,
  status = "programada",
  start = "09:00",
) => ({
  id,
  date,
  start,
  studentId,
  status,
  notified: false,
});

function openStudent(name: string) {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing agenda page");
  render(<Component />);
  fireEvent.click(screen.getByRole("button", { name: /^09:00,/ }));
  fireEvent.click(screen.getByRole("button", { name: `Opciones de ${name}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.lessons = [];
  store.addLesson.mockResolvedValue(true);
  store.moveLesson.mockResolvedValue(true);
  store.setStatus.mockResolvedValue(true);
  store.setNotified.mockResolvedValue(true);
});
afterEach(cleanup);

describe("student history in the profile sheet", () => {
  it("shows what the student attended and missed, newest first", () => {
    store.students = [student("s1", "Ana Ruiz")];
    store.lessons = [
      lesson("l1", today, "s1"),
      lesson("l2", daysAgo(7), "s1", "presente"),
      lesson("l3", daysAgo(14), "s1", "ausente"),
    ];

    openStudent("Ana Ruiz");

    const panel = screen.getByLabelText("Historial de clases");
    expect(within(panel).getByText(/1 presente/)).toBeTruthy();
    expect(within(panel).getByText(/1 ausente/)).toBeTruthy();
    const rows = within(panel).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Programada");
    expect(rows[1]?.textContent).toContain("Presente");
    expect(rows[2]?.textContent).toContain("Ausente");
  });

  it("keeps the list short and says how many older classes are left out", () => {
    store.students = [student("s1", "Ana Ruiz")];
    store.lessons = [
      lesson("l0", today, "s1"),
      ...Array.from({ length: 10 }, (_, i) => lesson(`p${i}`, daysAgo(i + 7), "s1", "presente")),
    ];

    openStudent("Ana Ruiz");

    const panel = screen.getByLabelText("Historial de clases");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(8);
    expect(within(panel).getByText("+3 anteriores")).toBeTruthy();
    expect(within(panel).getByText(/10 presentes/)).toBeTruthy();
  });

  it("does not list classes that have not happened yet", () => {
    store.students = [student("s1", "Ana Ruiz")];
    store.lessons = [
      lesson("l1", today, "s1"),
      lesson("l2", iso(addDays(new Date(), 7)), "s1", "programada"),
    ];

    openStudent("Ana Ruiz");

    const panel = screen.getByLabelText("Historial de clases");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
  });
});
