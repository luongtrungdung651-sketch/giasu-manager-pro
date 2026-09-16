-- Tạo bảng student_progress
CREATE TABLE IF NOT EXISTS public.student_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
    recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
    score NUMERIC(4, 2) NOT NULL CHECK (score >= 0 AND score <= 10),
    assessment_type TEXT NOT NULL,
    topic TEXT,
    comment TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu có để tránh lỗi khi chạy lại
DROP POLICY IF EXISTS "Tutors can manage their students' progress" ON public.student_progress;

-- SELECT policy: Tutor chỉ đọc được progress của học sinh thuộc về tutor của mình
CREATE POLICY "Tutors can select their students' progress" ON public.student_progress
    FOR SELECT
    USING (tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()));

-- INSERT policy: Tutor chỉ thêm được row với tutor_id của mình
CREATE POLICY "Tutors can insert their students' progress" ON public.student_progress
    FOR INSERT
    WITH CHECK (tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()));

-- UPDATE policy: Tutor chỉ sửa được row của chính mình, và tutor_id không bị đổi sang của người khác
CREATE POLICY "Tutors can update their students' progress" ON public.student_progress
    FOR UPDATE
    USING (tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()))
    WITH CHECK (tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()));

-- DELETE policy: Tutor chỉ xóa được row của chính mình
CREATE POLICY "Tutors can delete their students' progress" ON public.student_progress
    FOR DELETE
    USING (tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()));

-- Create index để tối ưu truy vấn theo student_id và recorded_at
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON public.student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_recorded_at ON public.student_progress(recorded_at);
