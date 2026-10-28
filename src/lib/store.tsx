import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type StudentType = "fijo" | "rotativo";
export type PayMode = "mensual" | "semanal";
export type Student = { id: string; name: string; type: StudentType; pay: PayMode; balance: number };
export type ClassStatus = "programada" | "presente" | "ausente" | "cancelada";
export type Lesson = { id: string; date: string; start: string; studentId: string; status: ClassStatus };
export type Settings = { startHour: number; endHour: number; blockMin: number };
export const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const validSettings = (s: Settings) => Number.isInteger(s.startHour) && Number.isInteger(s.endHour) && Number.isInteger(s.blockMin) && s.startHour >= 0 && s.startHour <= 23 && s.endHour > s.startHour && s.endHour <= 24 && s.blockMin >= 15 && s.blockMin <= 240 && s.blockMin <= (s.endHour-s.startHour)*60;
export function slots(s: Settings) {
  if (!validSettings(s)) return [];
  const out: string[] = [];
  for (let m = s.startHour * 60; m + s.blockMin <= s.endHour * 60; m += s.blockMin) out.push(`${String(Math.floor(m / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`);
  return out;
}
export function applyStatus(lesson: Lesson, student: Student, next: ClassStatus): Student {
  const used = (s: ClassStatus) => s === "presente" || s === "ausente" ? 1 : 0;
  return { ...student, balance: student.balance + used(lesson.status) - used(next) };
}
export const balanceLabel = (b: number) => b > 0 ? `+${b}` : `${b}`;
type State = { students: Student[]; lessons: Lesson[]; settings: Settings };
type Ctx = State & { session: Session | null; loading: boolean; busy: boolean; setStatus: (id: string, s: ClassStatus) => Promise<boolean>; addLesson: (l: Omit<Lesson,"id"|"status">) => Promise<boolean>; addStudent: (s: Omit<Student,"id">) => Promise<string | false>; updateStudent: (id: string, s: Pick<Student,"name"|"type"|"pay">) => Promise<boolean>; adjustBalance: (id: string, delta: number) => Promise<boolean>; setSettings: (s: Settings) => Promise<boolean> };
const empty: State = { students: [], lessons: [], settings: { startHour: 8, endHour: 22, blockMin: 60 } };
const C = createContext<Ctx | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [st,setSt] = useState<State>(empty);
  const [session,setSession] = useState<Session|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const mutationLock = useRef(false);
  async function refresh() {
    const [a,b,c] = await Promise.all([supabase.from("students").select("*").order("name"),supabase.from("lessons").select("*").order("date"),supabase.from("court_settings").select("*").maybeSingle()]);
    if (a.error || b.error || c.error) throw a.error || b.error || c.error;
    setSt({ students: (a.data ?? []).map(s => ({ id:s.id, name:s.name, type:s.type as StudentType, pay:s.pay as PayMode, balance:s.balance })), lessons: (b.data ?? []).map(l => ({ id:l.id, date:l.date, start:l.start, studentId:l.student_id, status:l.status as ClassStatus })), settings:c.data ? { startHour:c.data.start_hour,endHour:c.data.end_hour,blockMin:c.data.block_min } : empty.settings });
  }
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({data}) => { if(active) { setSession(data.session); setLoading(false); } });
    const {data} = supabase.auth.onAuthStateChange((_event,s) => { setSession(s); setLoading(false); });
    return () => { active=false; data.subscription.unsubscribe(); };
  },[]);
  useEffect(() => {
    if (!session) { setSt(empty); return; }
    setLoading(true);
    refresh().catch(() => toast.error("No pudimos cargar tus datos. Volvé a intentar.")).finally(() => setLoading(false));
  },[session?.user.id]);
  async function mutate(work: () => PromiseLike<{error: {message:string}|null}>) {
    if (!session) { toast.error("Iniciá sesión para guardar tus cambios."); return false; }
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    try { const {error} = await work(); if(error) throw error; await refresh(); return true; }
    catch(e) { const msg = e && typeof e === "object" && "message" in e ? String(e.message) : ""; toast.error(msg.includes("one_active_slot") ? "Ese horario ya está ocupado." : "No se pudo guardar el cambio. Intentá nuevamente."); return false; }
    finally { mutationLock.current = false; setBusy(false); }
  }
  const ctx: Ctx = { ...st,session,loading,busy,
    setStatus: (id,status) => mutate(() => supabase.from("lessons").update({status}).eq("id",id)),
    addLesson: async l => { if(!slots(st.settings).includes(l.start)) { toast.error("Horario fuera de los bloques configurados."); return false; } return mutate(() => supabase.from("lessons").insert({ date:l.date,start:l.start,student_id:l.studentId })); },
    addStudent: async s => { const id = crypto.randomUUID(); return await mutate(() => supabase.from("students").insert({ ...s,id,name:s.name.trim() })) ? id : false; },
    updateStudent: (id,s) => mutate(() => supabase.from("students").update({ name:s.name.trim(),type:s.type,pay:s.pay }).eq("id",id)),
    adjustBalance: (id,delta) => mutate(() => supabase.rpc("adjust_balance",{student:id,delta})),
    setSettings: async s => { if(!validSettings(s) || !session) return false; const ownerId=session.user.id; if(st.lessons.some(l => l.status !== "cancelada" && !slots(s).includes(l.start))) { toast.error("Los nuevos bloques dejarían clases existentes fuera de la agenda."); return false; } return mutate(() => supabase.from("court_settings").upsert({ owner_id:ownerId,start_hour:s.startHour,end_hour:s.endHour,block_min:s.blockMin })); },
  };
  return <C.Provider value={ctx}>{children}</C.Provider>;
}
export function useStore() { const c = useContext(C); if(!c) throw new Error("StoreProvider missing"); return c; }