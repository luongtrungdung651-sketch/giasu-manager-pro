// ============================================================================
// js/group-class/student-detail.js  —  STEP 11H-D: GROUP CLASS STUDENT DETAIL
// ============================================================================
// Đây là ES module thật (cùng convention js/group-class/group-class.js/enrollment.js/session.js/
// attendance.js — xem comment trong index.html tại vị trí nạp module này). Module này tự expose
// các hàm cần thiết qua window ở cuối file để (a) onclick="..." trong HTML/enrollment.js gọi
// được, và (b) group-class.js (switchGroupClassTab) gọi lại qua
// window.resetGroupClassStudentDetailView.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js/group-class.js định nghĩa
// (activeGroupClassId, groupClassList, supabaseClient, escapeHtml, showToast,
// describeSupabaseError, formatDate). Module này KHÔNG import group-class.js/enrollment.js/
// session.js/attendance.js/schedule.js/generator.js (tránh circular dependency, cùng lý do các
// module Group Class khác không phụ thuộc lẫn nhau — enrollment.js gọi hàm ở đây qua window.*,
// KHÔNG phải static import). Cùng lý do defer/module với các module khác: module bị hoãn, chạy
// SAU khi script chính đã chạy xong, và group-class.js/enrollment.js LUÔN load TRƯỚC module này
// (xem thứ tự <script type="module"> trong index.html) nên tại thời điểm các hàm dưới đây THỰC SỰ
// được gọi, mọi global trên đã tồn tại.
//
// ARCHITECTURE — Group Class là entity riêng, student là entity GLOBAL (bảng students dùng chung
// nhiều Group Class). Module này TUYỆT ĐỐI KHÔNG tạo student record mới, KHÔNG duplicate student —
// chỉ ĐỌC lại đúng 1 student global + đúng 1 enrollment (student_id + group_class_id) + sessions/
// attendance của ĐÚNG Group Class đang mở (activeGroupClassId), KHÔNG lấy toàn bộ dữ liệu học sinh
// trên mọi Group Class khác.
//
// CONTEXT BẮT BUỘC (Phần 4/6/8 đề bài): activeGroupClassId + selectedStudentId — KHÔNG BAO GIỜ chỉ
// dùng selectedStudentId, vì 1 student có thể thuộc nhiều Group Class với class_rate khác nhau
// (test bắt buộc ở Phần 6: mở Group Class A -> Student A phải thấy ĐÚNG rate của lớp A, mở Group
// Class B -> Student A phải thấy ĐÚNG rate của lớp B). gcStudentDetailContext dưới đây LUÔN giữ
// cặp (groupClassId, studentId) mà lần load GẦN NHẤT đang chạy/đã render thuộc về — mọi callback
// bất đồng bộ (sau await) đều RECHECK context này trước khi ghi vào DOM, tránh race condition khi
// người dùng đổi lớp/đổi tab/đổi học sinh khác trong lúc đang chờ mạng (cùng nguyên tắc context-
// aware cache đã dùng ở group-class.js/enrollment.js/session.js/schedule.js/generator.js).
//
// class_rate PHẢI lấy từ group_class_enrollments.class_rate theo (student_id, group_class_id) —
// TUYỆT ĐỐI KHÔNG dùng students.rate (học sinh chỉ thuộc Group Class có students.rate = giá trị
// placeholder nội bộ 150, KHÔNG phải học phí thật — xem NEW_STUDENT_DEFAULT_RATE trong
// enrollment.js).
//
// ELIGIBILITY / SECURITY (Phần 5 đề bài): chỉ mở được Detail khi tồn tại enrollment
// status='active' cho ĐÚNG (group_class_id, student_id) — nếu không tìm thấy (VD student đã rời
// lớp ở tab/thiết bị khác trong lúc đang xem danh sách), hiển thị thông báo và KHÔNG render các
// section còn lại. KHÔNG đổi RLS — toàn bộ scoping "không thấy Group Class/học sinh của Tutor
// khác" tiếp tục do RLS hiện có (group_classes -> tutors chain) đảm nhiệm, module này chỉ thêm 1
// lớp kiểm tra UI (student thực sự active-enrolled trong ĐÚNG lớp đang mở).
//
// PHẠM VI STEP 11H-D (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN):
//   A. Thông tin học sinh (reuse students.name/subject/parent_name/parent_phone — CHỈ những field
//      đã thực sự được dùng ở nơi khác trong app — Search+Filter, modal "Tạo học viên mới" — KHÔNG
//      invent field mới như grade/school/current_score/target_score/goal dù các cột đó CÓ tồn tại
//      trên schema, vì chưa từng được đưa vào bất kỳ UI nào trong app này).
//   B. Thông tin trong Group Class (class_rate, joined_at, left_at, status — từ
//      group_class_enrollments, KHÔNG phải students.rate).
//   C. Lịch sử buổi học (group_sessions của group_class_id — CHỈ hiển thị, KHÔNG sửa
//      generator/recurring schedule/Calendar).
//   D. Attendance của student trong Group Class hiện tại (join attendance.student_id +
//      attendance.session_id -> group_sessions.group_class_id, KHÔNG đổi attendance CRUD đã có).
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (để dành cho step sau — KHÔNG code ở đây dù chỉ 1 dòng):
//   - "Chỉnh sửa" học sinh: js/students/students.js openEditClass()/saveEditClass() bắt buộc chọn
//     ≥1 ngày học + ≥1 giờ dạy mới cho Lưu, và khi Lưu sẽ XÓA + GHI LẠI TOÀN BỘ student_schedules
//     của học sinh đó (xem saveEditClassActual()). Học sinh CHỈ thuộc Group Class (tạo qua
//     createStudentRecord() từ enrollment.js) KHÔNG có student_schedules — tái dùng flow đó ở đây
//     sẽ ép người dùng chọn 1 lịch dạy 1-1 KHÔNG có thật chỉ để lưu được tên/SĐT, và vô tình tạo
//     ra dữ liệu student_schedules sai. Đây là rủi ro phá dữ liệu ngoài phạm vi Group Class — theo
//     đúng "STOP và REPORT" (Phần 10 đề bài), STEP này KHÔNG wiring nút "Chỉnh sửa" vào flow đó và
//     KHÔNG xây flow edit mới. Section A hiển thị READ-ONLY.
//   - Notes/Progress theo Group Class: KHÔNG có cột nào trên students hay bảng riêng nào cho việc
//     này (audit xác nhận KHÔNG có students.notes) — Section E CHỈ là placeholder tĩnh, KHÔNG fake
//     data, KHÔNG tạo bảng/cột mới (student_group_notes bị CẤM tạo ở STEP này trừ khi audit chứng
//     minh cần — audit KHÔNG chứng minh cần).
//   - Payment history: Section F CHỈ là placeholder tĩnh trỏ tới STEP 11I (Billing), KHÔNG tạo
//     billing logic mới.
//   - Sửa generator/recurring schedule/Calendar/1-to-1 Lessons/1-to-1 Students/Billing/RLS/
//     migrations — KHÔNG đụng.
// ============================================================================

