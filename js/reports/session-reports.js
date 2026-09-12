// ============================================================================
// js/reports/session-reports.js - Session Report v1 data access only
// ============================================================================
// Uses the shared Supabase client and leaves source validation/RLS to the
// database trigger and policies. No UI, schema, or business logic lives here.

function sessionReportError(code, message, cause) {
    return { code: code, message: message, cause: cause || null };
}

function getSessionReportsClient() {
    if (!window.supabaseClient) {
        throw new Error('Supabase client is not available.');
    }
    return window.supabaseClient;
}

async function getSessionReportByLesson(lessonId) {
    if (!lessonId) return { data: null, error: sessionReportError('INVALID_INPUT', 'lessonId is required.') };

    return getSessionReportsClient()
        .from('session_reports')
        .select('*')
        .eq('source_type', 'lesson')
        .eq('lesson_id', lessonId)
        .maybeSingle();
}

async function getSessionReportByGroupSessionStudent(groupSessionId, studentId) {
    if (!groupSessionId || !studentId) {
        return {
            data: null,
            error: sessionReportError('INVALID_INPUT', 'groupSessionId and studentId are required.')
        };
    }

    return getSessionReportsClient()
        .from('session_reports')
        .select('*')
        .eq('source_type', 'group_session')
        .eq('group_session_id', groupSessionId)
        .eq('student_id', studentId)
        .maybeSingle();
}

    async function getSessionReportsByGroupSession(groupSessionId) {
        if (!groupSessionId) return { data: [], error: sessionReportError('INVALID_INPUT', 'groupSessionId is required.') };

        return getSessionReportsClient()
        .from('session_reports')
        .select('*')
        .eq('source_type', 'group_session')
        .eq('group_session_id', groupSessionId)
        .order('created_at', { ascending: false });
    }

async function getSessionReportsByStudent(studentId, options) {
    if (!studentId) return { data: [], error: sessionReportError('INVALID_INPUT', 'studentId is required.') };

    var query = getSessionReportsClient()
        .from('session_reports')
        .select('*')
        .eq('student_id', studentId)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false });

    options = options || {};
    if (options.status) query = query.eq('status', options.status);
    if (options.fromDate) query = query.gte('session_date', options.fromDate);
    if (options.toDate) query = query.lte('session_date', options.toDate);
    if (Number.isInteger(options.limit) && options.limit > 0) query = query.limit(options.limit);

    return query;
}

async function getExistingSessionReportForDraft(payload) {
    if (payload.source_type === 'lesson') {
        return getSessionReportsClient()
            .from('session_reports')
            .select('id, status, lesson_id, student_id')
            .eq('source_type', 'lesson')
            .eq('lesson_id', payload.lesson_id)
            .eq('student_id', payload.student_id)
            .maybeSingle();
    }

    return getSessionReportsClient()
        .from('session_reports')
        .select('id, status, group_session_id, student_id')
        .eq('source_type', 'group_session')
        .eq('group_session_id', payload.group_session_id)
        .eq('student_id', payload.student_id)
        .maybeSingle();
}

async function createSessionReportDraft(payload) {
    payload = payload || {};
    if (!payload.tutor_id || !payload.student_id || !payload.source_type || !payload.session_date || !payload.content) {
        return { data: null, error: sessionReportError('INVALID_INPUT', 'Required report fields are missing.') };
    }

    if (payload.source_type === 'lesson' && !payload.lesson_id) {
        return { data: null, error: sessionReportError('INVALID_INPUT', 'lesson_id is required for lesson reports.') };
    }
    if (payload.source_type === 'group_session' && (!payload.group_session_id || !payload.attendance_id)) {
        return { data: null, error: sessionReportError('INVALID_INPUT', 'group_session_id and attendance_id are required for group reports.') };
    }

    var existing = await getExistingSessionReportForDraft(payload);
    if (existing.error) return { data: null, error: existing.error };
    if (existing.data) {
        return {
            data: existing.data,
            error: sessionReportError('DUPLICATE_REPORT', 'A session report already exists for this student and session.')
        };
    }

    var report = Object.assign({}, payload, { status: 'draft' });
    delete report.submitted_at;
    delete report.submitted_by;

    return getSessionReportsClient()
        .from('session_reports')
        .insert(report)
        .select('*')
        .single();
}

function sanitizeSessionReportPatch(patch) {
    patch = Object.assign({}, patch || {});
    delete patch.id;
    delete patch.tutor_id;
    delete patch.student_id;
    delete patch.source_type;
    delete patch.lesson_id;
    delete patch.group_session_id;
    delete patch.attendance_id;
    delete patch.session_date;
    delete patch.status;
    delete patch.submitted_at;
    delete patch.submitted_by;
    delete patch.created_at;
    delete patch.updated_at;
    return patch;
}

