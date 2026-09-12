// ============================================================================
// js/group-class/attendance.js  —  STEP 11H-B: GROUP CLASS ATTENDANCE
// ============================================================================
// Đây là ES module thật (cùng convention js/group-class/group-class.js/session.js/
// enrollment.js/schedule.js/generator.js — xem comment trong index.html tại vị trí nạp module
// này). Module này tự expose các hàm cần thiết qua window ở cuối file để (a) onclick="..."/
// oninput="..." trong HTML gọi được, và (b) group-class.js (switchGroupClassTab) gọi lại qua
// window.loadGroupClassAttendanceIfNeeded.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js/group-class.js định nghĩa
// (activeGroupClassId, supabaseClient, escapeHtml, showToast, describeSupabaseError, formatDate).
// Module này KHÔNG import group-class.js/session.js/enrollment.js/schedule.js/generator.js
// (tránh circular dependency, cùng lý do các module Group Class khác không phụ thuộc lẫn nhau) —
// vì lý do đó, module này KHÔNG dùng lại gcSessionListCache của session.js (module-local, không
// export), mà tự query group_sessions riêng cho danh sách của chính nó.
//
// SCHEMA LIVE — SOURCE OF TRUTH (STEP 11H-A, xem
// STEP_11H-A_ATTENDANCE_ARCHITECTURE_AUDIT_REPORT.md mục 4-5):
//   public.attendance: id, session_id (FK group_sessions, CASCADE), student_id (FK students,
//   CASCADE), status (CHECK present/absent/excused/late), notes, marked_at (default now()),
//   marked_by (default auth.uid()). UNIQUE(session_id, student_id). KHÔNG có enrollment_id.
//   Enrollment validity (joined_at <= scheduled_date AND (left_at IS NULL OR left_at >=
//   scheduled_date)) được enforce bởi trigger check_attendance_enrollment() ở DB — module này
//   PHẢI dùng ĐÚNG điều kiện đó khi query "eligible students" (mục 6 đề bài), KHÔNG được tự suy
//   diễn schema khác.
//
// PHẠM VI STEP 11H-B (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN):
//   1. Tab "Điểm danh": danh sách group_sessions của lớp + tóm tắt đã điểm danh bao nhiêu.
//   2. Chọn 1 session -> Attendance detail: danh sách student ĐỦ ĐIỀU KIỆN (enrollment hợp lệ
//      tại đúng scheduled_date của session đó, KHÔNG phải toàn bộ active enrollment của lớp).
//   3. Điểm danh present/absent/excused/late + notes ngắn, Lưu bằng upsert theo (session_id,
//      student_id) — KHÔNG tự INSERT chỉ vì mở detail (mục 7/11 đề bài).
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (để dành cho step sau — KHÔNG code ở đây dù chỉ 1 dòng):
//   - Billing integration (đọc class_rate/tính tiền theo attendance).
//   - Attendance KPI toàn Group Class (#gc-kpi-attendance-rate ở Overview — vẫn TIẾP TỤC là
//     placeholder tĩnh do group-class.js quản lý, module này KHÔNG đụng tới).
//   - Attendance matrix theo tháng, automated reminders, makeup automation.
//   - Sửa enrollment overlap (STEP 11H-A mục 12/26 đã ghi nhận là RISK, KHÔNG fix ở đây — xem
//     dedupeEligibleByStudentId() bên dưới: chỉ tránh CRASH khi Save, KHÔNG sửa dữ liệu enrollment).
//   - Cancelled-session DB trigger — cancelled chỉ chặn ở UI (mục 5/27 đề bài), KHÔNG thêm DB
//     check/trigger nào.
//
// KHÔNG ĐỤNG (bắt buộc đọc trước khi sửa file này):
//   - 1-to-1 Attendance: renderAttendanceGrid()/loadMonthAttendanceAndFee()/student.attendance
//     (js/calendar/calendar.js, js/lessons/lessons.js, js/students/students.js) là HỆ THỐNG KHÁC
//     HOÀN TOÀN (bridge từ lessons.status, KHÔNG liên quan bảng public.attendance) — module này
//     TUYỆT ĐỐI KHÔNG gọi/import/reuse các hàm đó (STEP 11H-A mục 13 đã xác nhận không có xung
//     đột tên hàm giữa 2 hệ thống, CHỈ trùng cách gọi chung chung là "attendance").
//   - Generator/Calendar/Billing/Schedule: không query/import bất kỳ gì từ các module đó.
// ============================================================================