// ----------------------------------------------------------------------
// STATE (chỉ dùng trong module này — cùng convention gcAttendanceOpenSession của attendance.js).
// ----------------------------------------------------------------------
// Context của lần mở Detail GẦN NHẤT — null khi đang ở list view. LUÔN cả 2 field cùng lúc (Phần 8
// đề bài: KHÔNG được để cache của Student A/Group Class A hiển thị nhầm sang Student A/Group Class
// B, hay Student B/Group Class A).
var gcStudentDetailContext = null; // { groupClassId, studentId }

// Dữ liệu đã tải cho context hiện tại (null khi đang tải hoặc chưa có).
var gcStudentDetailData = null;

// Guard chống double-open khi người dùng bấm nhanh "Xem chi tiết" nhiều lần trên các card khác
// nhau trước khi query trước kịp trả về — cùng pattern các "InFlight" khác trong project, nhưng ở
// đây KHÔNG chặn hoàn toàn (mỗi lần bấm là 1 context mới hợp lệ), CHỈ dùng gcStudentDetailContext
// làm "request token": kết quả trả về của lần load CŨ sẽ tự bị bỏ qua nếu context đã đổi (xem
// loadGroupClassStudentDetailData()).

// ----------------------------------------------------------------------
// VIEW TOGGLE (list <-> detail, trong CÙNG panel #gc-tab-students — cùng pattern showAttendanceListView()/
// showAttendanceDetailView() của attendance.js)
// ----------------------------------------------------------------------
function showStudentListView() {
    var listView = document.getElementById('gc-students-list-view');
    var detailView = document.getElementById('gc-student-detail-view');
    if (listView) listView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';
    gcStudentDetailContext = null;
    gcStudentDetailData = null;
}

