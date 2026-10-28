import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "@/lib/store";

const { update, eq } = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "owner" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }),
      update,
    }),
  },
}));

describe("student editing", () => {
  it("saves name, type and payment without overwriting an existing balance", async () => {
    eq.mockResolvedValue({ error: null });
    update.mockReturnValue({ eq });
    let store: ReturnType<typeof useStore> | undefined;
    function Probe() { store = useStore(); return null; }
    const view = render(<StoreProvider><Probe /></StoreProvider>);
    await waitFor(() => expect(store?.loading).toBe(false));
    await act(async () => {
      await store?.updateStudent("student-1", { name: " María Pérez ", type: "rotativo", pay: "semanal", balance: 9 } as Parameters<ReturnType<typeof useStore>["updateStudent"]>[1]);
    });
    expect(update).toHaveBeenCalledWith({ name: "María Pérez", type: "rotativo", pay: "semanal" });
    expect(eq).toHaveBeenCalledWith("id", "student-1");
    view.unmount();
  });
});