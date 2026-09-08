// ============================================================================
// js/group-class/billing-adapter.js  —  STEP 11I-B: BILLABLE ATTENDANCE ADAPTER
// ============================================================================
// Đây là ES module thật (cùng convention group-class.js/enrollment.js/session.js/
// schedule.js/generator.js/attendance.js/student-detail.js — xem comment trong index.html
// tại vị trí nạp module này). KHÔNG có onclick/onchange nào gọi hàm trong file này (CHƯA có
// Billing UI ở STEP này — xem "CRITICAL RULE" cuối file gốc STEP 11I-B) — hàm chính được expose
// qua window.getBillableAttendanceForPeriod() để BILLING UI TƯƠNG LAI gọi, và một hàm debug
// window.__debugBillableAttendance() để verify thủ công từ console (xem cuối file).
//
// DEPENDENCY: module này ĐỌC các global do js/core/supabase.js định nghĩa (supabaseClient).
// KHÔNG import group-class.js/enrollment.js/session.js/attendance.js/student-detail.js (module
// độc lập, chỉ data-access + normalization — PART 23 đề bài: "Billing Adapter chỉ data-
// access/normalization", "Không tạo dependency ngược: Billing Adapter → Attendance UI"). KHÔNG
// import js/core/billing.js (computeBillingStats không cần import gì để adapter gọi — script đó
// tự expose window.computeBillingStats; adapter này KHÔNG tự gọi computeBillingStats(), chỉ
// CHUẨN BỊ input — xem "KHÔNG TƯƠNG THÍCH" bên dưới).
//
// SCHEMA LIVE — SOURCE OF TRUTH (đã audit trực tiếp qua Supabase MCP trước khi viết file này):
//   public.group_class_enrollments: id, group_class_id, student_id, class_rate, status
//   (active|left), joined_at, left_at, created_at. CHECK: status='left' <=> left_at NOT NULL
//   (tức 'active' luôn có left_at NULL). class_rate lưu ĐƠN VỊ "nghìn đồng" giống students.rate
//   (KHÔNG phải VNĐ đầy đủ) — xem enrollment.js dòng `rateVnd = Number(en.class_rate) * 1000`,
//   adapter này áp dụng ĐÚNG quy ước đó khi trả rate ra ngoài (mục PART 8/17).
//   public.group_sessions: id, group_class_id, scheduled_date, start_time, duration, status
//   (scheduled|completed|cancelled), session_type (regular|makeup), notes, created_at.
//   public.attendance: id, session_id (FK group_sessions), student_id (FK students), status
//   (present|absent|excused|late), notes, marked_at, marked_by. UNIQUE(session_id, student_id).
//   Enrollment validity tại 1 ngày được trigger check_attendance_enrollment() enforce ở DB với
//   điều kiện: joined_at <= scheduled_date AND (left_at IS NULL OR left_at >= scheduled_date) —
//   adapter PHẢI dùng ĐÚNG điều kiện này khi resolve enrollment (PART 7), KHÔNG tự suy diễn khác.
//
// STEP 11I-B PART 1 (migration, ĐÃ APPLY riêng qua Supabase MCP, KHÔNG phải trong file JS này):
//   EXCLUDE constraint group_class_enrollments_no_date_overlap trên
//   (group_class_id, student_id, daterange(joined_at, left_at, '[]')) — chặn 2 enrollment cùng
//   student/cùng class có date range chồng nhau ở TẦNG DATABASE (mọi client đều bị chặn, không
//   chỉ riêng app này). Nhờ constraint này, PART 7 dưới đây có thể tin tưởng: mỗi (student_id,
//   group_class_id, scheduled_date) resolve tối đa MỘT enrollment — nếu query trả về >1, đó là
//   DATA INTEGRITY BUG (dữ liệu cũ từ trước khi có constraint, hoặc constraint bị bypass), KHÔNG
//   được tự chọn 1 bản ghi bằng ORDER BY/LIMIT — adapter throw Error ngay (xem
//   resolveEnrollmentForDate() bên dưới).
//
// PHẠM VI STEP 11I-B (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN — xem "CRITICAL RULE" trong đề bài):
//   1. getBillableAttendanceForPeriod(groupClassId, studentId, periodStart, periodEnd) — READ-
//      ONLY, trả về mảng "lessons-shaped records" đã billable-filtered (PART 6/9).
//   2. window.__debugBillableAttendance(...) — dev-only console helper để verify kết quả (PART
//      20), KHÔNG mutate finance data, KHÔNG có UI, dễ xoá (chỉ 1 hàm trong file này).
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (để dành cho step sau — KHÔNG code ở đây dù chỉ 1 dòng):
//   - Billing UI / Payment UI / Invoice UI.
//   - Sửa computeBillingStats() / Payments schema / Invoice.
//   - Tự động gọi computeBillingStats() từ adapter này (xem "KHÔNG TƯƠNG THÍCH" — PART 10 cấm
//     sửa Billing Core để "ép" chạy, và adapter KHÔNG được tự bịa cách normalize thêm để né vấn
//     đề — phải để nguyên field thật, báo cáo mismatch, dừng ở đó).
//   - 1-to-1 Lessons/Students/attendance/billing — module này KHÔNG đụng, KHÔNG đọc bảng
//     `lessons`, KHÔNG đọc students.rate.
//
// ============================================================================
// KHÔNG TƯƠNG THÍCH VỚI computeBillingStats() HIỆN TẠI — ĐỌC KỸ TRƯỚC KHI DÙNG (PART 10):
// ============================================================================
//   computeBillingStats(lessons, payments, rate) (js/core/billing.js) có 2 giả định KHÔNG khớp
//   với billable rule của Group Class:
//
//   (a) LỌC THEO status === 'completed': hàm đếm expected = (lessons có status 'completed')
//       × rate. Nhưng PART 6 đề bài: một GROUP SESSION có status = 'scheduled' VẪN billable nếu
//       attendance = present/late (session chưa bị đổi status thành 'completed' nhưng đã điểm
//       danh). Nếu feed thẳng field `status` (giá trị thật = session.status, vd 'scheduled') vào
//       computeBillingStats() như hiện tại, các record 'scheduled' billable này SẼ BỊ LOẠI KHỎI
//       expected (undercount) vì hàm chỉ nhận đúng chuỗi 'completed'.
//
//   (b) MỘT `rate` SCALAR DUY NHẤT CHO CẢ BATCH: computeBillingStats() nhận `rate` là 1 số áp
//       dụng cho TOÀN BỘ completedLessons trong lần gọi (expected = completedCount × rate). Nhưng
//       PART 8/17 đề bài yêu cầu rate PER-RECORD (lấy từ enrollment có hiệu lực tại đúng
//       scheduled_date của từng session) — nếu 1 student có 2 enrollment với class_rate khác
//       nhau trong CÙNG 1 period (vd đổi học phí giữa kỳ), các billable record trong period đó
//       sẽ có `class_rate` KHÁC NHAU giữa các phần tử của mảng trả về. Không có cách nào truyền
//       "nhiều rate" qua 1 tham số `rate` scalar của computeBillingStats() hiện tại.
//
//   => Adapter này CHỦ Ý KHÔNG tự gọi computeBillingStats() và KHÔNG tự "ép" dữ liệu cho khớp
//      (vd không tự đổi status thành 'completed', không tự gộp rate thành 1 số trung bình).
//      output giữ NGUYÊN status thật (session.status) + attendance_status riêng + class_rate
//      riêng từng record, ĐÚNG shape PART 9 yêu cầu. Billing UI ở STEP SAU sẽ cần một hàm tổng
//      hợp RIÊNG cho Group Class (nhận per-record rate, coi 'scheduled'+present/late là billable)
//      — KHÔNG phải sửa computeBillingStats() hiện tại (hàm đó tiếp tục là single source of
//      truth CHO 1-to-1, giữ nguyên 100% như PART 22 yêu cầu).
// ============================================================================