// ----------------------------------------------------------------------
// STATE (chỉ dùng trong module này — cùng convention gcSessionListCache/
// gcSessionListLoadedForClassId của session.js: cache CONTEXT-AWARE theo activeGroupClassId).
// ----------------------------------------------------------------------
var gcAttendanceSessionListCache = [];
var gcAttendanceSessionListLoadedForClassId = null;

// Session hiện đang mở ở detail view (null khi đang ở list view).
var gcAttendanceOpenSession = null;

// Danh sách student ĐỦ ĐIỀU KIỆN cho đúng session đang mở (đã dedupe theo student_id — xem
// dedupeEligibleByStudentId()) và draft trạng thái đang chỉnh (CHƯA lưu DB cho tới khi bấm Lưu).
var gcAttendanceEligibleCache = [];
var gcAttendanceDraftByStudentId = {};
var gcAttendanceReportByStudentId = {};

// Guard chống double-submit khi Lưu — cùng pattern addEnrollmentInFlight (enrollment.js),
// addGroupSessionInFlight (session.js).
var gcAttendanceSaveInFlight = false;

// 4 trạng thái điểm danh (CHECK constraint DB: present/absent/excused/late, STEP 11H-A mục 7) —
// KHÔNG thêm giá trị 'makeup' (mục 4 đề bài: makeup là group_sessions.session_type, KHÔNG phải
// attendance.status).
var attendanceStatusMeta = {
    present: { label: 'Có mặt', color: '#10b981' },
    absent:  { label: 'Vắng',   color: '#ef4444' },
    excused: { label: 'Có phép', color: '#38bdf8' },
    late:    { label: 'Muộn',   color: '#f59e0b' }
};
var ATTENDANCE_STATUS_ORDER = ['present', 'absent', 'excused', 'late'];

// ----------------------------------------------------------------------
// LOAD (context-aware theo activeGroupClassId) + RENDER TAB "ĐIỂM DANH" — VIEW 1 (danh sách)
// ----------------------------------------------------------------------
// Được gọi từ switchGroupClassTab('attendance') (group-class.js) mỗi lần vào tab. Chỉ tái dùng
// cache khi cache đó THỰC SỰ thuộc về activeGroupClassId hiện tại — nếu vừa chuyển Group Class A
// -> B, điều kiện tự động false và bắt buộc query lại Supabase cho đúng lớp mới (cùng nguyên tắc
// group isolation của session.js/enrollment.js, test 16 đề bài).
//
// LUÔN reset về VIEW 1 (danh sách) mỗi khi hàm này chạy — kể cả nhánh cache-hit — để tránh hiển
// thị lại Attendance detail của 1 session đã mở TRƯỚC KHI người dùng rời tab "Điểm danh" (ví dụ
// mở detail buổi A, chuyển sang tab "Buổi học", quay lại "Điểm danh": phải thấy lại danh sách,
// KHÔNG phải detail buổi A còn treo trên màn hình với dữ liệu có thể đã cũ).
async function loadGroupClassAttendanceIfNeeded() {
    showAttendanceListView();
    if (gcAttendanceSessionListLoadedForClassId === activeGroupClassId) {
        renderAttendanceSessionList();
        return;
    }
    await loadGroupClassAttendanceSessions();
}

