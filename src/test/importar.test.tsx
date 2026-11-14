import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { Route } from "@/routes/importar";
import { buildStudentsWorkbook, readStudentsWorkbook, SHEET_MIME } from "@/lib/xlsx";
import type { Student } from "@/lib/store";

const maxi: Student = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Maxi Salas",
  type: "fijo",
  pay: "mensual",
  phone: "5492302666351",
  category: "8va",
  courtSide: "reves",
  recurringWeekday: 1,
  recurringTime: "14:00",
  balance: 4,
};

const { store, navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  store: {
    settings: { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null },
    students: [] as Array<{
      id: string;
      name: string;
      type: string;
      pay: string | null;
      phone: string | null;
      category: string | null;
      courtSide: string | null;
      recurringWeekday: number | null;
      recurringTime: string | null;
      balance: number;
    }>,
    busy: false,
    importStudents: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: Record<string, unknown>) => <a href={String(to)} {...rest}>{children as React.ReactNode}</a>,
    useNavigate: () => navigate,
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
  importStudents: vi.fn(),
  moveLesson: vi.fn(),
  materializeRecurring: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing import page");
  return render(<Component />);
}

const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText("Alumnos pegados"), { target: { value: text } });
};

beforeEach(() => {
  vi.clearAllMocks();
  store.settings = { startHour: 8, endHour: 17, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null };
  store.students = [];
  store.importStudents.mockResolvedValue(1);
  // jsdom has no blob URLs, and the download only needs one to point at.
  URL.createObjectURL = vi.fn(() => "blob:plantilla");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("import page", () => {
  it("previews the pasted rows before saving anything", () => {
    renderPage();
    paste("nombre,telefono\nMaxi Salas,2302666351");

    expect(screen.getByText("Maxi Salas")).toBeTruthy();
    expect(screen.getByText("1 listo · 0 con problemas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar 1 alumno" })).toBeTruthy();
  });

  it("reads a completed file into the same preview", async () => {
    renderPage();
    const file = new File(["nombre;telefono\nMaxi Salas;2302666351"], "alumnos.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Subir archivo de alumnos"), { target: { files: [file] } });

    expect(await screen.findByText("Maxi Salas")).toBeTruthy();
    expect(screen.getByText("1 listo · 0 con problemas")).toBeTruthy();
    expect(screen.getByText("alumnos.csv")).toBeTruthy();
  });

  it("downloads the template with the current students", async () => {
    store.students = [maxi];
    // jsdom cannot navigate, and the download only needs the anchor click to happen.
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /descargar plantilla/i }));

    await vi.waitFor(() => expect(click).toHaveBeenCalled());

    const blob = (URL.createObjectURL as unknown as { mock: { calls: Array<[Blob]> } }).mock.calls[0]?.[0];
    expect(blob?.type).toBe(SHEET_MIME);
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob!);
    });
    const rows = await readStudentsWorkbook(new Uint8Array(buffer));

    expect(rows[1]).toEqual([
      "Maxi Salas",
      "5492302666351",
      "fijo",
      "Mensual",
      "8va",
      "Revés",
      "lunes",
      "14:00",
      maxi.id,
    ]);
  });

  it("reads the completed workbook into the same preview", async () => {
    const bytes = await buildStudentsWorkbook({
      slots: ["14:00"],
      rows: [["Maxi Salas", "2302666351", "fijo", "mensual", "8va", "Revés", "lunes", "14:00"]],
    });
    renderPage();
    const file = new File([bytes], "plantilla-alumnos.xlsx", { type: SHEET_MIME });
    fireEvent.change(screen.getByLabelText("Subir archivo de alumnos"), { target: { files: [file] } });

    expect(await screen.findByText("Maxi Salas")).toBeTruthy();
    expect(screen.getByText("1 listo · 0 con problemas")).toBeTruthy();
    expect(screen.getByText("plantilla-alumnos.xlsx")).toBeTruthy();
  });

  it("marks a row that updates an existing student", async () => {
    store.students = [maxi];
    const bytes = await buildStudentsWorkbook({
      slots: ["14:00"],
      rows: [["Maxi Salas", "5492302666351", "fijo", "mensual", "8va", "Revés", "lunes", "14:00", maxi.id]],
    });
    renderPage();
    const file = new File([bytes], "plantilla-alumnos.xlsx", { type: SHEET_MIME });
    fireEvent.change(screen.getByLabelText("Subir archivo de alumnos"), { target: { files: [file] } });

    expect(await screen.findByText("Actualiza")).toBeTruthy();
    expect(screen.getByText("0 nuevos · 1 para actualizar · 0 con problemas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar 1 alumno" })).toBeTruthy();
  });

  it("explains a workbook it cannot read", async () => {
    renderPage();
    const file = new File(["x"], "planilla.xlsx", { type: SHEET_MIME });
    fireEvent.change(screen.getByLabelText("Subir archivo de alumnos"), { target: { files: [file] } });

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("No pudimos leer la planilla. Probá de nuevo."));
  });

  it("rejects a file that is neither a workbook nor text", () => {
    renderPage();
    const file = new File(["x"], "planilla.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Subir archivo de alumnos"), { target: { files: [file] } });

    expect(toast.error).toHaveBeenCalledWith("Subí la plantilla .xlsx o un archivo CSV.");
  });

  it("explains the broken rows and still offers the good ones", () => {
    renderPage();
    paste("nombre,telefono,categoria\nMaxi Salas,2302666351,8va\n,2302666351,4ta");

    expect(screen.getByText("Falta el nombre.")).toBeTruthy();
    expect(screen.getByText("1 listo · 1 con problemas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar 1 alumno" })).toBeTruthy();
  });

  it("warns when the paste has no header row", () => {
    renderPage();
    paste("Maxi Salas\t2302666351");

    expect(screen.getByText("La primera fila tiene que traer los títulos de las columnas.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Importar \d/ })).toBeNull();
  });

  it("sends only the ready rows and goes back to the directory", async () => {
    renderPage();
    paste("nombre,telefono,dia,hora\nMaxi Salas,2302666351,lunes,14:00\n,2302666351,,");
    fireEvent.click(screen.getByRole("button", { name: "Importar 1 alumno" }));

    await vi.waitFor(() => expect(store.importStudents).toHaveBeenCalledTimes(1));
    expect(store.importStudents.mock.calls[0]?.[0]).toEqual([
      {
        id: null,
        name: "Maxi Salas",
        phone: "5492302666351",
        type: "fijo",
        pay: null,
        category: null,
        courtSide: null,
        recurringWeekday: 1,
        recurringTime: "14:00",
      },
    ]);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/alumnos" }));
  });

  it("shows nothing to import on an empty page", () => {
    renderPage();

    expect(screen.queryByText(/listo/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Importar \d/ })).toBeNull();
  });
});
