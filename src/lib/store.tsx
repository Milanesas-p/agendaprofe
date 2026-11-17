import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  adjustBalance as adjustBalanceFn,
  addLesson as addLessonFn,
  addStudent as addStudentFn,
  getSnapshot,
  materializeRecurring as materializeRecurringFn,
  moveLesson as moveLessonFn,
  saveSettings as saveSettingsFn,
  saveNoticeTemplate as saveNoticeTemplateFn,
  importStudents as importStudentsFn,
  setLessonStatus as setLessonStatusFn,
  setLessonNotified as setLessonNotifiedFn,
  updateStudent as updateStudentFn,
  updateProfile as updateProfileFn,
  type RecurringConflict,
} from "@/server/data";
import { completeTour, getCurrentUser, loginUser, logoutUser, type AuthUser } from "@/server/auth";
import {
  balanceDelta,
  fixedSlotsOutsideBlocks,
  outsideBlocksMessage,
  slots,
  validSettings,
  type ClassStatus,
} from "./rules";
import type { Category, CourtSide } from "./player";
import { PAY_MODES, type PayMode } from "./pay";
import type { StudentSlot } from "./recurrence";

export { slots, validSettings, PAY_MODES };
export type { ClassStatus, StudentSlot };
export type { Category, CourtSide, PayMode };

export type StudentType = "fijo" | "rotativo";
export type Student = {
  id: string;
  name: string;
  type: StudentType;
  /** Null means the teacher did not decide the mode yet. */
  pay: PayMode | null;
  phone: string | null;
  /** Padel category and court side, or null when the teacher did not set them. */
  category: Category | null;
  courtSide: CourtSide | null;
  /** Weekly slots. A `fijo` gets them booked; a `rotativo` keeps them habitual. */
  slots: StudentSlot[];
  balance: number;
};
export type ImportedStudent = {
  /** Existing student to update, or null to create a new one. */
  id: string | null;
  name: string;
  phone: string | null;
  type: StudentType;
  pay: PayMode | null;
  category: Category | null;
  courtSide: CourtSide | null;
  slots: StudentSlot[];
};
export type Lesson = {
  id: string;
  date: string;
  start: string;
  studentId: string;
  status: ClassStatus;
  /** True once the teacher sent this class' WhatsApp reminder. */
  notified: boolean;
};
export type Settings = {
  startHour: number;
  endHour: number;
  blockMin: number;
  /** Optional daily break: both sides together, or both null. */
  breakStart: number | null;
  breakEnd: number | null;
  /** Bulk notice template, or null for the factory one. */
  noticeTemplate: string | null;
};
export const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export function applyStatus(lesson: Lesson, student: Student, next: ClassStatus): Student {
  return { ...student, balance: student.balance + balanceDelta(lesson.status, next) };
}
export const balanceLabel = (b: number) => b > 0 ? `+${b}` : `${b}`;

type State = { students: Student[]; lessons: Lesson[]; settings: Settings };
type Ctx = State & {
  user: AuthUser | null;
  loading: boolean;
  busy: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setStatus: (id: string, s: ClassStatus) => Promise<boolean>;
  /** Remembers whether this class' WhatsApp reminder was already sent. */
  setNotified: (id: string, notified: boolean) => Promise<boolean>;
  addLesson: (l: Omit<Lesson, "id" | "status" | "notified">) => Promise<boolean>;
  addStudent: (s: Omit<Student, "id">) => Promise<string | false>;
  updateStudent: (id: string, s: Pick<Student, "name" | "type" | "pay" | "phone" | "category" | "courtSide" | "slots">) => Promise<boolean>;
  adjustBalance: (id: string, delta: number) => Promise<boolean>;
  moveLesson: (id: string, target: { date: string; start: string }) => Promise<boolean>;
  setSettings: (s: Settings) => Promise<boolean>;
  setNoticeTemplate: (template: string) => Promise<boolean>;
  importStudents: (rows: ImportedStudent[]) => Promise<number | false>;
  updateProfile: (name: string) => Promise<boolean>;
  /** Closes the welcome tour and remembers it for this account. */
  finishTour: () => Promise<boolean>;
};