async function loadGroupClassAttendanceSessions() {
    var container = document.getElementById('gc-attendance-session-list');
    if (!activeGroupClassId) return;

    if (container) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px; font-size:14px;">⏳ Đang tải danh sách buổi học...</div>';
    }

    try {
        // Query riêng của module này (KHÔNG dùng lại gcSessionListCache của session.js — module
        // đó không export cache, và 2 module CHỦ Ý độc lập, xem comment đầu file). group_class_id
        // = activeGroupClassId đã tự động chỉ trả về đúng lớp thuộc activeTutorId đang active
        // (RLS Tutor scope qua group_classes -> tutors chain, STEP 11H-A mục 10) — không cần lọc
        // lại tutor_id ở đây, cùng convention session.js/enrollment.js.
        var sessionsResult = await supabaseClient
            .from('group_sessions')
            .select('id, group_class_id, scheduled_date, start_time, duration, status, session_type, notes')
            .eq('group_class_id', activeGroupClassId)
            .order('scheduled_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (sessionsResult.error) {
            console.error('[GROUP CLASS ATTENDANCE] Tải danh sách buổi học FAILED:', sessionsResult.error);
            if (container) {
                container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được danh sách buổi học.<br>' + escapeHtml(describeSupabaseError(sessionsResult.error)) + '</div>';
            }
            return;
        }

        var sessions = sessionsResult.data || [];

        // Mục 22 đề bài: 1 query sessions + 1 query attendance (KHÔNG N+1 theo từng session) để
        // lấy số đã điểm danh cho MỖI session trong danh sách, chỉ để hiển thị tóm tắt "Đã điểm
        // danh: N" (mục 13). Nếu query này lỗi, KHÔNG chặn cả danh sách — chỉ hiển thị thiếu phần
        // tóm tắt (non-critical), vẫn cho vào xem detail bình thường.
        var markedCountBySessionId = {};
        if (sessions.length > 0) {
            var sessionIds = sessions.map(function(s) { return s.id; });
            var attCountResult = await supabaseClient
                .from('attendance')
                .select('session_id')
                .in('session_id', sessionIds);
            if (!attCountResult.error && attCountResult.data) {
                attCountResult.data.forEach(function(row) {
                    markedCountBySessionId[row.session_id] = (markedCountBySessionId[row.session_id] || 0) + 1;
                });
            } else if (attCountResult.error) {
                console.error('[GROUP CLASS ATTENDANCE] Tải tóm tắt điểm danh FAILED (không chặn danh sách):', attCountResult.error);
            }
        }

        gcAttendanceSessionListCache = sessions.map(function(s) {
            return Object.assign({}, s, { markedCount: markedCountBySessionId[s.id] || 0 });
        });
        gcAttendanceSessionListLoadedForClassId = activeGroupClassId;
        renderAttendanceSessionList();
    } catch (err) {
        console.error('[GROUP CLASS ATTENDANCE] Tải danh sách buổi học EXCEPTION:', err);
        if (container) {
            container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Lỗi không xác định khi tải danh sách buổi học.</div>';
        }
    }
}

function renderAttendanceSessionList() {
    var container = document.getElementById('gc-attendance-session-list');
    if (!container) return;

    // Mục 21 đề bài: empty state "Chưa có buổi học."
    if (gcAttendanceSessionListCache.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af; text-align:left; padding:2px 0; font-size:12.5px;">Chưa có buổi học.</div>';
        return;
    }

    container.innerHTML = gcAttendanceSessionListCache.map(buildAttendanceSessionRowHtml).join('');
}

// Session-type/status badge tái dùng ĐÚNG style .sched-tag (đã có sẵn, style.css) — KHÔNG tạo
// CSS mới, KHÔNG tái dùng buildGroupSessionStatusBadgeHtml/buildGroupSessionTypeBadgeHtml của
// session.js (module-local, không export — cùng lý do "2 module độc lập" ở đầu file), tự định
// nghĩa bản tương đương ở đây với ĐÚNG cùng bộ nhãn/màu để nhất quán UI.
var _gcAttSessionStatusMeta = {
    scheduled: { label: 'Đã lên lịch', color: '#38bdf8' },
    completed: { label: 'Đã hoàn thành', color: '#10b981' },
    cancelled: { label: 'Đã hủy', color: '#ef4444' }
};
var _gcAttSessionTypeMeta = {
    regular: { label: '📘 Định kỳ', color: '#8b5cf6' },
    makeup: { label: '🔄 Học bù', color: '#f59e0b' }
};

