CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120), type text NOT NULL CHECK (type IN ('fijo','rotativo')), pay text NOT NULL CHECK (pay IN ('mensual','semanal')), balance integer NOT NULL DEFAULT 0, UNIQUE(id,owner_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_students ON public.students FOR ALL TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());
CREATE TABLE public.lessons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), date date NOT NULL, start text NOT NULL CHECK (start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), student_id uuid NOT NULL, status text NOT NULL DEFAULT 'programada' CHECK (status IN ('programada','presente','ausente','cancelada')), FOREIGN KEY(student_id,owner_id) REFERENCES public.students(id,owner_id) ON DELETE CASCADE);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_lessons ON public.lessons FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE UNIQUE INDEX one_active_slot ON public.lessons(owner_id,date,start) WHERE status <> 'cancelada';
CREATE TABLE public.court_settings(owner_id uuid PRIMARY KEY DEFAULT auth.uid(), start_hour integer NOT NULL DEFAULT 8 CHECK(start_hour BETWEEN 0 AND 23), end_hour integer NOT NULL DEFAULT 22 CHECK(end_hour BETWEEN 1 AND 24), block_min integer NOT NULL DEFAULT 60 CHECK(block_min BETWEEN 15 AND 240), CHECK(end_hour>start_hour), CHECK(block_min <= (end_hour-start_hour)*60));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.court_settings TO authenticated;
GRANT ALL ON public.court_settings TO service_role;
ALTER TABLE public.court_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_settings ON public.court_settings FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE FUNCTION public.attendance_balance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_used integer := 0; new_used integer := 0;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_used := CASE WHEN OLD.status IN ('presente','ausente') THEN 1 ELSE 0 END; END IF;
 IF TG_OP <> 'DELETE' THEN new_used := CASE WHEN NEW.status IN ('presente','ausente') THEN 1 ELSE 0 END; END IF;
 IF TG_OP='UPDATE' AND (OLD.student_id<>NEW.student_id OR OLD.owner_id<>NEW.owner_id) THEN RAISE EXCEPTION 'No se puede cambiar el alumno de una clase'; END IF;
 UPDATE public.students SET balance=balance+old_used-new_used WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.student_id ELSE NEW.student_id END;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER attendance_balance AFTER INSERT OR UPDATE OR DELETE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.attendance_balance();
CREATE FUNCTION public.adjust_balance(student uuid, delta integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN IF delta NOT IN (-1,1) THEN RAISE EXCEPTION 'Ajuste inválido'; END IF; UPDATE public.students SET balance=balance+delta WHERE id=student AND owner_id=auth.uid(); END $$;
REVOKE ALL ON FUNCTION public.adjust_balance(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_balance(uuid,integer) TO authenticated,service_role;