function showStudentDetailView() {
    var listView = document.getElementById('gc-students-list-view');
    var detailView = document.getElementById('gc-student-detail-view');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
}

// Gọi từ group-class.js (switchGroupClassTab, mục "STEP 11H-D") mỗi lần vào tab "Học viên" — LUÔN
// reset về danh sách, cùng lý do loadGroupClassAttendanceIfNeeded() (attendance.js) tự reset mỗi
// lần vào tab "Điểm danh".
function resetGroupClassStudentDetailView() {
    showStudentListView();
}

// ----------------------------------------------------------------------
// MỞ DETAIL — entry point gọi từ nút "Xem chi tiết" trên card học viên (enrollment.js)
// ----------------------------------------------------------------------
function openGroupClassStudentDetail(studentId) {
    if (!activeGroupClassId || !studentId) return;

    gcStudentDetailContext = { groupClassId: activeGroupClassId, studentId: studentId };
    gcStudentDetailData = null;
    showStudentDetailView();

    var headerEl = document.getElementById('gc-student-detail-header');
    if (headerEl) headerEl.innerText = '';
    var body = document.getElementById('gc-student-detail-body');
    if (body) {
        body.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px; font-size:14px;">⏳ Đang tải...</div>';
    }

    loadGroupClassStudentDetailData(gcStudentDetailContext);
}

function closeGroupClassStudentDetail() {
    showStudentListView();
}