function buildAttendanceSessionRowHtml(gs) {
    var d = new Date(gs.scheduled_date + 'T00:00:00');
    var shortDate = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    var timeStr = escapeHtml(String(gs.start_time || '').slice(0, 5));
    var typeMeta = _gcAttSessionTypeMeta[gs.session_type] || _gcAttSessionTypeMeta.regular;
    var statusMeta = _gcAttSessionStatusMeta[gs.status] || _gcAttSessionStatusMeta.scheduled;
    var badges = '<span class="sched-tag" style="background:rgba(0,0,0,0); color:' + typeMeta.color + '; border-color:' + typeMeta.color + '33;">' + escapeHtml(typeMeta.label) + '</span>' +
        '<span class="sched-tag" style="background:rgba(0,0,0,0); color:' + statusMeta.color + '; border-color:' + statusMeta.color + '33;">' + escapeHtml(statusMeta.label) + '</span>';

    var summaryOrAction;
    if (gs.status === 'cancelled') {
        // Mục 5/21 đề bài: cancelled -> KHÔNG cho điểm danh, KHÔNG hiện nút, hiện rõ lý do.
        summaryOrAction = '<div style="color:#ef4444; font-size:12px; margin-top:4px;">Buổi học đã huỷ — không thể điểm danh.</div>';
    } else {
        var summaryText = gs.markedCount > 0
            ? ('Đã điểm danh: ' + gs.markedCount)
            : 'Chưa có dữ liệu điểm danh.';
        summaryOrAction = '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:4px; flex-wrap:wrap;">' +
            '<span style="color:var(--text-sub); font-size:12px;">' + escapeHtml(summaryText) + '</span>' +
            '<button type="button" class="btn-primary" style="padding:5px 12px; font-size:12px;" onclick="openGroupClassAttendanceDetail(\'' + gs.id + '\')">Điểm danh</button>' +
            '</div>';
    }

    return '<div style="padding:8px 0; border-top:1px solid var(--border-color); font-size:12.5px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
                '<div style="color:var(--text-main); font-weight:600;">' + escapeHtml(shortDate) + ' · ' + timeStr + ' · ' + Number(gs.duration) + 'p' + '</div>' +
                '<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">' + badges + '</div>' +
            '</div>' +
            summaryOrAction +
        '</div>';
}

// ----------------------------------------------------------------------
// VIEW TOGGLE (list <-> detail, trong CÙNG panel #gc-tab-attendance — mục 14 đề bài, phương án
// ít thay đổi nhất, KHÔNG tạo modal/route mới)
// ----------------------------------------------------------------------
function showAttendanceListView() {
    var listView = document.getElementById('gc-attendance-list-view');
    var detailView = document.getElementById('gc-attendance-detail-view');
    if (listView) listView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';
    gcAttendanceOpenSession = null;
}

function showAttendanceDetailView() {
    var listView = document.getElementById('gc-attendance-list-view');
    var detailView = document.getElementById('gc-attendance-detail-view');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
}

// ----------------------------------------------------------------------
// DETAIL VIEW — mở 1 session cụ thể
// ----------------------------------------------------------------------
function openGroupClassAttendanceDetail(sessionId) {
    var gs = gcAttendanceSessionListCache.find(function(s) { return s.id === sessionId; });
    if (!gs) {
        // Mục 20 đề bài: session không tồn tại (VD cache cũ, đã bị xoá ở nơi khác) — báo rõ,
        // KHÔNG silently swallow.
        if (typeof showToast === 'function') showToast('⚠️', 'Không tìm thấy buổi học', 'Vui lòng tải lại danh sách.');
        return;
    }
    if (gs.status === 'cancelled') {
        // Guard phòng thủ — nút "Điểm danh" vốn KHÔNG render cho session cancelled (xem
        // buildAttendanceSessionRowHtml), nhưng vẫn chặn ở đây phòng trường hợp gọi trực tiếp.
        if (typeof showToast === 'function') showToast('⚠️', 'Buổi học đã huỷ', 'Không thể điểm danh cho buổi học đã huỷ.');
        return;
    }

    gcAttendanceOpenSession = gs;
    var headerEl = document.getElementById('gc-attendance-detail-header');
    if (headerEl) {
        var d = new Date(gs.scheduled_date + 'T00:00:00');
        var shortDate = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        headerEl.innerText = shortDate + ' · ' + String(gs.start_time || '').slice(0, 5);
    }
    showAttendanceDetailView();

    var body = document.getElementById('gc-attendance-detail-body');
    if (body) {
        body.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px; font-size:14px;">⏳ Đang tải...</div>';
    }
    loadAttendanceDetailData();
}

function closeGroupClassAttendanceDetail() {
    showAttendanceListView();
    // Danh sách có thể vừa được cập nhật markedCount cục bộ sau khi Lưu (xem saveGroupClassAttendance())
    // — render lại để phản ánh, KHÔNG cần query lại Supabase (mục 22: tránh query thừa).
    renderAttendanceSessionList();
}

