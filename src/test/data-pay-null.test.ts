import { describe, expect, it, vi } from "vitest";

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
      execute: vi.fn(),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  }),
}));
vi.mock("@/server/session-user", () => ({ findSessionUser: vi.fn() }));

const { addStudent, updateStudent } = (await import("@/server/data")) as unknown as {
  addStudent: { _validate: (input: unknown) => unknown };
  updateStudent: { _validate: (input: unknown) => unknown };
};

const base = { name: "A", type: "fijo", phone: null };

describe("undecided payment mode in the student API", () => {
  it("addStudent stores an undecided mode as null", () => {
    expect(() => addStudent._validate({ ...base, pay: null, balance: 0 })).not.toThrow();
    expect(() => addStudent._validate({ ...base, pay: "", balance: 0 })).not.toThrow();
  });

  it("addStudent keeps rejecting unknown tokens", () => {
    expect(() => addStudent._validate({ ...base, pay: "semanal", balance: 0 })).toThrow(
      "Dato inválido: modalidad de pago.",
    );
  });

  it("updateStudent accepts null pay and rejects unknown tokens", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(() => updateStudent._validate({ id, ...base, pay: null })).not.toThrow();
    expect(() => updateStudent._validate({ id, ...base, pay: "semanal" })).toThrow(
      "Dato inválido: modalidad de pago.",
    );
  });
});
