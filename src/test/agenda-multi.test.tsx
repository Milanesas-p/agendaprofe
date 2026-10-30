import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";
import { iso } from "@/lib/store";

const { store } = vi.hoisted(() => ({
  store: {
    students: [] as { id: string; name: string; type: string; pay: string; phone: string | null; balance: number }[],
    lessons: [] as { id: string; date: string; start: string; studentId: string; status: string }[],
    settings: { startHour: 8, endHour: 10, blockMin: 60 },
    busy: false,
    loading: false,
    setStatus: vi.fn(),
    addLesson: vi.fn(),
    setSettings: vi.fn(),
  },
}));

// The agenda links to the summary page; a bare anchor is enough for these tests.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, activeOptions: _activeOptions, children, ...rest }: Record<string, unknown>) => (
      <a href={String(to)} {...rest}>{children as React.ReactNode}</a>
    ),
  };
});
vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));

const today = iso(new Date());

const student = (id: string, name: string, balance = 0, over: Record<string, unknown> = {}) => ({
  id, name, type: "fijo", pay: "mensual", phone: null, category: null, courtSide: null, balance, ...over,
});

const lesson = (id: string, studentId: string, status = "programada", start = "09:00") => ({
  id, date: today, start, studentId, status,
});

function renderAgenda() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing agenda page");
  render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.lessons = [];
});
afterEach(cleanup);

describe("agenda with several students in one class", () => {
  it("groups the students of the same slot into one class card", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();

    expect(screen.getByText("2 alumnos")).toBeTruthy();
    expect(screen.getByLabelText("Marcar presente a María Pérez")).toBeTruthy();
    expect(screen.getByLabelText("Marcar presente a Juan Gómez")).toBeTruthy();
  });

  it("marks attendance per student with one tap", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();

    fireEvent.click(screen.getByLabelText("Marcar presente a María Pérez"));
    expect(store.setStatus).toHaveBeenCalledWith("l1", "presente");

    fireEvent.click(screen.getByLabelText("Marcar ausente a Juan Gómez"));
    expect(store.setStatus).toHaveBeenCalledWith("l2", "ausente");
  });

  it("returns a marked student to programada when tapping the active button", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1", "presente")];
    renderAgenda();

    fireEvent.click(screen.getByLabelText("Marcar presente a María Pérez"));
    expect(store.setStatus).toHaveBeenCalledWith("l1", "programada");
  });

  it("hides the balance number and warns only when the student owes classes", () => {
    store.students = [student("s1", "María Pérez", -3), student("s2", "Juan Gómez", 4)];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();

    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    expect(screen.queryByText("+4")).toBeNull();
    expect(screen.queryByText("-3")).toBeNull();
    expect(screen.getAllByLabelText("Debe clases")).toHaveLength(1);
  });

  it("stops offering a place once the class has four students", () => {
    store.students = ["s1", "s2", "s3", "s4"].map((id, i) => student(id, `Alumno ${i + 1}`));
    store.lessons = ["s1", "s2", "s3", "s4"].map((id, i) => lesson(`l${i}`, id));
    renderAgenda();

    expect(screen.getByText("4 alumnos")).toBeTruthy();
    expect(screen.queryByLabelText("Agregar alumno a las 09:00")).toBeNull();
  });

  it("offers one more place while the class is not full", () => {
    store.students = ["s1", "s2", "s3"].map((id, i) => student(id, `Alumno ${i + 1}`));
    store.lessons = ["s1", "s2", "s3"].map((id, i) => lesson(`l${i}`, id));
    renderAgenda();

    expect(screen.getByLabelText("Agregar alumno a las 09:00")).toBeTruthy();
  });

  it("does not count a cancelled student against the four places", () => {
    store.students = ["s1", "s2", "s3", "s4"].map((id, i) => student(id, `Alumno ${i + 1}`));
    store.lessons = [
      lesson("l1", "s1"), lesson("l2", "s2"), lesson("l3", "s3"), lesson("l4", "s4", "cancelada"),
    ];
    renderAgenda();

    expect(screen.getByText("3 alumnos")).toBeTruthy();
    expect(screen.getByLabelText("Agregar alumno a las 09:00")).toBeTruthy();
  });

  it("shows the player profile on the row and again in the student sheet", () => {
    store.students = [student("s1", "María Pérez", 0, { category: "4ta", courtSide: "reves", recurringWeekday: 5, recurringTime: "14:00" })];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();

    expect(screen.getByText("4ta · Revés")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));

    expect(screen.getByText("4ta · Revés · Viernes 14:00")).toBeTruthy();
  });

  it("shows no profile line for a student without one", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();

    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));

    expect(screen.queryByText(/4ta|Revés/)).toBeNull();
  });

  it("keeps the balance number out of the booking sheet", () => {
    store.students = [student("s1", "María Pérez", -3), student("s2", "Juan Gómez", 4)];
    store.lessons = [];
    renderAgenda();

    const free = screen.getAllByRole("button", { name: /Libre/ })[0];
    if (!free) throw new Error("No free slot to book");
    fireEvent.click(free);

    expect(screen.queryByText("-3")).toBeNull();
    expect(screen.queryByText("+4")).toBeNull();
    expect(screen.getAllByLabelText("Debe clases")).toHaveLength(1);
  });
});

describe("WhatsApp reminder from the agenda", () => {
  const withPhone = { phone: "5492302666351" };

  it("offers a shortcut to the notices screen", () => {
    renderAgenda();

    expect(screen.getByLabelText("Avisos").getAttribute("href")).toBe("/avisos");
  });

  it("offers the reminder only to a student with a phone", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();

    const link = screen.getByLabelText("Recordar por WhatsApp a María Pérez");
    expect(link.getAttribute("href")).toBe(
      `https://wa.me/5492302666351?text=${encodeURIComponent("Buenas! Te recuerdo tu clase de las 09:00. Confirmame por favor.")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByLabelText("Recordar por WhatsApp a Juan Gómez")).toBeNull();
  });

  it("repeats the reminder in the student sheet", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone)];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();

    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));

    // The sheet hides the row from the accessibility tree, so this link is the sheet's.
    const link = screen.getByRole("link", { name: "Recordar por WhatsApp" });
    expect(link.getAttribute("href")).toContain("https://wa.me/5492302666351?text=");
  });

  it("says nothing to remind about a cancelled class", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone)];
    store.lessons = [lesson("l1", "s1", "cancelada")];
    renderAgenda();

    expect(screen.queryByLabelText("Recordar por WhatsApp a María Pérez")).toBeNull();
  });
});
