import type { Student } from "@/lib/store";

/** The full payload `updateStudent` expects, with the student paused or back on. */
export const activePayload = (s: Student, active: boolean) => ({
  name: s.name,
  type: s.type,
  pay: s.pay,
  phone: s.phone,
  category: s.category,
  courtSide: s.courtSide,
  slots: s.slots,
  active,
});