// ----------------------------------------------------------------------
// PART 7 — Resolve ĐÚNG MỘT enrollment có hiệu lực tại 1 ngày, từ danh sách enrollment của
// (group_class_id, student_id) đã load sẵn (KHÔNG query lại DB mỗi lần gọi — PART 11: tránh
// N+1). Nếu resolve ra 0 hoặc >1 enrollment, đây là lỗi logic/integrity — KHÔNG tự chọn.
// ----------------------------------------------------------------------
function resolveEnrollmentForDate(enrollments, scheduledDate) {
    var matches = enrollments.filter(function(e) {
        return e.joined_at <= scheduledDate && (e.left_at === null || e.left_at >= scheduledDate);
    });
    if (matches.length === 0) {
        throw new Error(
            'DATA INTEGRITY: không tìm thấy enrollment hợp lệ tại ngày ' + scheduledDate +
            ' — có attendance record nhưng enrollment không (còn) khớp. Không tự tạo enrollment giả.'
        );
    }
    if (matches.length > 1) {
        throw new Error(
            'DATA INTEGRITY: có ' + matches.length + ' enrollment cùng khớp ngày ' + scheduledDate +
            ' (group_class_enrollments overlap) — không được tự chọn 1 bản ghi. Kiểm tra lại ' +
            'constraint group_class_enrollments_no_date_overlap và dữ liệu cũ trước STEP 11I-B.'
        );
    }
    return matches[0];
}

