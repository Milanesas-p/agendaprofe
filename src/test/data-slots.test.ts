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

const { addStudent } = (await import("@/server/data")) as unknown as {
  addStudent: { _validate: (input: unknown) => { slots: Array<{ weekday: number; time: string }> } };
};

const base = { name: "A", type: "fijo", pay: null, phone: null, category: null, courtSide: null, balance: 0 };

describe("weekly slots in the student API", () => {
  it("accepts several slots, deduped and sorted by day and time", () => {
    const result = addStudent._validate({
      ...base,
      slots: [
        { weekday: 5, time: "09:00" },
        { weekday: 1, time: "09:00" },
        { weekday: 1, time: "09:00" },
      ],
    });

    expect(result.slots).toEqual([
      { weekday: 1, time: "09:00" },
      { weekday: 5, time: "09:00" },
    ]);
  });

  it("accepts a student without slots", () => {
    expect(addStudent._validate({ ...base, slots: undefined }).slots).toEqual([]);
    expect(addStudent._validate({ ...base, slots: [] }).slots).toEqual([]);
  });

  it("rejects a weekday outside 0-6", () => {
    expect(() => addStudent._validate({ ...base, slots: [{ weekday: 7, time: "09:00" }] })).toThrow(
      "Día de la semana inválido.",
    );
  });

  it("rejects a time that is not HH:MM", () => {
    expect(() => addStudent._validate({ ...base, slots: [{ weekday: 1, time: "25:00" }] })).toThrow(
      "Horario inválido.",
    );
  });
});
