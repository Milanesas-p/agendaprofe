import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/avisos";
import { addDays, iso } from "@/lib/store";
import { DEFAULT_NOTICE_TEMPLATE, dayLabel } from "@/lib/notices";

const { store } = vi.hoisted(() => ({
  store: {
    students: [] as Array<{ id: string; name: string; phone: string | null; balance: number }>,
    lessons: [] as Array<{ id: string; date: string; start: string; studentId: string; status: string; notified?: boolean }>,
    settings: { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null as string | null },
    busy: false,
    setNoticeTemplate: vi.fn(),
    setNotified: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, activeOptions: _activeOptions, children, ...rest }: Record<string, unknown>) => (
      <a href={String(to)} {...rest}>{children as React.ReactNode}</a>
    ),
    useNavigate: () => vi.fn(),
  };
});
vi.mock("@/lib/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store")>()),
  useStore: () => store,
}));
vi.mock("@/server/data", () => ({
  getSnapshot: vi.fn(),
  addStudent: vi.fn(),
  updateStudent: vi.fn(),
  addLesson: vi.fn(),
  adjustBalance: vi.fn(),
  setLessonStatus: vi.fn(),
  saveSettings: vi.fn(),
  saveNoticeTemplate: vi.fn(),
  moveLesson: vi.fn(),
  materializeRecurring: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const tomorrow = iso(addDays(new Date(), 1));
const farAway = iso(addDays(new Date(), 5));

const student = (id: string, name: string, phone: string | null = null) => ({ id, name, phone, balance: 0 });
const lesson = (id: string, studentId: string, date: string, start = "13:00", status = "programada", notified = false) => ({
  id, studentId, date, start, status, notified,
});

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing notices page");
  return render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.students = [];
  store.lessons = [];
  store.settings = { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null };
});
afterEach(cleanup);

describe("notices page", () => {
  it("lists the classes of the next three days with a reminder link", () => {
    store.students = [student("s1", "Maxi Salas", "5492302666351")];
    store.lessons = [lesson("l1", "s1", tomorrow)];
    renderPage();

    const link = screen.getByLabelText("Recordar por WhatsApp a Maxi Salas");
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/5492302666351?text=")).toBe(true);
    const text = decodeURIComponent(href.split("?text=")[1] ?? "");
    expect(text).toContain("Maxi Salas");
    expect(text).toContain(dayLabel(tomorrow));
    expect(text).toContain("a las 13:00");
  });

  it("leaves out a class beyond the third day", () => {
    store.students = [student("s1", "Maxi Salas", "5492302666351")];
    store.lessons = [lesson("l1", "s1", farAway)];
    renderPage();

    expect(screen.queryByLabelText("Recordar por WhatsApp a Maxi Salas")).toBeNull();
    expect(screen.getByText("No hay clases en los próximos 3 días.")).toBeTruthy();
  });

  it("shows a student without a phone but offers no link", () => {
    store.students = [student("s2", "Pepe Mujica")];
    store.lessons = [lesson("l1", "s2", tomorrow)];
    renderPage();

    expect(screen.getByText("Pepe Mujica")).toBeTruthy();
    expect(screen.getByText("Sin teléfono")).toBeTruthy();
    expect(screen.queryByLabelText("Recordar por WhatsApp a Pepe Mujica")).toBeNull();
  });

  it("shows a saved template and saves an edited one", () => {
    store.settings = { ...store.settings, noticeTemplate: "Hola [nombre], nos vemos el [dia]." };
    store.students = [student("s1", "Maxi Salas", "5492302666351")];
    store.lessons = [lesson("l1", "s1", tomorrow)];
    renderPage();

    const box = screen.getByLabelText("Plantilla del aviso") as HTMLTextAreaElement;
    expect(box.value).toBe("Hola [nombre], nos vemos el [dia].");

    fireEvent.change(box, { target: { value: "  Hola [nombre], nos vemos a las [hora].  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));

    expect(store.setNoticeTemplate).toHaveBeenCalledWith("Hola [nombre], nos vemos a las [hora].");
  });

  it("falls back to the default template when there is none saved", () => {
    store.students = [student("s1", "Maxi Salas", "5492302666351")];
    store.lessons = [lesson("l1", "s1", tomorrow)];
    renderPage();

    expect((screen.getByLabelText("Plantilla del aviso") as HTMLTextAreaElement).value).toBe(DEFAULT_NOTICE_TEMPLATE);
  });

  it("remembers the reminder sent from here too", () => {
    store.students = [student("s1", "Maxi Salas", "5492302666351")];
    store.lessons = [lesson("l1", "s1", tomorrow)];
    renderPage();

    fireEvent.click(screen.getByLabelText("Recordar por WhatsApp a Maxi Salas"));

    expect(store.setNotified).toHaveBeenCalledWith("l1", true);
  });

  it("does not rewrite a class that was already notified", () => {
    store.students = [student("s1", "Maxi Salas", "5492302666351")];
    store.lessons = [lesson("l1", "s1", tomorrow, "13:00", "programada", true)];
    renderPage();

    fireEvent.click(screen.getByLabelText("Ya le avisaste a Maxi Salas"));

    expect(store.setNotified).not.toHaveBeenCalled();
  });
});