// Mục 12/26 STEP 11H-A: group_class_enrollments có thể có 2 record cùng student_id đang date-
// range chồng nhau (KHÔNG có exclusion constraint ở DB). Nếu để nguyên, cùng 1 student sẽ xuất
// hiện 2 dòng trong Attendance UI VÀ upsert() sẽ gửi 2 dòng cùng (session_id, student_id) trong
// 1 lần gọi -> Postgres lỗi "ON CONFLICT DO UPDATE command cannot affect row a second time".
// Đây KHÔNG PHẢI chỗ sửa enrollment overlap (mục 26 đề bài: việc đó để Billing xử lý riêng) —
// chỉ dedupe ở tầng hiển thị/gửi dữ liệu để KHÔNG crash Save. Giữ lại record đầu tiên tìm thấy
// (đủ để không vỡ chức năng chính; không có tiêu chí "đúng hơn" nào giữa 2 bản ghi chồng nhau ở
// STEP này).
function dedupeEligibleByStudentId(rows) {
    var seen = {};
    var out = [];
    rows.forEach(function(r) {
        if (seen[r.student_id]) return;
        seen[r.student_id] = true;
        out.push(r);
    });
    return out;
}

async function loadAttendanceDetailData() {
    var session = gcAttendanceOpenSession;
    if (!session) return;
    var body = document.getElementById('gc-attendance-detail-body');

    try {
        // Mục 6 đề bài: eligible = enrollment thoả joined_at <= scheduled_date AND (left_at IS
        // NULL OR left_at >= scheduled_date) — ĐÚNG điều kiện trigger check_attendance_enrollment()
        // đang enforce ở DB (STEP 11H-A mục 5), KHÔNG lọc theo status='active' (trigger KHÔNG đọc
        // cột đó), KHÔNG lấy toàn bộ students của tutor, KHÔNG dùng students.rate.
        var enrResult = await supabaseClient
            .from('group_class_enrollments')
            .select('id, student_id, joined_at, left_at, students(name)')
            .eq('group_class_id', session.group_class_id)
            .lte('joined_at', session.scheduled_date)
            .or('left_at.is.null,left_at.gte.' + session.scheduled_date);

        if (enrResult.error) {
            console.error('[GROUP CLASS ATTENDANCE] Tải danh sách học sinh đủ điều kiện FAILED:', enrResult.error);
            if (body) body.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được danh sách học sinh.<br>' + escapeHtml(describeSupabaseError(enrResult.error)) + '</div>';
            return;
        }

        // Mục 8 đề bài: load attendance rows CHO ĐÚNG session_id này (1 query, KHÔNG N+1).
        var attResult = await supabaseClient
            .from('attendance')
            .select('id, student_id, status, notes')
            .eq('session_id', session.id);

        if (attResult.error) {
            console.error('[GROUP CLASS ATTENDANCE] Tải dữ liệu điểm danh FAILED:', attResult.error);
            if (body) body.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được dữ liệu điểm danh.<br>' + escapeHtml(describeSupabaseError(attResult.error)) + '</div>';
            return;
        }

        var existingByStudentId = {};
        (attResult.data || []).forEach(function(row) { existingByStudentId[row.student_id] = row; });

        gcAttendanceEligibleCache = dedupeEligibleByStudentId(enrResult.data || []);
        gcAttendanceDraftByStudentId = {};
        gcAttendanceReportByStudentId = {};
        if (typeof window.getSessionReportsByGroupSession === 'function') {
            var reportResult = await window.getSessionReportsByGroupSession(session.id);
            if (!reportResult.error) {
                (reportResult.data || []).forEach(function(report) {
                    if (!gcAttendanceReportByStudentId[report.student_id]) {
                        gcAttendanceReportByStudentId[report.student_id] = report;
                    }
                });
            }
        }
        gcAttendanceEligibleCache.forEach(function(e) {
            var existing = existingByStudentId[e.student_id];
            // Mục 7/11 đề bài: nếu CHƯA có attendance row -> default UI 'present' nhưng CHỈ ở
            // client state (existingId null nghĩa là CHƯA từng INSERT — Lưu lần đầu sẽ INSERT
            // qua upsert, KHÔNG phải hành động mở màn hình này tự tạo ra INSERT).
            gcAttendanceDraftByStudentId[e.student_id] = {
                status: existing ? existing.status : 'present',
                notes: existing ? (existing.notes || '') : '',
                existingId: existing ? existing.id : null
            };
        });

        renderAttendanceDetailBody();
    } catch (err) {
        console.error('[GROUP CLASS ATTENDANCE] Tải Attendance detail EXCEPTION:', err);
        if (body) body.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Lỗi không xác định khi tải điểm danh.</div>';
    }
}