async function updateSessionReport(reportId, patch, draftOnly) {
    if (!reportId) return { data: null, error: sessionReportError('INVALID_INPUT', 'reportId is required.') };

    var query = getSessionReportsClient()
        .from('session_reports')
        .update(sanitizeSessionReportPatch(patch))
        .eq('id', reportId);
    if (draftOnly) query = query.eq('status', 'draft');
    return query.select('*').maybeSingle();
}

async function updateSessionReportDraft(reportId, patch) {
    return updateSessionReport(reportId, patch, true);
}

async function submitSessionReport(reportId) {
    if (!reportId) return { data: null, error: sessionReportError('INVALID_INPUT', 'reportId is required.') };

    return getSessionReportsClient()
        .from('session_reports')
        .update({ status: 'submitted' })
        .eq('id', reportId)
        .eq('status', 'draft')
        .select('*')
        .maybeSingle();
}

var activeSessionReportForm = null;
var sessionReportFormBound = false;

function sessionReportEl(id) {
    return document.getElementById(id);
}

function showSessionReportFormError(message) {
    var errorEl = sessionReportEl('session-report-error');
    if (!errorEl) return;
    errorEl.innerText = message || 'Không thể lưu báo cáo.';
    errorEl.style.display = 'block';
}

function clearSessionReportFormError() {
    var errorEl = sessionReportEl('session-report-error');
    if (!errorEl) return;
    errorEl.innerText = '';
    errorEl.style.display = 'none';
}

function normalizeSessionReportContext(context) {
    context = context || {};
    var sourceType = context.source_type || context.sourceType;
    var normalized = {
        source_type: sourceType,
        tutor_id: context.tutor_id || context.tutorId || window.activeTutorId,
        student_id: context.student_id || context.studentId,
        lesson_id: context.lesson_id || context.lessonId || null,
        group_session_id: context.group_session_id || context.groupSessionId || null,
        attendance_id: context.attendance_id || context.attendanceId || null,
        session_date: context.session_date || context.sessionDate,
        student_name: context.student_name || context.studentName || 'Học sinh',
        subject: context.subject || '',
        session_label: context.session_label || context.sessionLabel || ''
    };
    if (normalized.source_type === 'lesson') {
        normalized.group_session_id = null;
        normalized.attendance_id = null;
    } else if (normalized.source_type === 'group_session') {
        normalized.lesson_id = null;
    }
    return normalized;
}

function sessionReportContextText(context) {
    var parts = [context.student_name, context.session_date];
    if (context.subject) parts.push(context.subject);
    if (context.session_label) parts.push(context.session_label);
    return parts.filter(Boolean).join(' · ');
}

function sessionReportFormValues() {
    return {
        content: (sessionReportEl('session-report-content').value || '').trim(),
        assessment: sessionReportEl('session-report-assessment').value || null,
        strengths: (sessionReportEl('session-report-strengths').value || '').trim() || null,
        improvements: (sessionReportEl('session-report-improvements').value || '').trim() || null,
        homework: (sessionReportEl('session-report-homework').value || '').trim() || null,
        parent_note: (sessionReportEl('session-report-parent-note').value || '').trim() || null,
        next_focus: (sessionReportEl('session-report-next-focus').value || '').trim() || null
    };
}

function fillSessionReportForm(report) {
    report = report || {};
    sessionReportEl('session-report-content').value = report.content || '';
    sessionReportEl('session-report-assessment').value = report.assessment || '';
    sessionReportEl('session-report-strengths').value = report.strengths || '';
    sessionReportEl('session-report-improvements').value = report.improvements || '';
    sessionReportEl('session-report-homework').value = report.homework || '';
    sessionReportEl('session-report-parent-note').value = report.parent_note || '';
    sessionReportEl('session-report-next-focus').value = report.next_focus || '';
}

function setSessionReportFormState(report) {
    var isSubmitted = !!report && report.status === 'submitted';
    var saveButton = sessionReportEl('session-report-save-btn');
    var submitButton = sessionReportEl('session-report-submit-btn');
    if (saveButton) saveButton.innerText = isSubmitted ? 'Lưu thay đổi' : 'Lưu nháp';
    if (submitButton) submitButton.style.display = isSubmitted ? 'none' : '';
}

function sessionReportPayload(values) {
    var context = activeSessionReportForm.context;
    // Only whitelist actual session_reports DB columns here. Do NOT spread
    // the whole context object — it also carries UI-only metadata
    // (session_label, student_name, subject) that has no matching column
    // in public.session_reports and would break the insert/update.
    return Object.assign({}, values, {
        source_type: context.source_type,
        tutor_id: context.tutor_id,
        student_id: context.student_id,
        lesson_id: context.lesson_id,
        group_session_id: context.group_session_id,
        attendance_id: context.attendance_id,
        session_date: context.session_date
    });
}

async function loadSessionReportForContext(context) {
    if (context.source_type === 'lesson') return getSessionReportByLesson(context.lesson_id);
    return getSessionReportByGroupSessionStudent(context.group_session_id, context.student_id);
}

