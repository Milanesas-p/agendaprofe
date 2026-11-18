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
const lastWeek = iso(addDays(new Date(), -7));

const student = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  type: "rotativo",
  pay: "mensual",
  phone: null,
  category: null,
  courtSide: null,
  recurringWeekday: null,
  recurringTime: null,
  balance: 0,
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

function renderAgenda() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing agenda page");
  render(<Component />);
}

const expand = (t = "09:00") =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t},`) }));

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

describe("suggestions in the agenda", () => {
  it("offers a rotativo who came last week and books them with one tap", () => {
    store.students = [student("s1", "Juan Gómez")];
    store.lessons = [lesson("l1", lastWeek, "s1", "presente")];
    renderAgenda();
    expand();

    expect(screen.getByText("Sugeridos")).toBeTruthy();
    expect(
      screen.getByText("Vino el " + lastWeek.slice(8, 10) + "/" + lastWeek.slice(5, 7)),
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Agregar sugerido: Juan Gómez"));
    expect(store.addLesson).toHaveBeenCalledWith({ date: today, start: "09:00", studentId: "s1" });
  });

  it("repeats the suggestion inside the booking sheet", () => {
    store.students = [student("s1", "Juan Gómez")];
    store.lessons = [lesson("l1", lastWeek, "s1", "presente")];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByRole("button", { name: /Agregar alumno/ }));

    const group = screen.getByRole("group", { name: "Sugeridos" });
    fireEvent.click(within(group).getByLabelText("Agregar sugerido: Juan Gómez"));

    expect(store.addLesson).toHaveBeenCalledWith({ date: today, start: "09:00", studentId: "s1" });
  });

  it("offers a fixed student who already played that class, without touching their own slot", () => {
    store.students = [
      student("s1", "Juan Gómez", { type: "fijo", slots: [{ weekday: 4, time: "16:00" }] }),
    ];
    store.lessons = [lesson("l1", lastWeek, "s1", "presente")];
    renderAgenda();
    expand();

    expect(screen.getByText("Sugeridos")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Agregar sugerido: Juan Gómez"));

    expect(store.addLesson).toHaveBeenCalledWith({ date: today, start: "09:00", studentId: "s1" });
    expect(store.moveLesson).not.toHaveBeenCalled();
    expect(store.setSettings).not.toHaveBeenCalled();
  });

  it("warns when the suggested student already has another class that day", () => {
    store.students = [
      student("s1", "Juan Gómez", { type: "fijo", slots: [{ weekday: 4, time: "16:00" }] }),
    ];
    store.lessons = [
      lesson("l1", lastWeek, "s1", "presente"),
      lesson("l2", today, "s1", "programada", "16:00"),
    ];
    renderAgenda();
    expand();

    expect(screen.getByText("Ya tiene clase hoy 16:00")).toBeTruthy();
  });

  it("does not offer a fixed student who never played that class", () => {
    store.students = [
      student("s1", "Juan Gómez", { type: "fijo", slots: [{ weekday: 4, time: "16:00" }] }),
    ];
    store.lessons = [lesson("l1", lastWeek, "s1", "presente", "16:00")];
    renderAgenda();
    expand();

    expect(screen.queryByText("Sugeridos")).toBeNull();
  });

  it("skips a student already booked in that slot", () => {
    store.students = [student("s1", "Juan Gómez")];
    store.lessons = [lesson("l1", lastWeek, "s1", "presente"), lesson("l2", today, "s1")];
    renderAgenda();
    expand();

    expect(screen.queryByText("Sugeridos")).toBeNull();
  });

  it("skips a student who was absent the last time", () => {
    store.students = [student("s1", "Juan Gómez")];
    store.lessons = [lesson("l1", lastWeek, "s1", "ausente")];
    renderAgenda();
    expand();

    expect(screen.queryByText("Sugeridos")).toBeNull();
  });

  it("hides suggestions once the class is full", () => {
    store.students = [
      student("s1", "Juan Gómez"),
      ...["s2", "s3", "s4", "s5"].map((id, i) => student(id, `Alumno ${i + 1}`)),
    ];
    store.lessons = [
      lesson("h1", lastWeek, "s1", "presente"),
      ...["s2", "s3", "s4", "s5"].map((id, i) => lesson(`l${i}`, today, id)),
    ];
    renderAgenda();
    expand();

    expect(screen.getByText("Clase completa")).toBeTruthy();
    expect(screen.queryByText("Sugeridos")).toBeNull();
  });

  it("leaves past days without suggestions", () => {
    const yesterday = iso(addDays(new Date(), -1));
    const weekBefore = iso(addDays(new Date(), -8));
    store.students = [student("s1", "Juan Gómez")];
    store.lessons = [lesson("l1", weekBefore, "s1", "presente")];
    renderAgenda();

    fireEvent.change(screen.getByLabelText("Fecha de la agenda"), { target: { value: yesterday } });
    expand();

    expect(screen.queryByText("Sugeridos")).toBeNull();
  });
});