function renderAttendanceDetailBody() {
    var body = document.getElementById('gc-attendance-detail-body');
    if (!body) return;

    if (gcAttendanceEligibleCache.length === 0) {
        // Mục 21 đề bài
        body.innerHTML = '<div style="color:#9ca3af; text-align:left; padding:10px 0; font-size:12.5px;">Chưa có học sinh đủ điều kiện điểm danh.</div>';
        return;
    }

    var rowsHtml = gcAttendanceEligibleCache.map(buildAttendanceStudentRowHtml).join('');

    body.innerHTML =
        '<div id="gc-attendance-student-rows">' + rowsHtml + '</div>' +
        '<div id="gc-attendance-counters" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-color); font-size:12.5px; color:var(--text-sub); display:flex; gap:14px; flex-wrap:wrap;"></div>' +
        '<div style="margin-top:12px; text-align:right;">' +
            '<button type="button" class="btn-primary" id="gc-attendance-save-btn" style="padding:9px 18px; font-size:13px;" onclick="saveGroupClassAttendance()">Lưu điểm danh</button>' +
        '</div>';

    updateAttendanceCountersDisplay();
}

function buildAttendanceStudentRowHtml(entry) {
    var studentName = entry.students && entry.students.name ? entry.students.name : '(Không có tên)';
    var draft = gcAttendanceDraftByStudentId[entry.student_id] || { status: 'present', notes: '' };
    var report = gcAttendanceReportByStudentId[entry.student_id];
    var canReport = gcAttendanceOpenSession
        && gcAttendanceOpenSession.status === 'completed'
        && draft.existingId
        && (draft.status === 'present' || draft.status === 'late');

    var buttonsHtml = ATTENDANCE_STATUS_ORDER.map(function(statusKey) {
        var meta = attendanceStatusMeta[statusKey];
        var isActive = draft.status === statusKey;
        return '<button type="button" class="gc-att-status-btn" data-status="' + statusKey + '" ' +
            'style="padding:5px 10px; font-size:12px; border-radius:7px; border:1.5px solid ' + meta.color + '; cursor:pointer; font-family:\'Inter\',sans-serif; font-weight:600; background:' + (isActive ? meta.color : 'transparent') + '; color:' + (isActive ? '#fff' : meta.color) + ';" ' +
            'onclick="setAttendanceDraftStatus(\'' + entry.student_id + '\', \'' + statusKey + '\')">' + escapeHtml(meta.label) + '</button>';
    }).join('');

    var reportHtml = canReport
        ? '<button type="button" class="gc-session-report-btn" onclick="openGroupSessionReportForStudent(\'' + entry.student_id + '\')">' + (report ? (report.status === 'submitted' ? 'Đã báo cáo' : 'Báo cáo nháp') : 'Báo cáo') + '</button>'
        : '';

    return '<div id="gc-att-row-' + entry.student_id + '" style="padding:8px 0; border-top:1px solid var(--border-color);">' +
            '<div style="font-weight:600; font-size:13px; color:var(--text-main); margin-bottom:6px;">' + escapeHtml(studentName) + '</div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">' + buttonsHtml + '</div>' +
            '<input type="text" placeholder="Ghi chú (không bắt buộc)" value="' + escapeHtml(draft.notes || '') + '" ' +
                'style="width:100%; padding:6px 8px; font-size:12px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-card-sub); color:var(--text-main); font-family:\'Inter\',sans-serif;" ' +
                'oninput="onAttendanceDraftNotesInput(\'' + entry.student_id + '\', this.value)">' +
            reportHtml +
        '</div>';
}

function openGroupSessionReportForStudent(studentId) {
    var session = gcAttendanceOpenSession;
    var entry = gcAttendanceEligibleCache.find(function(item) { return item.student_id === studentId; });
    var draft = gcAttendanceDraftByStudentId[studentId];
    if (!session || !entry || !draft || !draft.existingId) return;
    if (session.status !== 'completed' || (draft.status !== 'present' && draft.status !== 'late')) return;
    if (typeof window.openSessionReportForm !== 'function') return;

    window.openSessionReportForm({
        source_type: 'group_session',
        tutor_id: window.activeTutorId,
        student_id: studentId,
        group_session_id: session.id,
        attendance_id: draft.existingId,
        session_date: session.scheduled_date,
        student_name: entry.students && entry.students.name ? entry.students.name : '(Không có tên)',
        subject: '',
        session_label: String(session.start_time || '').slice(0, 5)
    });
}