function bindSessionReportForm() {
    if (sessionReportFormBound) return;
    var form = sessionReportEl('session-report-form');
    if (!form) return;
    sessionReportFormBound = true;
    sessionReportEl('session-report-close-btn').addEventListener('click', closeSessionReportForm);
    sessionReportEl('session-report-save-btn').addEventListener('click', function() {
        saveSessionReportForm(false);
    });
    form.addEventListener('submit', function(event) {
        event.preventDefault();
        saveSessionReportForm(true);
    });
}

async function openSessionReportForm(context) {
    bindSessionReportForm();
    activeSessionReportForm = { context: normalizeSessionReportContext(context), report: null };
    clearSessionReportFormError();
    fillSessionReportForm(null);

    var normalized = activeSessionReportForm.context;
    if (!normalized.source_type || !normalized.tutor_id || !normalized.student_id || !normalized.session_date
        || (normalized.source_type === 'lesson' && !normalized.lesson_id)
        || (normalized.source_type === 'group_session' && (!normalized.group_session_id || !normalized.attendance_id))) {
        showSessionReportFormError('Thiếu thông tin buổi học để mở báo cáo.');
        return;
    }

    sessionReportEl('session-report-context').innerText = sessionReportContextText(normalized);
    sessionReportEl('session-report-modal').classList.add('open');
    var result = await loadSessionReportForContext(normalized);
    if (result.error) {
        showSessionReportFormError(result.error.message || 'Không thể tải báo cáo.');
        return;
    }
    activeSessionReportForm.report = result.data || null;
    fillSessionReportForm(activeSessionReportForm.report);
    setSessionReportFormState(activeSessionReportForm.report);
}

function closeSessionReportForm() {
    var modal = sessionReportEl('session-report-modal');
    if (modal) modal.classList.remove('open');
    activeSessionReportForm = null;
}

async function saveSessionReportForm(submitAfterSave) {
    if (!activeSessionReportForm) return;
    clearSessionReportFormError();
    var values = sessionReportFormValues();
    if (!values.content) {
        showSessionReportFormError('Vui lòng nhập nội dung đã học.');
        sessionReportEl('session-report-content').focus();
        return;
    }

    var saveButton = sessionReportEl('session-report-save-btn');
    var submitButton = sessionReportEl('session-report-submit-btn');
    if (saveButton) saveButton.disabled = true;
    if (submitButton) submitButton.disabled = true;

    try {
        var result;
        if (!activeSessionReportForm.report) {
            result = await createSessionReportDraft(sessionReportPayload(values));
            if (result.error && result.error.code === 'DUPLICATE_REPORT') {
                var reload = await loadSessionReportForContext(activeSessionReportForm.context);
                if (!reload.error && reload.data) {
                    activeSessionReportForm.report = reload.data;
                    result = { data: reload.data, error: null };
                }
            }
        } else if (activeSessionReportForm.report.status === 'draft') {
            result = await updateSessionReportDraft(activeSessionReportForm.report.id, values);
        } else {
            result = await updateSessionReport(activeSessionReportForm.report.id, values);
        }

        if (result.error || !result.data) {
            showSessionReportFormError((result.error && result.error.message) || 'Không thể lưu báo cáo.');
            return;
        }

        activeSessionReportForm.report = result.data;
        if (submitAfterSave && result.data.status === 'draft') {
            result = await submitSessionReport(result.data.id);
            if (result.error || !result.data) {
                showSessionReportFormError((result.error && result.error.message) || 'Không thể hoàn thành báo cáo.');
                return;
            }
            activeSessionReportForm.report = result.data;
        }

        fillSessionReportForm(activeSessionReportForm.report);
        setSessionReportFormState(activeSessionReportForm.report);
        if (window.renderTodaysWork) window.renderTodaysWork();
        if (window.refreshActiveStudentReports) window.refreshActiveStudentReports();
        if (window.showToast) {
            window.showToast('✓', submitAfterSave ? 'Đã hoàn thành báo cáo' : 'Đã lưu báo cáo', '');
        }
    } catch (error) {
        showSessionReportFormError(error.message || 'Không thể lưu báo cáo.');
    } finally {
        if (saveButton) saveButton.disabled = false;
        if (submitButton) submitButton.disabled = false;
    }
}

window.openSessionReportForm = openSessionReportForm;
window.closeSessionReportForm = closeSessionReportForm;

window.getSessionReportByLesson = getSessionReportByLesson;
window.getSessionReportByGroupSessionStudent = getSessionReportByGroupSessionStudent;
window.getSessionReportsByGroupSession = getSessionReportsByGroupSession;
window.getSessionReportsByStudent = getSessionReportsByStudent;
window.createSessionReportDraft = createSessionReportDraft;
window.updateSessionReport = updateSessionReport;
window.updateSessionReportDraft = updateSessionReportDraft;
window.submitSessionReport = submitSessionReport;
