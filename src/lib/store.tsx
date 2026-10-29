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
  setLessonStatus as setLessonStatusFn,
  updateStudent as updateStudentFn,
  updateProfile as updateProfileFn,
} from "@/server/data";
import { getCurrentUser, loginUser, logoutUser, type AuthUser } from "@/server/auth";
import { balanceDelta, slots, validSettings, type ClassStatus } from "./rules";
import type { Category, CourtSide } from "./player";

export { slots, validSettings };
export type { ClassStatus };
export type { Category, CourtSide };

export type StudentType = "fijo" | "rotativo";
export type PayMode = "mensual" | "semanal";
export type Student = {
  id: string;
  name: string;
  type: StudentType;
  pay: PayMode;
  phone: string | null;
  /** Padel category and court side, or null when the teacher did not set them. */
  category: Category | null;
  courtSide: CourtSide | null;
  /** Weekly fixed slot: 0 = Sunday, or null when the student has none. */
  recurringWeekday: number | null;
  recurringTime: string | null;
  balance: number;
};
export type Lesson = { id: string; date: string; start: string; studentId: string; status: ClassStatus };
export type Settings = {
  startHour: number;
  endHour: number;
  blockMin: number;
  /** Optional daily break: both sides together, or both null. */
  breakStart: number | null;
  breakEnd: number | null;
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
  addLesson: (l: Omit<Lesson, "id" | "status">) => Promise<boolean>;
  addStudent: (s: Omit<Student, "id">) => Promise<string | false>;
  updateStudent: (id: string, s: Pick<Student, "name" | "type" | "pay" | "phone" | "category" | "courtSide" | "recurringWeekday" | "recurringTime">) => Promise<boolean>;
  adjustBalance: (id: string, delta: number) => Promise<boolean>;
  moveLesson: (id: string, target: { date: string; start: string }) => Promise<boolean>;
  setSettings: (s: Settings) => Promise<boolean>;
  updateProfile: (name: string) => Promise<boolean>;
};

const empty: State = { students: [], lessons: [], settings: { startHour: 8, endHour: 22, blockMin: 60, breakStart: null, breakEnd: null } };
const C = createContext<Ctx | null>(null);

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

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
        if (active && result.conflicts.length > 0) {
          const first = result.conflicts[0]!;
          toast.error(
            result.conflicts.length === 1
              ? `No se pudo agendar a ${first.studentName} el ${first.date} a las ${first.time}: la clase está llena.`
              : `${result.conflicts.length} clases fijas quedaron sin agendar porque el horario está lleno.`,
          );
        }
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
    addLesson: async (l) => {
      if (!slots(st.settings).includes(l.start)) { toast.error("Horario fuera de los bloques configurados."); return false; }
      return changed(() => addLessonFn({ data: { date: l.date, start: l.start, studentId: l.studentId } }), "No se pudo reservar la clase.");
    },
    addStudent: async (s) => {
      const result = await commit(
        async () => {
          const id = await addStudentFn({ data: { name: s.name.trim(), type: s.type, pay: s.pay, phone: s.phone, category: s.category, courtSide: s.courtSide, recurringWeekday: s.recurringWeekday, recurringTime: s.recurringTime, balance: s.balance } });
          if (s.recurringWeekday !== null && s.recurringTime !== null) await afterScheduleChange();
          return id;
        },
        "No se pudo guardar el alumno.",
      );
      return typeof result === "string" ? result : false;
    },
    updateStudent: (id, s) =>
      changed(async () => {
        await updateStudentFn({ data: { id, name: s.name.trim(), type: s.type, pay: s.pay, phone: s.phone, category: s.category, courtSide: s.courtSide, recurringWeekday: s.recurringWeekday, recurringTime: s.recurringTime } });
        if (s.recurringWeekday !== null && s.recurringTime !== null) await afterScheduleChange();
      }, "No se pudo guardar el alumno."),
    adjustBalance: (id, delta) =>
      changed(() => adjustBalanceFn({ data: { id, delta } }), "No se pudo ajustar el saldo."),
    moveLesson: (id, target) =>
      changed(() => moveLessonFn({ data: { id, date: target.date, start: target.start } }), "No se pudo mover la clase."),
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
      if (st.lessons.some((l) => l.status !== "cancelada" && !slots(s).includes(l.start))) {
        toast.error("Los nuevos bloques dejarían clases existentes fuera de la agenda.");
        return false;
      }
      return changed(() => saveSettingsFn({ data: s }), "No se pudieron guardar los horarios.");
    },
  };

  return <C.Provider value={ctx}>{children}</C.Provider>;
}

export function useStore() { const c = useContext(C); if (!c) throw new Error("StoreProvider missing"); return c; }