function refreshGroupSessionReportRow(report) {
    var session = gcAttendanceOpenSession;
    if (!session || !report || report.group_session_id !== session.id) return;
    gcAttendanceReportByStudentId[report.student_id] = report;
    var entry = gcAttendanceEligibleCache.find(function(item) { return item.student_id === report.student_id; });
    var row = document.getElementById('gc-att-row-' + report.student_id);
    if (!entry || !row) return;
    var button = row.querySelector('.gc-session-report-btn');
    if (button) button.innerText = report.status === 'submitted' ? 'Đã báo cáo' : 'Báo cáo nháp';
}

// Chỉ cập nhật highlight của đúng row + counters — KHÔNG re-render toàn bộ #gc-attendance-detail-body
// (mục 10 đề bài: không cần animation phức tạp, nhưng re-render toàn bộ HTML mỗi lần bấm 1 nút sẽ
// làm mất focus của các ô ghi chú đang gõ dở của HỌC SINH KHÁC trong cùng danh sách — tránh bằng
// cách chỉ đổi style của đúng row vừa bấm).
function setAttendanceDraftStatus(studentId, status) {
    if (!gcAttendanceDraftByStudentId[studentId]) {
        gcAttendanceDraftByStudentId[studentId] = { status: 'present', notes: '', existingId: null };
    }
    gcAttendanceDraftByStudentId[studentId].status = status;

    var row = document.getElementById('gc-att-row-' + studentId);
    if (row) {
        row.querySelectorAll('.gc-att-status-btn').forEach(function(btn) {
            var btnStatus = btn.getAttribute('data-status');
            var meta = attendanceStatusMeta[btnStatus];
            var isActive = btnStatus === status;
            btn.style.background = isActive ? meta.color : 'transparent';
            btn.style.color = isActive ? '#fff' : meta.color;
        });
    }
    updateAttendanceCountersDisplay();
}

// oninput trực tiếp ghi vào state (KHÔNG re-render DOM) — notes không ảnh hưởng counters, và giữ
// nguyên focus của ô đang gõ (mục 9 đề bài: notes chỉ là field ngắn, KHÔNG cần feature phức tạp).
function onAttendanceDraftNotesInput(studentId, value) {
    if (!gcAttendanceDraftByStudentId[studentId]) {
        gcAttendanceDraftByStudentId[studentId] = { status: 'present', notes: '', existingId: null };
    }
    gcAttendanceDraftByStudentId[studentId].notes = value;
}

// Mục 12 đề bài: Sĩ số / Đã điểm danh / 4 counter theo trạng thái — tính từ gcAttendanceDraftByStudentId
// hiện tại (UI state, bao gồm cả những dòng CHƯA lưu), nhất quán với những gì đang hiển thị trên
// màn hình tại thời điểm này.
function updateAttendanceCountersDisplay() {
    var el = document.getElementById('gc-attendance-counters');
    if (!el) return;

    var counts = { present: 0, absent: 0, excused: 0, late: 0 };
    var markedCount = 0;
    gcAttendanceEligibleCache.forEach(function(e) {
        var draft = gcAttendanceDraftByStudentId[e.student_id];
        if (!draft) return;
        counts[draft.status] = (counts[draft.status] || 0) + 1;
        if (draft.existingId) markedCount++;
    });

    el.innerHTML =
        '<span>Sĩ số: <b>' + gcAttendanceEligibleCache.length + '</b></span>' +
        '<span>Đã điểm danh: <b>' + markedCount + '</b></span>' +
        '<span style="color:' + attendanceStatusMeta.present.color + ';">Có mặt: <b>' + counts.present + '</b></span>' +
        '<span style="color:' + attendanceStatusMeta.absent.color + ';">Vắng: <b>' + counts.absent + '</b></span>' +
        '<span style="color:' + attendanceStatusMeta.excused.color + ';">Có phép: <b>' + counts.excused + '</b></span>' +
        '<span style="color:' + attendanceStatusMeta.late.color + ';">Muộn: <b>' + counts.late + '</b></span>';
}

