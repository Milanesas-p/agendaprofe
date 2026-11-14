import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { Route } from "@/routes/index";
import { iso } from "@/lib/store";

const { store } = vi.hoisted(() => ({
  store: {
    students: [] as { id: string; name: string; type: string; pay: string; phone: string | null; balance: number }[],
    lessons: [] as { id: string; date: string; start: string; studentId: string; status: string; notified: boolean }[],
    settings: { startHour: 8, endHour: 10, blockMin: 60 },
    busy: false,
    loading: false,
    setStatus: vi.fn(),
    setNotified: vi.fn(),
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
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

// jsdom ships no PointerEvent. A MouseEvent carries the same clientX/clientY the
// swipe handler reads, so the gesture is exercised for real.
if (!("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const today = iso(new Date());

const student = (id: string, name: string, balance = 0, over: Record<string, unknown> = {}) => ({
  id, name, type: "fijo", pay: "mensual", phone: null, category: null, courtSide: null, slots: [], balance, ...over,
});

const lesson = (id: string, studentId: string, status = "programada", start = "09:00", notified = false) => ({
  id, date: today, start, studentId, status, notified,
});

function renderAgenda() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing agenda page");
  render(<Component />);
}

/** Opens one hour of the day, which is where every row control lives. */
const expand = (t = "09:00") => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t},`) }));

/** Drags a row sideways with a pointer, the way a thumb would. */
function swipe(el: Element, dx: number) {
  fireEvent.pointerDown(el, { clientX: 200, clientY: 120 });
  fireEvent.pointerMove(el, { clientX: 200 + dx, clientY: 124 });
  fireEvent.pointerUp(el, { clientX: 200 + dx, clientY: 124 });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.lessons = [];
  store.setStatus.mockResolvedValue(true);
  store.setNotified.mockResolvedValue(true);
});
afterEach(cleanup);

describe("agenda with several students in one class", () => {
  it("lists every hour of the day closed, with just a summary", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();

    expect(screen.getByText("2 alumnos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "09:00, 2 alumnos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "08:00, Libre" })).toBeTruthy();
    // Closed: nothing of the class can be edited yet.
    expect(screen.queryByLabelText("Marcar presente a María Pérez")).toBeNull();
  });

  it("adds the day summary beside the agenda on wide screens", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1", "presente")];
    renderAgenda();

    const summary = screen.getByRole("complementary");
    expect(within(summary).getByText("Resumen del día")).toBeTruthy();
    expect(within(summary).getByText("Presentes")).toBeTruthy();
    expect(within(summary).getByText("Horarios ocupados")).toBeTruthy();
  });

  it("opens a block on demand and closes it again on the next tap", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();

    expand();
    expect(screen.getByLabelText("Marcar presente a María Pérez")).toBeTruthy();
    expect(screen.getByLabelText("Marcar presente a Juan Gómez")).toBeTruthy();

    expand();
    expect(screen.queryByLabelText("Marcar presente a María Pérez")).toBeNull();
  });

  it("keeps two blocks open at the same time", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1", "programada", "08:00"), lesson("l2", "s2")];
    renderAgenda();

    expand("08:00");
    expand("09:00");

    expect(screen.getByLabelText("Marcar presente a María Pérez")).toBeTruthy();
    expect(screen.getByLabelText("Marcar presente a Juan Gómez")).toBeTruthy();
  });

  it("marks attendance per student with one tap", () => {
    store.students = [student("s1", "María Pérez"), student("s2", "Juan Gómez")];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByLabelText("Marcar presente a María Pérez"));
    expect(store.setStatus).toHaveBeenCalledWith("l1", "presente");

    fireEvent.click(screen.getByLabelText("Marcar ausente a Juan Gómez"));
    expect(store.setStatus).toHaveBeenCalledWith("l2", "ausente");
  });

  it("returns a marked student to programada when tapping the active button", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1", "presente")];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByLabelText("Marcar presente a María Pérez"));
    expect(store.setStatus).toHaveBeenCalledWith("l1", "programada");
  });

  it("hides the balance number and warns only when the student owes classes", () => {
    store.students = [student("s1", "María Pérez", -3), student("s2", "Juan Gómez", 4)];
    store.lessons = [lesson("l1", "s1"), lesson("l2", "s2")];
    renderAgenda();
    expand();

    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    expect(screen.queryByText("+4")).toBeNull();
    expect(screen.queryByText("-3")).toBeNull();
    expect(screen.getAllByLabelText("Debe clases")).toHaveLength(1);
  });

  it("stops offering a place once the class has four students", () => {
    store.students = ["s1", "s2", "s3", "s4"].map((id, i) => student(id, `Alumno ${i + 1}`));
    store.lessons = ["s1", "s2", "s3", "s4"].map((id, i) => lesson(`l${i}`, id));
    renderAgenda();
    expand();

    expect(screen.getByText("4 alumnos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar alumno/ })).toBeNull();
    expect(screen.getByText("Clase completa")).toBeTruthy();
  });

  it("offers one more place while the class is not full", () => {
    store.students = ["s1", "s2", "s3"].map((id, i) => student(id, `Alumno ${i + 1}`));
    store.lessons = ["s1", "s2", "s3"].map((id, i) => lesson(`l${i}`, id));
    renderAgenda();
    expand();

    expect(screen.getByRole("button", { name: /Agregar alumno/ })).toBeTruthy();
  });

  it("does not count a cancelled student against the four places", () => {
    store.students = ["s1", "s2", "s3", "s4"].map((id, i) => student(id, `Alumno ${i + 1}`));
    store.lessons = [
      lesson("l1", "s1"), lesson("l2", "s2"), lesson("l3", "s3"), lesson("l4", "s4", "cancelada"),
    ];
    renderAgenda();
    expand();

    expect(screen.getByText("3 alumnos · 1 no va")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agregar alumno/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "09:00, 3 alumnos · 1 no va" })).toBeTruthy();
  });

  it("says Cancelada when the only student of the slot released it", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1", "cancelada")];
    renderAgenda();

    expect(screen.getByRole("button", { name: "09:00, Cancelada" })).toBeTruthy();
    expand();
    expect(screen.getByRole("button", { name: /Agregar alumno/ })).toBeTruthy();
  });

  it("shows the player profile on the row and again in the student sheet", () => {
    store.students = [student("s1", "María Pérez", 0, { category: "4ta", courtSide: "reves", slots: [{ weekday: 5, time: "14:00" }] })];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    expect(screen.getByText("4ta · Revés")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));

    expect(screen.getByText("4ta · Revés · Viernes 14:00")).toBeTruthy();
  });

  it("shows no profile line for a student without one", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));

    expect(screen.queryByText(/4ta|Revés/)).toBeNull();
  });

  it("keeps the balance number out of the booking sheet", () => {
    store.students = [student("s1", "María Pérez", -3), student("s2", "Juan Gómez", 4)];
    store.lessons = [];
    renderAgenda();

    fireEvent.click(screen.getByRole("button", { name: "08:00, Libre" }));
    fireEvent.click(screen.getByRole("button", { name: /Agregar alumno/ }));

    expect(screen.queryByText("-3")).toBeNull();
    expect(screen.queryByText("+4")).toBeNull();
    expect(screen.getAllByLabelText("Debe clases")).toHaveLength(1);
  });
});

describe("swiping a student to confirm or release the slot", () => {
  const row = (name: string) => screen.getByLabelText(`Marcar presente a ${name}`).closest("li") as HTMLElement;

  it("confirms the class when the name is dragged to the right", async () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    swipe(row("María Pérez"), 80);

    await waitFor(() => expect(store.setStatus).toHaveBeenCalledWith("l1", "confirmado"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Confirmaste a María Pérez", expect.objectContaining({ action: expect.anything() })),
    );
  });

  it("releases the slot when the name is dragged to the left", async () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    swipe(row("María Pérez"), -80);

    await waitFor(() => expect(store.setStatus).toHaveBeenCalledWith("l1", "cancelada"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("María Pérez no va", expect.objectContaining({ action: expect.anything() })),
    );
  });

  it("ignores a short drag", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    swipe(row("María Pérez"), 24);

    expect(store.setStatus).not.toHaveBeenCalled();
  });

  it("puts the previous state back from the toast", async () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    swipe(row("María Pérez"), 80);
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const options = (toast as unknown as { mock: { calls: [string, { action: { onClick: () => void } }][] } }).mock.calls[0]![1];
    options.action.onClick();

    expect(store.setStatus).toHaveBeenLastCalledWith("l1", "programada");
  });

  it("shows a confirmed class as confirmed and lets the sheet undo it", () => {
    store.students = [student("s1", "María Pérez")];
    store.lessons = [lesson("l1", "s1", "confirmado")];
    renderAgenda();
    expand();

    expect(screen.getByLabelText("Confirmado")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));
    fireEvent.click(screen.getByRole("button", { name: "Quitar la confirmación" }));

    expect(store.setStatus).toHaveBeenCalledWith("l1", "programada");
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
    expand();

    const link = screen.getByLabelText("Recordar por WhatsApp a María Pérez");
    expect(link.getAttribute("href")).toBe(
      `https://wa.me/5492302666351?text=${encodeURIComponent("Buenas! Te recuerdo tu clase de las 09:00. Confirmame por favor.")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByLabelText("Recordar por WhatsApp a Juan Gómez")).toBeNull();
  });

  it("remembers that the reminder was sent when the teacher opens the chat", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone)];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByLabelText("Recordar por WhatsApp a María Pérez"));

    expect(store.setNotified).toHaveBeenCalledWith("l1", true);
  });

  it("does not write again once the class is marked as notified", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone)];
    store.lessons = [lesson("l1", "s1", "programada", "09:00", true)];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByLabelText("Ya le avisaste a María Pérez"));

    expect(store.setNotified).not.toHaveBeenCalled();
  });

  it("repeats the reminder in the student sheet", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone)];
    store.lessons = [lesson("l1", "s1")];
    renderAgenda();
    expand();

    fireEvent.click(screen.getByLabelText("Opciones de María Pérez"));

    // The sheet hides the row from the accessibility tree, so this link is the sheet's.
    const link = screen.getByRole("link", { name: "Recordar por WhatsApp" });
    expect(link.getAttribute("href")).toContain("https://wa.me/5492302666351?text=");
  });

  it("says nothing to remind about a cancelled class", () => {
    store.students = [student("s1", "María Pérez", 0, withPhone)];
    store.lessons = [lesson("l1", "s1", "cancelada")];
    renderAgenda();
    expand();

    expect(screen.queryByLabelText("Recordar por WhatsApp a María Pérez")).toBeNull();
  });
});