// ----------------------------------------------------------------------
// PART 5 — Validate input trước khi query. Ném Error rõ ràng (caller quyết định hiển thị/log).
// ----------------------------------------------------------------------
function validatePeriod(periodStart, periodEnd) {
    var isoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!periodStart || !isoRe.test(periodStart)) {
        throw new Error('periodStart không hợp lệ (yêu cầu định dạng YYYY-MM-DD): ' + periodStart);
    }
    if (!periodEnd || !isoRe.test(periodEnd)) {
        throw new Error('periodEnd không hợp lệ (yêu cầu định dạng YYYY-MM-DD): ' + periodEnd);
    }
    if (periodStart > periodEnd) {
        throw new Error('periodStart (' + periodStart + ') phải <= periodEnd (' + periodEnd + ')');
    }
}

// ----------------------------------------------------------------------
// getBillableAttendanceForPeriod() — PART 4-9, 11-19.
//
// Output: Promise<Array<{
//   id,                 // attendance.id — record billing tối thiểu duy nhất theo (session,student)
//   student_id,
//   scheduled_date,     // group_sessions.scheduled_date (period boundary lọc theo field này, inclusive 2 đầu — PART 15)
//   start_time,         // group_sessions.start_time
//   duration,           // group_sessions.duration
//   status,             // group_sessions.status THẬT (scheduled/completed) — cancelled ĐÃ bị loại (PART 12), giữ nguyên, KHÔNG ép thành 'completed'
//   session_type,       // group_sessions.session_type (regular/makeup)
//   attendance_status,  // attendance.status (present/late — absent/excused đã bị loại, PART 6)
//   class_rate          // VNĐ ĐẦY ĐỦ/buổi, đã ×1000 từ enrollment.class_rate ("nghìn đồng") — PART 8, resolve theo scheduled_date
// }>>
//
// CHỈ trả billable records (PART 6/13) — KHÔNG trả absent/excused, KHÔNG trả session cancelled,
// KHÔNG tự tạo record cho session thiếu attendance.
// ----------------------------------------------------------------------
async function getBillableAttendanceForPeriod(groupClassId, studentId, periodStart, periodEnd) {
    if (!groupClassId) throw new Error('groupClassId là bắt buộc');
    if (!studentId) throw new Error('studentId là bắt buộc');
    validatePeriod(periodStart, periodEnd);

    // PART 5 — groupClassId/studentId phải tồn tại (và RLS tự giới hạn về đúng tutor sở hữu —
    // PART 21: không dùng service_role, dùng đúng supabaseClient đã authenticate như mọi module
    // khác trong app; nếu group_class/student thuộc tutor khác, RLS khiến query trả 0 hàng ->
    // coi như "không tồn tại" từ góc nhìn của caller hiện tại, ĐÚNG hành vi cross-tutor protection
    // hiện có, KHÔNG sửa RLS ở STEP này).
    var gcCheck = await supabaseClient.from('group_classes').select('id').eq('id', groupClassId).maybeSingle();
    if (gcCheck.error) throw new Error('Không kiểm tra được group_class_id: ' + gcCheck.error.message);
    if (!gcCheck.data) throw new Error('groupClassId không tồn tại (hoặc không thuộc quyền truy cập hiện tại): ' + groupClassId);

    var stCheck = await supabaseClient.from('students').select('id').eq('id', studentId).maybeSingle();
    if (stCheck.error) throw new Error('Không kiểm tra được studentId: ' + stCheck.error.message);
    if (!stCheck.data) throw new Error('studentId không tồn tại (hoặc không thuộc quyền truy cập hiện tại): ' + studentId);

    // PART 11 — Query SCOPED (groupClassId + studentId + period), KHÔNG tải toàn bộ attendance/
    // group_sessions/students. Một query duy nhất qua nested select (PostgREST embedded filter
    // với !inner để lọc theo cột của bảng group_sessions ngay trong cùng request — tránh N+1),
    // đã lọc sẵn attendance.status IN (present, late) (PART 6) và group_sessions.status !=
    // cancelled (PART 12) ngay tại DB, KHÔNG lọc lại ở client bằng JS sau khi tải thừa.
    var attResult = await supabaseClient
        .from('attendance')
        .select('id, session_id, status, group_sessions!inner(id, group_class_id, scheduled_date, start_time, duration, status, session_type)')
        .eq('student_id', studentId)
        .eq('group_sessions.group_class_id', groupClassId)
        .gte('group_sessions.scheduled_date', periodStart)
        .lte('group_sessions.scheduled_date', periodEnd)
        .neq('group_sessions.status', 'cancelled')
        .in('status', ['present', 'late']);

    if (attResult.error) throw new Error('Query attendance thất bại: ' + attResult.error.message);
    var attRows = attResult.data || [];

    // PART 14 — Duplicate safety: (session_id, student_id) đã UNIQUE ở DB, nhưng vẫn tự kiểm tra
    // lại ở tầng adapter thay vì tin tưởng ngầm — nếu phát hiện trùng, throw (KHÔNG new Map() để
    // âm thầm dedupe che data integrity issue, đúng PART 14).
    var seenSessionIds = {};
    attRows.forEach(function(row) {
        if (seenSessionIds[row.session_id]) {
            throw new Error('DATA INTEGRITY: duplicate attendance cho session_id ' + row.session_id + ' + student_id ' + studentId);
        }
        seenSessionIds[row.session_id] = true;
    });

    if (attRows.length === 0) return [];

    // PART 7/8 — Load TOÀN BỘ enrollment của (groupClassId, studentId) — KHÔNG lọc theo period
    // (một enrollment có thể bắt đầu trước periodStart và vẫn là enrollment hiệu lực cho các
    // session trong period) — nhưng đây LÀ scoped theo đúng 1 class + 1 student (không phải toàn
    // bộ bảng), số hàng luôn nhỏ (thực tế: rất hiếm quá vài enrollment/student/class).
    var enrResult = await supabaseClient
        .from('group_class_enrollments')
        .select('id, joined_at, left_at, class_rate')
        .eq('group_class_id', groupClassId)
        .eq('student_id', studentId);

    if (enrResult.error) throw new Error('Query group_class_enrollments thất bại: ' + enrResult.error.message);
    var enrollments = enrResult.data || [];

    // Chuẩn hoá record — PART 9 output shape, PART 8 rate resolution (resolve theo scheduled_date
    // của TỪNG session, KHÔNG dùng current/latest enrollment — PART 17 historical rate test).
    return attRows.map(function(row) {
        var session = row.group_sessions;
        var enrollment = resolveEnrollmentForDate(enrollments, session.scheduled_date);
        return {
            id: row.id,
            student_id: studentId,
            scheduled_date: session.scheduled_date,
            start_time: session.start_time,
            duration: session.duration,
            status: session.status,
            session_type: session.session_type,
            attendance_status: row.status,
            class_rate: (Number(enrollment.class_rate) || 0) * 1000
        };
    });
}