// ----------------------------------------------------------------------
// LOAD — 3 query độc lập, KHÔNG N+1 (Phần 9 đề bài: Group Class tối đa 5 học sinh, KHÔNG cần tải
// toàn bộ students/lessons/payments hệ thống).
// ----------------------------------------------------------------------
async function loadGroupClassStudentDetailData(requestedContext) {
    var body = document.getElementById('gc-student-detail-body');

    try {
        // BƯỚC 1: student global (Section A) + enrollment ĐÚNG (group_class_id, student_id) —
        // (Section B). Chỉ chấp nhận enrollment status='active' (Phần 5: "chỉ enrollment ACTIVE
        // mới hợp lệ") — .maybeSingle() để 0 dòng khớp trả về null thay vì lỗi 406 (cùng convention
        // .maybeSingle() đã dùng ở nhiều nơi khác trong index.html).
        var enrResult = await supabaseClient
            .from('group_class_enrollments')
            .select('id, student_id, group_class_id, class_rate, status, joined_at, left_at, students(id, name, subject, parent_name, parent_phone)')
            .eq('group_class_id', requestedContext.groupClassId)
            .eq('student_id', requestedContext.studentId)
            .eq('status', 'active')
            .maybeSingle();

        // Guard context: nếu người dùng đã chuyển sang lớp/học sinh/tab khác trong lúc chờ query
        // này, BỎ QUA kết quả — KHÔNG ghi đè DOM của context đã đổi (Phần 8 đề bài).
        if (!isStillCurrentContext(requestedContext)) return;

        if (enrResult.error) {
            console.error('[GROUP CLASS STUDENT DETAIL] Tải thông tin học viên FAILED:', enrResult.error);
            if (body) body.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được thông tin học viên.<br>' + escapeHtml(describeSupabaseError(enrResult.error)) + '</div>';
            return;
        }

        if (!enrResult.data) {
            // Phần 5 đề bài: student không còn active-enrolled trong ĐÚNG lớp đang mở -> không mở
            // detail, báo rõ, có nút quay lại danh sách (KHÔNG tự động đóng ngay, tránh giật màn
            // hình nếu người dùng đang đọc thông báo).
            if (body) {
                body.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:30px; font-size:13px;">Học sinh không còn thuộc Group Class này.<br><br>' +
                    '<button type="button" class="btn-secondary" style="padding:7px 14px; font-size:12px;" onclick="closeGroupClassStudentDetail()">← Quay lại danh sách</button></div>';
            }
            return;
        }

        var enrollment = enrResult.data;
        var student = enrollment.students || {};

        // BƯỚC 2: group_sessions của ĐÚNG group_class_id đang mở (Section C) — KHÔNG lọc theo
        // student (group_sessions không có cột student_id, mỗi session thuộc cả lớp).
        var sessionsResult = await supabaseClient
            .from('group_sessions')
            .select('id, scheduled_date, start_time, duration, status, session_type')
            .eq('group_class_id', requestedContext.groupClassId)
            .order('scheduled_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (!isStillCurrentContext(requestedContext)) return;

        if (sessionsResult.error) {
            console.error('[GROUP CLASS STUDENT DETAIL] Tải lịch sử buổi học FAILED:', sessionsResult.error);
            if (body) body.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được lịch sử buổi học.<br>' + escapeHtml(describeSupabaseError(sessionsResult.error)) + '</div>';
            return;
        }

        var sessions = sessionsResult.data || [];

        // BƯỚC 3: attendance CỦA ĐÚNG student này, CHỈ trong các session vừa tải ở BƯỚC 2 (Section
        // D) — 1 query duy nhất bằng .in('session_id', ids), KHÔNG N+1 theo từng session.
        var attendanceBySessionId = {};
        if (sessions.length > 0) {
            var sessionIds = sessions.map(function(s) { return s.id; });
            var attResult = await supabaseClient
                .from('attendance')
                .select('session_id, status, notes')
                .eq('student_id', requestedContext.studentId)
                .in('session_id', sessionIds);

            if (!isStillCurrentContext(requestedContext)) return;

            if (attResult.error) {
                // Mục 22 (đúng convention attendance.js/session.js): lỗi tải attendance KHÔNG
                // chặn cả Section A/B/C — chỉ Section D hiển thị lỗi riêng.
                console.error('[GROUP CLASS STUDENT DETAIL] Tải điểm danh FAILED (không chặn các section khác):', attResult.error);
            } else {
                (attResult.data || []).forEach(function(row) {
                    attendanceBySessionId[row.session_id] = row;
                });
            }
        }

        gcStudentDetailData = {
            enrollment: enrollment,
            student: student,
            sessions: sessions,
            attendanceBySessionId: attendanceBySessionId
        };

        renderGroupClassStudentDetail(requestedContext);
    } catch (err) {
        if (!isStillCurrentContext(requestedContext)) return;
        console.error('[GROUP CLASS STUDENT DETAIL] Tải chi tiết học viên EXCEPTION:', err);
        if (body) body.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Lỗi không xác định khi tải chi tiết học viên.</div>';
    }
}

function isStillCurrentContext(ctx) {
    return gcStudentDetailContext
        && gcStudentDetailContext.groupClassId === ctx.groupClassId
        && gcStudentDetailContext.studentId === ctx.studentId;
}

// ----------------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------------
// Badge meta — ĐỊNH NGHĨA LẠI cục bộ (KHÔNG import từ session.js/attendance.js, module-local
// không export — cùng lý do "2 module độc lập" đã áp dụng giữa session.js/attendance.js), giữ
// ĐÚNG cùng nhãn/màu để nhất quán UI.
var _sdGroupSessionStatusMeta = {
    scheduled: { label: 'Đã lên lịch', color: '#38bdf8' },
    completed: { label: 'Đã hoàn thành', color: '#10b981' },
    cancelled: { label: 'Đã hủy', color: '#ef4444' }
};
var _sdGroupSessionTypeMeta = {
    regular: { label: '📘 Định kỳ', color: '#8b5cf6' },
    makeup: { label: '🔄 Học bù', color: '#f59e0b' }
};
var _sdAttendanceStatusMeta = {
    present: { label: 'Có mặt', color: '#10b981' },
    absent:  { label: 'Vắng',   color: '#ef4444' },
    excused: { label: 'Có phép', color: '#38bdf8' },
    late:    { label: 'Muộn',   color: '#f59e0b' }
};

function renderGroupClassStudentDetail(ctx) {
    if (!isStillCurrentContext(ctx) || !gcStudentDetailData) return;

    var data = gcStudentDetailData;
    var student = data.student;
    var enrollment = data.enrollment;
    var gc = (groupClassList || []).find(function(x) { return x.id === ctx.groupClassId; });
    var rateVnd = (Number(enrollment.class_rate) || 0) * 1000;

    // Header: giữ context Group Class hiện tại (Phần 3 đề bài, ví dụ header).
    var headerEl = document.getElementById('gc-student-detail-header');
    if (headerEl) headerEl.innerText = student.name || 'Học sinh';

    var body = document.getElementById('gc-student-detail-body');
    if (!body) return;

    var html = '';

    // ---- Dòng context ngay dưới nút back (Group Class + Học phí lớp — ví dụ mục Phần 3) ----
    html += '<div style="color:var(--text-sub); font-size:12.5px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border-color);">' +
        'Group Class: <strong style="color:var(--text-main);">' + escapeHtml(gc ? gc.name : '—') + '</strong>' +
        ' · Học phí lớp: <strong style="color:var(--text-main);">' + rateVnd.toLocaleString('vi-VN') + ' đ/buổi</strong>' +
        '</div>';

    // ---- A. THÔNG TIN HỌC SINH (read-only — xem lý do KHÔNG có nút "Chỉnh sửa" ở đầu file) ----
    html += '<div class="sp-section-title" style="margin-top:0;">🧑‍🎓 Thông tin học sinh</div>';
    html += '<div style="font-size:12.5px; color:var(--text-sub); line-height:1.9; margin-bottom:14px;">' +
        '<div>Họ tên: <strong style="color:var(--text-main);">' + escapeHtml(student.name || '—') + '</strong></div>' +
        '<div>Môn học: ' + escapeHtml(student.subject || '—') + '</div>' +
        '<div>Phụ huynh: ' + escapeHtml(student.parent_name || '—') + (student.parent_phone ? (' · ' + escapeHtml(student.parent_phone)) : '') + '</div>' +
        '</div>';

    // ---- B. THÔNG TIN TRONG GROUP CLASS ----
    html += '<div class="sp-section-title">📋 Trong Group Class này</div>';
    html += '<div style="font-size:12.5px; color:var(--text-sub); line-height:1.9; margin-bottom:14px;">' +
        '<div>Học phí lớp: <strong style="color:var(--text-main);">' + rateVnd.toLocaleString('vi-VN') + ' đ/buổi</strong></div>' +
        '<div>Vào lớp: ' + formatDate(enrollment.joined_at) + '</div>' +
        (enrollment.left_at ? ('<div>Rời lớp: ' + formatDate(enrollment.left_at) + '</div>') : '') +
        '<div>Trạng thái: ' + (enrollment.status === 'active' ? 'Đang học' : escapeHtml(enrollment.status || '—')) + '</div>' +
        '</div>';

    // ---- C. LỊCH SỬ BUỔI HỌC (group_sessions của group_class_id, KHÔNG lọc theo student vì
    // session không gắn 1 student cụ thể — chỉ hiển thị, KHÔNG sửa generator/recurring/Calendar) ----
    html += '<div class="sp-section-title">📅 Lịch sử buổi học</div>';
    if (data.sessions.length === 0) {
        html += '<div style="color:#9ca3af; font-size:12.5px; padding:6px 0; margin-bottom:14px;">Chưa có buổi học nào.</div>';
    } else {
        html += '<div style="margin-bottom:14px;">' + data.sessions.map(buildStudentSessionRowHtml).join('') + '</div>';
    }

    // ---- D. ATTENDANCE CỦA STUDENT (join attendance.student_id + session_id -> group_class_id,
    // KHÔNG đổi attendance CRUD đã có ở 11H-B) ----
    html += '<div class="sp-section-title">✅ Điểm danh trong lớp này</div>';
    html += buildStudentAttendanceSectionHtml(data.sessions, data.attendanceBySessionId);

    // ---- E. NOTES/PROGRESS — audit xác nhận KHÔNG có cột/bảng nào cho việc này -> placeholder,
    // KHÔNG fake data, KHÔNG tạo bảng mới (xem comment đầu file). ----
    html += '<div class="sp-section-title">📝 Ghi chú / Tiến độ</div>';
    html += '<div style="color:#9ca3af; font-size:12.5px; padding:6px 0; margin-bottom:14px;">Chưa có tính năng ghi chú/tiến độ riêng theo Group Class. (Ngoài phạm vi STEP này)</div>';

    // ---- F. HỌC PHÍ / THANH TOÁN — STEP 11I-I: render qua js/group-class/billing-payment.js
    // (module RIÊNG, KHÔNG nhét logic billing/payment vào student-detail.js — giữ đúng ranh giới
    // "hiển thị hồ sơ học viên" (module này) vs "billing/payment" (billing-payment.js), cùng
    // nguyên tắc tách module đã áp dụng cho billing-adapter.js/billing-calculator.js). Chỉ đặt
    // placeholder + data-attributes ở đây; load/render thật do loadGroupClassBillingSection() đảm
    // nhiệm (gọi ngay bên dưới, SAU khi placeholder đã có trong DOM).
    html += '<div class="sp-section-title">💳 Học phí</div>';
    html += '<div id="gc-billing-section" data-group-class-id="' + escapeHtml(ctx.groupClassId) + '" data-student-id="' + escapeHtml(ctx.studentId) + '">' +
        '<div style="color:var(--text-sub); font-size:12.5px; padding:6px 0;">⏳ Đang tải học phí...</div>' +
        '</div>';

    body.innerHTML = html;

    if (window.loadGroupClassBillingSection) {
        window.loadGroupClassBillingSection(ctx.groupClassId, ctx.studentId);
    }
}

function buildStudentSessionRowHtml(gs) {
    var d = new Date(gs.scheduled_date + 'T00:00:00');
    var shortDate = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    var timeStr = escapeHtml(String(gs.start_time || '').slice(0, 5));
    var typeMeta = _sdGroupSessionTypeMeta[gs.session_type] || _sdGroupSessionTypeMeta.regular;
    var statusMeta = _sdGroupSessionStatusMeta[gs.status] || _sdGroupSessionStatusMeta.scheduled;
    var badges = '<span class="sched-tag" style="background:rgba(0,0,0,0); color:' + typeMeta.color + '; border-color:' + typeMeta.color + '33;">' + escapeHtml(typeMeta.label) + '</span>' +
        '<span class="sched-tag" style="background:rgba(0,0,0,0); color:' + statusMeta.color + '; border-color:' + statusMeta.color + '33;">' + escapeHtml(statusMeta.label) + '</span>';

    return '<div style="padding:6px 0; border-top:1px solid var(--border-color); font-size:12.5px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
            '<div style="color:var(--text-main); font-weight:600;">' + escapeHtml(shortDate) + ' · ' + timeStr + ' · ' + Number(gs.duration) + 'p' + '</div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap;">' + badges + '</div>' +
        '</div>';
}

// Summary nhỏ (Có mặt/Vắng/Có phép/Muộn) + danh sách theo từng session — chỉ tính trên các session
// THỰC SỰ có attendance row (đúng dữ liệu đã điểm danh, KHÔNG suy diễn "chưa điểm danh" = "vắng").
function buildStudentAttendanceSectionHtml(sessions, attendanceBySessionId) {
    if (sessions.length === 0) {
        return '<div style="color:#9ca3af; font-size:12.5px; padding:6px 0;">Chưa có buổi học nào để điểm danh.</div>';
    }

    var counts = { present: 0, absent: 0, excused: 0, late: 0 };
    var markedCount = 0;
    sessions.forEach(function(s) {
        var att = attendanceBySessionId[s.id];
        if (att) {
            markedCount++;
            counts[att.status] = (counts[att.status] || 0) + 1;
        }
    });

    var summaryHtml = '<div style="display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--text-sub); padding:6px 0 8px;">' +
        '<span>Đã điểm danh: <b>' + markedCount + '</b>/' + sessions.length + '</span>' +
        '<span style="color:' + _sdAttendanceStatusMeta.present.color + ';">Có mặt: <b>' + counts.present + '</b></span>' +
        '<span style="color:' + _sdAttendanceStatusMeta.absent.color + ';">Vắng: <b>' + counts.absent + '</b></span>' +
        '<span style="color:' + _sdAttendanceStatusMeta.excused.color + ';">Có phép: <b>' + counts.excused + '</b></span>' +
        '<span style="color:' + _sdAttendanceStatusMeta.late.color + ';">Muộn: <b>' + counts.late + '</b></span>' +
        '</div>';

    var rowsHtml = sessions.map(function(s) {
        var d = new Date(s.scheduled_date + 'T00:00:00');
        var shortDate = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        var att = attendanceBySessionId[s.id];
        var statusHtml;
        if (s.status === 'cancelled') {
            statusHtml = '<span style="color:var(--text-sub);">Buổi đã hủy</span>';
        } else if (att) {
            var meta = _sdAttendanceStatusMeta[att.status] || _sdAttendanceStatusMeta.present;
            statusHtml = '<span style="color:' + meta.color + '; font-weight:600;">' + escapeHtml(meta.label) + '</span>';
        } else {
            statusHtml = '<span style="color:#9ca3af;">Chưa điểm danh</span>';
        }
        return '<div style="padding:5px 0; border-top:1px solid var(--border-color); font-size:12.5px; display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
                '<span style="color:var(--text-main);">' + escapeHtml(shortDate) + '</span>' +
                statusHtml +
            '</div>';
    }).join('');

    return summaryHtml + rowsHtml;
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention group-class.js/enrollment.js/session.js/
// attendance.js mục "HTML COMPATIBILITY") — chỉ export những entry point thực sự cần cho onclick
// trong HTML/enrollment.js hoặc để group-class.js gọi lại (resetGroupClassStudentDetailView).
// ============================================================================
export {
    resetGroupClassStudentDetailView, openGroupClassStudentDetail, closeGroupClassStudentDetail
};

window.resetGroupClassStudentDetailView = resetGroupClassStudentDetailView;
window.openGroupClassStudentDetail = openGroupClassStudentDetail;
window.closeGroupClassStudentDetail = closeGroupClassStudentDetail;
