import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The snapshot is the only bridge between the MySQL rows and the client: columns
 * arrive snake_cased, the DTO is camelCased. A mismatch silently turns a saved
 * value into null on the next load, which is what happened with court_side.
 */

const { execute, findSessionUser } = vi.hoisted(() => ({ execute: vi.fn(), findSessionUser: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validator: (fn: unknown) => { (chain as Record<string, unknown>)["_validate"] = fn; return chain; },
      handler: (fn: unknown) => { (chain as Record<string, unknown>)["_handler"] = fn; return chain; },
    };
    return chain;
  },
}));

vi.mock("@/server/db", () => ({ db: () => ({ execute }) }));
vi.mock("@/server/session-user", () => ({ findSessionUser }));

const { getSnapshot } = (await import("@/server/data")) as unknown as {
  getSnapshot: { _handler: () => Promise<{ students: Record<string, unknown>[] }> };
};

const row = {
  id: "student-1",
  name: "Maxi Salas",
  type: "fijo",
  pay: "mensual",
  phone: "5492302666351",
  category: "3ra",
  court_side: "reves",
  balance: 4,
};

const slot = { student_id: "student-1", weekday: 5, start_time: "14:00" };

/** students, student_slots, lessons, court_settings — in that order. */
const mockSnapshot = (students: unknown[], slots: unknown[], lessons: unknown[] = []) => {
  execute.mockReset();
  execute
    .mockResolvedValueOnce([students, []])
    .mockResolvedValueOnce([slots, []])
    .mockResolvedValueOnce([lessons, []])
    .mockResolvedValueOnce([[], []]);
};

beforeEach(() => {
  findSessionUser.mockReset();
  findSessionUser.mockResolvedValue({ id: "owner-1", email: "profe@padel.com" });
  mockSnapshot([row], [slot]);
});

describe("getSnapshot mapping", () => {
  it("maps every snake_cased column to its camelCased field", async () => {
    const snapshot = await getSnapshot._handler();

    expect(snapshot.students[0]).toMatchObject({
      id: "student-1",
      name: "Maxi Salas",
      type: "fijo",
      pay: "mensual",
      phone: "5492302666351",
      category: "3ra",
      courtSide: "reves",
      slots: [{ weekday: 5, time: "14:00" }],
      balance: 4,
    });
  });

  it("asks for a bounded window of lessons instead of every row ever saved", async () => {
    await getSnapshot._handler();

    const [sql, params] = execute.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain(
      "BETWEEN DATE_SUB(CURDATE(), INTERVAL ? DAY) AND DATE_ADD(CURDATE(), INTERVAL ? DAY)",
    );
    expect(params).toEqual(["owner-1", 180, 120]);
  });

  it("turns missing optional columns into null instead of undefined", async () => {
    mockSnapshot([{ ...row, category: null, court_side: null }], []);

    const snapshot = await getSnapshot._handler();

    expect(snapshot.students[0]).toMatchObject({
      category: null,
      courtSide: null,
      slots: [],
    });
  });
});
