-- Student Progress: Group Class support
-- Safe additive migration. Existing records remain one_to_one.

ALTER TABLE public.student_progress
ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'one_to_one';

ALTER TABLE public.student_progress
ADD COLUMN IF NOT EXISTS group_class_id UUID NULL
    REFERENCES public.group_classes(id) ON DELETE RESTRICT;

ALTER TABLE public.student_progress
ADD COLUMN IF NOT EXISTS group_session_id UUID NULL
    REFERENCES public.group_sessions(id) ON DELETE RESTRICT;

ALTER TABLE public.student_progress
DROP CONSTRAINT IF EXISTS student_progress_source_check;

ALTER TABLE public.student_progress
ADD CONSTRAINT student_progress_source_check
CHECK (
    (source_type = 'one_to_one'
        AND group_class_id IS NULL
        AND group_session_id IS NULL)
    OR
    (source_type = 'group'
        AND group_class_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_group_class_id
    ON public.student_progress(group_class_id);

CREATE INDEX IF NOT EXISTS idx_student_progress_group_session_id
    ON public.student_progress(group_session_id);

CREATE INDEX IF NOT EXISTS idx_student_progress_tutor_student
    ON public.student_progress(tutor_id, student_id);
