import type { Student } from "@/lib/store";

/** The full payload `updateStudent` expects, with the paused student back on. */
export const reactivationPayload = (s: Student) => ({
  name: s.name,
  type: s.type,
  pay: s.pay,
  phone: s.phone,
  category: s.category,
  courtSide: s.courtSide,
  slots: s.slots,
  active: true,
});