// ----------------------------------------------------------------------
// PART 20 — Debug/validation output. Dev-only, gọi thủ công từ browser console (KHÔNG có nút/UI
// nào gọi hàm này). In ra console một bảng gọn (date/student/attendance/rate/session_type) đúng
// PART 20 yêu cầu — KHÔNG ghi payment/invoice, KHÔNG mutate gì. Dễ xoá: chỉ cần xoá hàm này +
// dòng window.__debugBillableAttendance ở cuối file, không ảnh hưởng getBillableAttendanceForPeriod().
// ----------------------------------------------------------------------
async function debugBillableAttendance(groupClassId, studentId, periodStart, periodEnd) {
    try {
        var records = await getBillableAttendanceForPeriod(groupClassId, studentId, periodStart, periodEnd);
        console.table(records.map(function(r) {
            return {
                date: r.scheduled_date,
                attendance: r.attendance_status,
                session_status: r.status,
                session_type: r.session_type,
                class_rate_vnd: r.class_rate
            };
        }));
        console.log('[BILLING ADAPTER DEBUG] ' + records.length + ' billable record(s). Raw:', records);
        return records;
    } catch (err) {
        console.error('[BILLING ADAPTER DEBUG] Lỗi:', err);
        throw err;
    }
}

// ----------------------------------------------------------------------
// EXPOSE — classic window.* pattern giống mọi module Group Class khác (STEP 8B trở đi).
// ----------------------------------------------------------------------
window.getBillableAttendanceForPeriod = getBillableAttendanceForPeriod;
window.__debugBillableAttendance = debugBillableAttendance;