// ----------------------------------------------------------------------
// SAVE — upsert theo (session_id, student_id) (mục 8 đề bài, UNIQUE constraint DB — STEP 11H-A
// mục 6), payload tối thiểu {session_id, student_id, status, notes}, KHÔNG gửi marked_at/
// marked_by (để DB tự xử lý default khi INSERT, và KHÔNG bị ghi đè khi UPDATE — mục 8 đề bài).
// ----------------------------------------------------------------------
async function saveGroupClassAttendance() {
    if (gcAttendanceSaveInFlight) return;
    var session = gcAttendanceOpenSession;
    if (!session) return;
    if (session.status === 'cancelled') return; // guard phòng thủ, cùng lý do openGroupClassAttendanceDetail()
    if (gcAttendanceEligibleCache.length === 0) return;

    gcAttendanceSaveInFlight = true;
    var saveBtn = document.getElementById('gc-attendance-save-btn');
    var origText = saveBtn ? saveBtn.innerText : null;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Đang lưu...'; }

    try {
        var payload = gcAttendanceEligibleCache.map(function(e) {
            var draft = gcAttendanceDraftByStudentId[e.student_id] || { status: 'present', notes: '' };
            var trimmedNotes = (draft.notes || '').trim();
            return {
                session_id: session.id,
                student_id: e.student_id,
                status: draft.status,
                notes: trimmedNotes || null
            };
        });

        var upsertResult = await supabaseClient
            .from('attendance')
            .upsert(payload, { onConflict: 'session_id,student_id' })
            .select('id, student_id, status, notes');

        if (upsertResult.error) {
            console.error('[GROUP CLASS ATTENDANCE] Lưu điểm danh FAILED:', upsertResult.error);
            showToast('⚠️', 'Không thể lưu điểm danh', describeSupabaseError(upsertResult.error));
            return; // Mục 20 đề bài: KHÔNG đóng detail view, giữ draft để user thử lại.
        }

        showToast('✅', 'Đã lưu điểm danh', formatDate(session.scheduled_date));

        // Cập nhật lại existingId cho từng draft từ kết quả trả về (để counters "Đã điểm danh"
        // đúng ngay mà KHÔNG cần query lại) + cập nhật markedCount trong danh sách session (mục
        // 22: tránh query thừa khi quay lại VIEW 1).
        var byStudentId = {};
        (upsertResult.data || []).forEach(function(row) { byStudentId[row.student_id] = row; });
        gcAttendanceEligibleCache.forEach(function(e) {
            var saved = byStudentId[e.student_id];
            if (saved && gcAttendanceDraftByStudentId[e.student_id]) {
                gcAttendanceDraftByStudentId[e.student_id].existingId = saved.id;
            }
        });
        updateAttendanceCountersDisplay();

        var listEntry = gcAttendanceSessionListCache.find(function(s) { return s.id === session.id; });
        if (listEntry) listEntry.markedCount = payload.length;

        // STEP 11H-D §15: đẩy Overview KPI/Attendance Summary cập nhật ngay sau khi Save thành
        // công (KHÔNG bắt user rời rồi vào lại Overview mới thấy) — cùng pattern enrollment.js gọi
        // window.syncGroupClassOverviewEnrollmentCount() sau khi enroll/leave. Gọi qua window.*
        // (KHÔNG import group-class.js ở đây — lý do "tránh circular dependency" đã ghi ở đầu
        // file). typeof-check để attendance.js không vỡ nếu group-class.js lỗi tải/chưa nạp kịp.
        if (typeof window.refreshGroupClassOverviewAttendanceSummary === 'function') {
            window.refreshGroupClassOverviewAttendanceSummary(session.group_class_id);
        }
    } catch (err) {
        console.error('[GROUP CLASS ATTENDANCE] Lưu điểm danh EXCEPTION:', err);
        showToast('⚠️', 'Lỗi không xác định', 'Không thể lưu điểm danh. Vui lòng thử lại.');
    } finally {
        gcAttendanceSaveInFlight = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = origText; }
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention group-class.js/session.js/enrollment.js mục
// "HTML COMPATIBILITY") — chỉ export những entry point thực sự cần cho onclick/oninput trong
// HTML hoặc để group-class.js gọi lại (loadGroupClassAttendanceIfNeeded).
// ============================================================================
export {
    loadGroupClassAttendanceIfNeeded, loadGroupClassAttendanceSessions, renderAttendanceSessionList,
    openGroupClassAttendanceDetail, closeGroupClassAttendanceDetail,
    setAttendanceDraftStatus, onAttendanceDraftNotesInput, saveGroupClassAttendance
};

window.loadGroupClassAttendanceIfNeeded = loadGroupClassAttendanceIfNeeded;
window.openGroupClassAttendanceDetail = openGroupClassAttendanceDetail;
window.closeGroupClassAttendanceDetail = closeGroupClassAttendanceDetail;
window.setAttendanceDraftStatus = setAttendanceDraftStatus;
window.onAttendanceDraftNotesInput = onAttendanceDraftNotesInput;
window.saveGroupClassAttendance = saveGroupClassAttendance;
