-- Session Report v1 database migration.
-- This file is intentionally standalone and is not executed by the application.
-- Existing tables, functions, and triggers are not modified.

CREATE TABLE IF NOT EXISTS public.session_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.tutors(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_type text NOT NULL,
    lesson_id uuid NULL REFERENCES public.lessons(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    group_session_id uuid NULL REFERENCES public.group_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    attendance_id uuid NULL REFERENCES public.attendance(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    session_date date NOT NULL,
    content text NOT NULL,
    assessment text NULL,
    strengths text NULL,
    improvements text NULL,
    homework text NULL,
    parent_note text NULL,
    next_focus text NULL,
    status text NOT NULL DEFAULT 'draft',
    submitted_at timestamptz NULL,
    submitted_by uuid NULL REFERENCES public.profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT session_reports_source_type_check
        CHECK (source_type IN ('lesson', 'group_session')),
    CONSTRAINT session_reports_status_check
        CHECK (status IN ('draft', 'submitted')),
    CONSTRAINT session_reports_source_shape_check
        CHECK (
            (source_type = 'lesson'
                AND lesson_id IS NOT NULL
                AND group_session_id IS NULL
                AND attendance_id IS NULL)
            OR
            (source_type = 'group_session'
                AND lesson_id IS NULL
                AND group_session_id IS NOT NULL
                AND attendance_id IS NOT NULL)
        ),
    CONSTRAINT session_reports_submitted_metadata_check
        CHECK (
            (status = 'draft' AND submitted_at IS NULL)
            OR
            (status = 'submitted' AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS session_reports_lesson_student_uidx
    ON public.session_reports (lesson_id, student_id)
    WHERE source_type = 'lesson' AND lesson_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS session_reports_group_session_student_uidx
    ON public.session_reports (group_session_id, student_id)
    WHERE source_type = 'group_session' AND group_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS session_reports_tutor_date_idx
    ON public.session_reports (tutor_id, session_date DESC);

CREATE INDEX IF NOT EXISTS session_reports_student_date_idx
    ON public.session_reports (student_id, session_date DESC);

CREATE INDEX IF NOT EXISTS session_reports_status_date_idx
    ON public.session_reports (status, session_date DESC);

CREATE INDEX IF NOT EXISTS session_reports_lesson_idx
    ON public.session_reports (lesson_id)
    WHERE lesson_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS session_reports_group_session_idx
    ON public.session_reports (group_session_id)
    WHERE group_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS session_reports_attendance_idx
    ON public.session_reports (attendance_id)
    WHERE attendance_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_session_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    source_tutor_id uuid;
    source_student_id uuid;
    source_completed boolean;
    source_cancelled boolean;
    attendance_status text;
    caller_is_admin boolean;
BEGIN
    IF NEW.content IS NULL OR btrim(NEW.content) = '' THEN
        RAISE EXCEPTION 'session_reports.content must not be empty';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.tutor_id IS DISTINCT FROM OLD.tutor_id
           OR NEW.student_id IS DISTINCT FROM OLD.student_id
           OR NEW.source_type IS DISTINCT FROM OLD.source_type
           OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
           OR NEW.group_session_id IS DISTINCT FROM OLD.group_session_id
           OR NEW.attendance_id IS DISTINCT FROM OLD.attendance_id
           OR NEW.session_date IS DISTINCT FROM OLD.session_date THEN
            RAISE EXCEPTION 'session report source identity is immutable';
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    )
    INTO caller_is_admin;

    IF NEW.status = 'submitted' AND NOT caller_is_admin THEN
        NEW.submitted_by := auth.uid();
        IF TG_OP = 'INSERT' THEN
            NEW.submitted_at := now();
        ELSIF OLD.status IS DISTINCT FROM 'submitted' THEN
            NEW.submitted_at := now();
        ELSE
            NEW.submitted_at := COALESCE(NEW.submitted_at, OLD.submitted_at);
        END IF;
    ELSIF NEW.status = 'submitted' THEN
        IF NEW.submitted_at IS NULL THEN
            NEW.submitted_at := now();
        END IF;
        IF NEW.submitted_by IS NULL THEN
            NEW.submitted_by := auth.uid();
        END IF;
    ELSE
        NEW.submitted_at := NULL;
        NEW.submitted_by := NULL;
    END IF;

    IF NEW.source_type = 'lesson' THEN
        SELECT
            s.tutor_id,
            l.student_id,
            l.status = 'completed',
            l.status = 'cancelled'
        INTO source_tutor_id, source_student_id, source_completed, source_cancelled
        FROM public.lessons l
        JOIN public.students s ON s.id = l.student_id
        WHERE l.id = NEW.lesson_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'lesson source does not exist';
        END IF;

        IF source_student_id IS DISTINCT FROM NEW.student_id THEN
            RAISE EXCEPTION 'lesson student does not match session report student';
        END IF;

        IF source_tutor_id IS DISTINCT FROM NEW.tutor_id THEN
            RAISE EXCEPTION 'lesson tutor does not match session report tutor';
        END IF;

        IF source_cancelled THEN
            RAISE EXCEPTION 'cancelled lessons cannot have session reports';
        END IF;

        IF NOT source_completed THEN
            RAISE EXCEPTION 'only completed lessons can have session reports';
        END IF;

    ELSIF NEW.source_type = 'group_session' THEN
        SELECT
            gc.tutor_id,
            a.student_id,
            gs.status = 'completed',
            gs.status = 'cancelled',
            a.status
        INTO source_tutor_id, source_student_id, source_completed, source_cancelled, attendance_status
        FROM public.group_sessions gs
        JOIN public.group_classes gc ON gc.id = gs.group_class_id
        JOIN public.attendance a ON a.session_id = gs.id
        WHERE gs.id = NEW.group_session_id
          AND a.id = NEW.attendance_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'group session and attendance source do not match or do not exist';
        END IF;

        IF source_student_id IS DISTINCT FROM NEW.student_id THEN
            RAISE EXCEPTION 'attendance student does not match session report student';
        END IF;

        IF source_tutor_id IS DISTINCT FROM NEW.tutor_id THEN
            RAISE EXCEPTION 'group session tutor does not match session report tutor';
        END IF;

        IF source_cancelled THEN
            RAISE EXCEPTION 'cancelled group sessions cannot have session reports';
        END IF;

        IF NOT source_completed THEN
            RAISE EXCEPTION 'only completed group sessions can have session reports';
        END IF;

        IF NEW.status = 'submitted' THEN
            IF attendance_status NOT IN ('present', 'late') THEN
                RAISE EXCEPTION 'submitted group session reports require present or late attendance';
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'unsupported session report source type: %', NEW.source_type;
    END IF;

    IF NOT caller_is_admin THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.tutors t
            WHERE t.id = NEW.tutor_id
              AND t.user_id = auth.uid()
        ) THEN
            RAISE EXCEPTION 'session report tutor ownership check failed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger tr
        JOIN pg_class c ON c.oid = tr.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE tr.tgname = 'session_reports_validate_trg'
          AND n.nspname = 'public'
          AND c.relname = 'session_reports'
          AND NOT tr.tgisinternal
    ) THEN
        CREATE TRIGGER session_reports_validate_trg
        BEFORE INSERT OR UPDATE ON public.session_reports
        FOR EACH ROW
        EXECUTE FUNCTION public.validate_session_report();
    END IF;
END;
$$;

ALTER TABLE public.session_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'session_reports'
          AND policyname = 'session_reports_tutor_select'
    ) THEN
        CREATE POLICY session_reports_tutor_select
            ON public.session_reports
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.tutors t
                    WHERE t.id = session_reports.tutor_id
                      AND t.user_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'session_reports'
          AND policyname = 'session_reports_tutor_insert'
    ) THEN
        CREATE POLICY session_reports_tutor_insert
            ON public.session_reports
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM public.tutors t
                    WHERE t.id = session_reports.tutor_id
                      AND t.user_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'session_reports'
          AND policyname = 'session_reports_tutor_update'
    ) THEN
        CREATE POLICY session_reports_tutor_update
            ON public.session_reports
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.tutors t
                    WHERE t.id = session_reports.tutor_id
                      AND t.user_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1
                    FROM public.tutors t
                    WHERE t.id = session_reports.tutor_id
                      AND t.user_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'session_reports'
          AND policyname = 'session_reports_admin_delete'
    ) THEN
        CREATE POLICY session_reports_admin_delete
            ON public.session_reports
            FOR DELETE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1
                    FROM public.profiles p
                    WHERE p.id = auth.uid()
                      AND p.role = 'admin'
                )
            );
    END IF;
END;
$$;

-- Verification queries (read-only; not executed by this assistant):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_reports';
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'session_reports' ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid, true) FROM pg_constraint WHERE conrelid = 'public.session_reports'::regclass;
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'session_reports';
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'session_reports';
-- SELECT tgname, pg_get_triggerdef(oid, true) FROM pg_trigger WHERE tgrelid = 'public.session_reports'::regclass AND NOT tgisinternal;
