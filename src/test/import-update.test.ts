import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sheet can update existing students, so the API has to scope every write to
 * the owner and keep the balance out of the import. These tests run the real
 * `importStudents` handler against a mocked database.
 */

const { connectionExecute, findSessionUser } = vi.hoisted(() => ({
  connectionExecute: vi.fn(),
  findSessionUser: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: (fn: unknown) => {
        (chain as Record<string, unknown>)["_validate"] = fn;
        return chain;
      },
      handler: (fn: unknown) => {
        (chain as Record<string, unknown>)["_handler"] = fn;
        return chain;
      },
    };
    return chain;
  },
}));

vi.mock("@/server/db", () => ({
  db: () => ({
    execute: vi.fn(),
    getConnection: async () => ({
      query: async () => [[], []],
      execute: connectionExecute,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  }),
}));

vi.mock("@/server/session-user", () => ({ findSessionUser }));

const { importStudents } = (await import("@/server/data")) as unknown as {
  importStudents: {
    _validate: (input: unknown) => { students: Array<{ id: string | null }> };
    _handler: (args: { data: { students: unknown[] } }) => Promise<number>;
  };
};

const ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "22222222-2222-4222-8222-222222222222";
const LETTER_ID = "abcdefab-1111-4111-8111-111111111111";

const student = (overrides: Record<string, unknown> = {}) => ({
  id: null,
  name: "Maxi Salas",
  type: "fijo",
  pay: "mensual",
  phone: "2302666351",
  category: null,
  courtSide: null,
  recurringWeekday: 1,
  recurringTime: "14:00",
  ...overrides,
});

const statements = () => connectionExecute.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  connectionExecute.mockReset();
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  connectionExecute.mockResolvedValue([{ affectedRows: 1 }, []]);
});

describe("importing with existing students", () => {
  it("updates a student of the owner and never touches the balance", async () => {
    connectionExecute.mockResolvedValueOnce([[{ id: ID }], []]);

    await importStudents._handler({
      data: { students: [student({ id: ID, name: "Maxi Salas Ruiz" })] },
    });

    const update = connectionExecute.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE students SET"),
    );
    expect(String(update?.[0])).toContain("WHERE id = ? AND owner_id = ?");
    expect(statements().some((sql) => sql.includes("balance"))).toBe(false);
    expect(statements().some((sql) => sql.includes("INSERT INTO students"))).toBe(false);
  });

  it("rejects an id that does not belong to the owner and writes nothing", async () => {
    connectionExecute.mockResolvedValueOnce([[], []]);

    await expect(
      importStudents._handler({ data: { students: [student({ id: ID })] } }),
    ).rejects.toThrow("Ese alumno ya no existe. Volvé a descargar la plantilla.");
    expect(
      statements().some(
        (sql) => sql.includes("UPDATE students") || sql.includes("INSERT INTO students"),
      ),
    ).toBe(false);
  });

  it("creates a row without id, with a zero balance and no ownership lookup", async () => {
    await importStudents._handler({ data: { students: [student()] } });

    const insert = connectionExecute.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO students"),
    );
    expect(String(insert?.[0])).toContain(", 0)");
    expect(statements().some((sql) => sql.includes("SELECT id FROM students"))).toBe(false);
  });

  it("updates and creates in the same transaction", async () => {
    connectionExecute.mockResolvedValueOnce([[{ id: ID }], []]);

    await importStudents._handler({
      data: { students: [student({ id: ID }), student({ name: "Pepe" })] },
    });

    expect(statements().filter((sql) => sql.includes("UPDATE students SET"))).toHaveLength(1);
    expect(statements().filter((sql) => sql.includes("INSERT INTO students"))).toHaveLength(1);
  });

  it("writes nothing when one id is unknown, even next to a valid update", async () => {
    connectionExecute.mockResolvedValueOnce([[{ id: ID }], []]);

    await expect(
      importStudents._handler({
        data: { students: [student({ id: ID }), student({ id: UNKNOWN_ID })] },
      }),
    ).rejects.toThrow("Ese alumno ya no existe. Volvé a descargar la plantilla.");
    expect(
      statements().some(
        (sql) => sql.includes("UPDATE students") || sql.includes("INSERT INTO students"),
      ),
    ).toBe(false);
  });
});

describe("importing validator", () => {
  it("rejects the same student twice in one sheet", () => {
    expect(() =>
      importStudents._validate({ students: [student({ id: ID }), student({ id: ID })] }),
    ).toThrow("Hay alumnos repetidos en la plantilla.");
  });

  it("rejects the same student twice even when the case differs", () => {
    expect(() =>
      importStudents._validate({
        students: [student({ id: LETTER_ID }), student({ id: LETTER_ID.toUpperCase() })],
      }),
    ).toThrow("Hay alumnos repetidos en la plantilla.");
  });

  it("accepts the three payment modes and rejects the retired one", () => {
    expect(() => importStudents._validate({ students: [student({ pay: "grupal" })] })).not.toThrow();
    expect(() => importStudents._validate({ students: [student({ pay: "semanal" })] })).toThrow(
      "Dato inválido: modalidad de pago.",
    );
  });

  it("accepts an undecided payment mode", () => {
    expect(() => importStudents._validate({ students: [student({ pay: null })] })).not.toThrow();
    expect(() => importStudents._validate({ students: [student({ pay: "" })] })).not.toThrow();
  });

  it("accepts rows without id", () => {
    const result = importStudents._validate({ students: [student(), student({ id: ID })] });

    expect(result.students.map((row) => row.id)).toEqual([null, ID]);
  });

  it("rejects an id that is not a student id", () => {
    expect(() => importStudents._validate({ students: [student({ id: "no-es-un-id" })] })).toThrow(
      "Identificador inválido.",
    );
  });
});