const empty: State = {
  students: [],
  lessons: [],
  settings: { startHour: 8, endHour: 22, blockMin: 60, breakStart: null, breakEnd: null, noticeTemplate: null },
};
const C = createContext<Ctx | null>(null);

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * One toast line naming the real reason a fixed slot stayed pending: a full
 * block and a time the workday no longer has are different problems.
 */
function conflictsMessage(conflicts: RecurringConflict[]): string {
  const outside = conflicts.filter((c) => c.reason === "outside-blocks");
  const full = conflicts.filter((c) => c.reason === "full");
  const parts: string[] = [];
  if (outside.length === 1) {
    const one = outside[0]!;
    parts.push(
      `${one.studentName} tiene horario fijo a las ${one.time}, fuera de la jornada configurada.`,
    );
  } else if (outside.length > 1) {
    parts.push(`${outside.length} alumnos fijos tienen horario fuera de la jornada configurada.`);
  }
  if (full.length === 1) {
    const one = full[0]!;
    parts.push(
      `No se pudo agendar a ${one.studentName} el ${one.date} a las ${one.time}: la clase está llena.`,
    );
  } else if (full.length > 1) {
    parts.push(`${full.length} clases fijas quedaron sin agendar porque el horario está lleno.`);
  }
  return parts.join(" ");
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>(empty);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);

  async function refresh() {
    const snapshot = await getSnapshot();
    setSt({ students: snapshot.students, lessons: snapshot.lessons, settings: snapshot.settings });
  }

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((current) => { if (active) setUser(current); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) { setSt(empty); return; }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        // Tops up the weekly slots before the first snapshot, so the agenda never
        // flashes without the classes that are about to exist.
        const result = await materializeRecurringFn();
        if (active && result.conflicts.length > 0) toast.error(conflictsMessage(result.conflicts));
      } catch {
        if (active) toast.error("No pudimos completar las clases fijas.");
      }
      try {
        if (active) await refresh();
      } catch {
        if (active) toast.error("No pudimos cargar tus datos. Volvé a intentar.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  /** Serializes mutations, refreshes afterwards, and turns errors into toasts. */
  async function commit<T>(work: () => Promise<T>, fallback: string): Promise<T | false> {
    if (!user) { toast.error("Iniciá sesión para guardar tus cambios."); return false; }
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    try {
      const result = await work();
      await refresh();
      return result;
    } catch (error) {
      toast.error(messageOf(error, fallback));
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  const changed = async (work: () => Promise<unknown>, fallback: string): Promise<boolean> =>
    (await commit(work, fallback)) !== false;

  /** Tops up the weekly slots after a schedule change, so it shows up immediately. */
  async function afterScheduleChange() {
    try {
      await materializeRecurringFn();
    } catch {
      // The next app load retries; never lose the student because of this.
    }
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    try {
      setUser(await loginUser({ data: { email, password } }));
      return null;
    } catch (error) {
      return messageOf(error, "No pudimos iniciar sesión.");
    }
  }

  async function signOut(): Promise<void> {
    try { await logoutUser(); } catch { /* the local session is cleared either way */ }
    setUser(null);
    setSt(empty);
  }

  const ctx: Ctx = {
    ...st, user, loading, busy, signIn, signOut,
    setStatus: (id, status) => changed(() => setLessonStatusFn({ data: { id, status } }), "No se pudo guardar el cambio."),
    setNotified: (id, notified) => changed(() => setLessonNotifiedFn({ data: { id, notified } }), "No se pudo guardar el aviso."),
    addLesson: async (l) => {
      if (!slots(st.settings).includes(l.start)) { toast.error("Horario fuera de los bloques configurados."); return false; }
      return changed(() => addLessonFn({ data: { date: l.date, start: l.start, studentId: l.studentId } }), "No se pudo reservar la clase.");
    },
    addStudent: async (s) => {
      const result = await commit(
        async () => {
          const id = await addStudentFn({ data: { name: s.name.trim(), type: s.type, pay: s.pay, phone: s.phone, category: s.category, courtSide: s.courtSide, slots: s.slots, balance: s.balance } });
          if (s.type === "fijo" && s.slots.length > 0) await afterScheduleChange();
          return id;
        },
        "No se pudo guardar el alumno.",
      );
      return typeof result === "string" ? result : false;
    },
    updateStudent: (id, s) =>
      changed(async () => {
        await updateStudentFn({ data: { id, name: s.name.trim(), type: s.type, pay: s.pay, phone: s.phone, category: s.category, courtSide: s.courtSide, slots: s.slots } });
        if (s.type === "fijo" && s.slots.length > 0) await afterScheduleChange();
      }, "No se pudo guardar el alumno."),
    adjustBalance: (id, delta) =>
      changed(() => adjustBalanceFn({ data: { id, delta } }), "No se pudo ajustar el saldo."),
    importStudents: async (rows) => {
      if (rows.length === 0) return false;
      const count = await commit(
        async () => {
          const total = await importStudentsFn({ data: { students: rows } });
          if (rows.some((r) => r.type === "fijo" && r.slots.length > 0)) await afterScheduleChange();
          return total;
        },
        "No se pudieron importar los alumnos.",
      );
      return typeof count === "number" ? count : false;
    },
    setNoticeTemplate: (template) =>
      changed(() => saveNoticeTemplateFn({ data: { template } }), "No se pudo guardar la plantilla del aviso."),
    moveLesson: (id, target) =>
      changed(() => moveLessonFn({ data: { id, date: target.date, start: target.start } }), "No se pudo mover la clase."),
    finishTour: async () => {
      if (!user) return false;
      let saved = true;
      try {
        await completeTour();
      } catch (error) {
        saved = false;
        toast.error(messageOf(error, "No se pudo guardar el tour."));
      }
      // The tour closes either way: never trap the teacher inside it because a
      // request failed.
      setUser({ ...user, tourDone: true });
      return saved;
    },
    updateProfile: async (name) => {
      if (!user) { toast.error("Iniciá sesión para guardar tus cambios."); return false; }
      setBusy(true);
      try {
        await updateProfileFn({ data: { name } });
        setUser({ ...user, name });
        return true;
      } catch (error) {
        toast.error(messageOf(error, "No se pudo guardar tu nombre."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    setSettings: async (s) => {
      if (!validSettings(s) || !user) return false;
      const allowed = slots(s);
      if (st.lessons.some((l) => l.status !== "cancelada" && !allowed.includes(l.start))) {
        toast.error("Los nuevos bloques dejarían clases existentes fuera de la agenda.");
        return false;
      }
      // A fixed slot with no lesson yet is invisible to the check above, so the
      // day is also compared with the students' own weekly slots.
      const fixed = st.students
        .filter((student) => student.type === "fijo")
        .flatMap((student) =>
          student.slots.map((slot) => ({ name: student.name, time: slot.time })),
        );
      const outside = fixedSlotsOutsideBlocks(s, fixed);
      if (outside.length > 0) {
        toast.error(outsideBlocksMessage(outside));
        return false;
      }
      return changed(async () => {
        // The server tops up the fixed slots inside the same transaction, so the
        // agenda is complete when the refresh reads it; a full block comes back
        // as a conflict instead of failing the save.
        const result = await saveSettingsFn({ data: s });
        if (result.conflicts.length > 0) toast.error(conflictsMessage(result.conflicts));
      }, "No se pudieron guardar los horarios.");
    },
  };

  return <C.Provider value={ctx}>{children}</C.Provider>;
}

export function useStore() { const c = useContext(C); if (!c) throw new Error("StoreProvider missing"); return c; }
