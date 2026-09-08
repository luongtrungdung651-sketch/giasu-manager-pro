// ============================================================================
// js/group-class/billing-calculator.js  —  STEP 11I-D: GROUP CLASS BILLING CALCULATION ADAPTER
// ============================================================================
// Đây là ES module thật (cùng convention billing-adapter.js/group-class.js/enrollment.js/
// session.js/schedule.js/generator.js/attendance.js/student-detail.js). KHÔNG có onclick/onchange
// nào gọi hàm trong file này (CHƯA có Billing UI ở STEP này). Hàm chính được expose qua
// window.calculateGroupClassBilling() + window.calculateGroupClassTotal() để BILLING UI TƯƠNG LAI
// gọi.
//
// DEPENDENCY: module này CHỈ gọi window.getBillableAttendanceForPeriod() (đã có từ STEP 11I-B,
// PASS validation ở STEP 11I-C) — KHÔNG tự viết lại billable-attendance query (đề bài PHASE 3:
// "Do not duplicate the billable attendance query"), KHÔNG tự query Supabase trực tiếp trong file
// này (0 lời gọi supabaseClient — toàn bộ data access đã nằm trong billing-adapter.js), KHÔNG
// import billing-adapter.js/group-class.js/enrollment.js/session.js/attendance.js/student-
// detail.js (đọc qua window.*, cùng lý do các module Group Class khác không phụ thuộc lẫn nhau).
// KHÔNG import js/core/billing.js và KHÔNG tự gọi computeBillingStats() (xem "PHẦN 1 — AUDIT" bên
// dưới — lý do KHÔNG tương thích đã được xác nhận lại ở STEP 11I-C, KHÔNG sửa ở step này).
//
// ============================================================================
// PHẦN 1 — AUDIT BILLING SEMANTICS HIỆN CÓ (ĐỌC TRƯỚC KHI DÙNG FILE NÀY)
// ============================================================================
// (a) computeBillingStats(lessons, payments, rate) (js/core/billing.js) — dùng CHO 1-TO-1:
//     expected = (lessons có status 'completed') × MỘT rate scalar duy nhất. Giả định: 1 lesson
//     → 1 học sinh → 1 rate cố định cho CẢ batch, KHÔNG có khái niệm rate lịch sử/per-record.
//     STEP 11I-C đã xác nhận lại: 2 giả định này (completed-only, rate scalar) KHÔNG áp dụng cho
//     Group Class → file này (billing-calculator.js) KHÔNG gọi computeBillingStats(), KHÔNG import
//     js/core/billing.js, và KHÔNG sửa file đó (đúng yêu cầu STEP 11I-D "modify computeBillingStats()
//     unless a genuine architectural blocker is discovered" — KHÔNG có blocker nào phát sinh ở step
//     này, giữ nguyên 100%).
//
// (b) students.rate — CHỈ dùng cho billing 1-to-1 (Lessons). Học phí lưu "nghìn đồng/buổi"
//     (label "Học phí/buổi (nghìn đồng)", index.html dòng ~455/821/9356/9948), quy đổi VNĐ đầy đủ
//     bằng ×1000 ở phía UI trước khi truyền vào computeBillingStats(). File này KHÔNG đọc
//     students.rate (Group Class billing dùng group_class_enrollments.class_rate riêng — đã đúng
//     từ STEP 11I-B, giữ nguyên).
//
// (c) group_class_enrollments.class_rate — QUYẾT ĐỊNH NGHIỆP VỤ (đề bài yêu cầu xác định TRƯỚC
//     KHI code, KHÔNG được đoán theo tên biến):
//
//     BẰNG CHỨNG THU THẬP ĐƯỢC (schema + UI + code hiện có, KHÔNG suy diễn từ tên cột):
//       1. Cột DB: group_class_enrollments.class_rate kiểu numeric (không CHECK ràng buộc đơn vị
//          thời gian nào — không có cột "period"/"billing_cycle" nào khác đi kèm).
//       2. UI nhập liệu (index.html dòng 1272 + 1309 + 2416, EM y hệt convention students.rate):
//          nhãn CHÍNH XÁC là "Học phí lớp nhóm (nghìn đồng/buổi)" — "buổi" = "session/lesson" —
//          KHÔNG có bất kỳ nhãn nào ghi "/tháng" (per month) hay "/gói" (package) gắn với
//          class_rate ở BẤT KỲ đâu trong toàn bộ index.html.
//       3. UI hiển thị (enrollment.js dòng 182): "Học phí lớp: X đ/buổi" — record theo TỪNG buổi,
//          KHÔNG phải một khoản cố định theo tháng/kỳ.
//       4. Convention nhất quán toàn app: cột rate tương tự (students.rate) đã có comment tường
//          minh (index.html dòng ~5434-5436): "Học phí là GIÁ CỐ ĐỊNH THEO BUỔI (nhãn 'Học phí/buổi
//          (nghìn đồng)'), KHÔNG phải theo giờ — nên tiền mỗi buổi hoàn thành = rate × 1.000, không
//          nhân thêm số giờ/buổi. Số giờ chỉ hiển thị để tham khảo". group_class_enrollments.
//          class_rate dùng ĐÚNG format cột/nhãn/quy đổi ×1000 giống hệt students.rate (xem
//          enrollment.js dòng 161 + billing-adapter.js PART 8) — không có bất kỳ dấu hiệu nào cho
//          thấy class_rate lệch khỏi convention "per-session fixed price" đã xác lập.
//       5. Không tìm thấy bất kỳ trường "monthly_fee"/"package_id"/"billing_cycle" nào trong schema
//          group_class_enrollments hay group_classes — không có cấu trúc dữ liệu nào hỗ trợ "gói"/
//          "tháng" cho Group Class billing.
//
//     KẾT LUẬN: class_rate = (A) PER-SESSION TUITION — số tiền cố định cho MỖI buổi học billable,
//     KHÔNG phải hourly/monthly/package. KHÔNG có ambiguity — bằng chứng nhất quán, đầy đủ, không
//     cần STOP để hỏi thêm quyết định nghiệp vụ.
//
// (d) group_sessions.duration — CHỈ dùng để hiển thị tham khảo (tổng số giờ đã dạy), KHÔNG dùng để
//     tính tiền (đúng convention 1-to-1 đã audit ở mục (c).4). File này giữ nguyên `duration` trong
//     output record (đề bài PHASE "FUTURE INVOICE READINESS" + "OUTPUT" yêu cầu record đầy đủ) NHƯNG
//     TUYỆT ĐỐI KHÔNG nhân duration vào amount — amount = class_rate, KHÔNG hơn.
//
// (e) attendance.status — 'present'/'late' đã billable-filtered SẴN bởi getBillableAttendanceForPeriod()
//     (STEP 11I-B/C) — file này KHÔNG lọc lại theo attendance_status (mọi record trả về từ
//     getBillableAttendanceForPeriod() ĐÃ LÀ billable), chỉ dùng attendance_status để đếm
//     presentCount/lateCount (PHASE "ATTENDANCE TEST").
//
// (f) payment schema / invoice generation logic — ĐÃ audit ở STEP 11I-C mục 7 (Billing Core
//     Compatibility): computeBillingStats() không tương thích, KHÔNG sửa. File này KHÔNG tạo
//     payment/invoice record (đề bài "DO NOT create payment records" / "DO NOT generate invoice
//     objects yet") — chỉ trả về records có đủ field cho một lớp invoice/payment TƯƠNG LAI dùng.
// ============================================================================

// ----------------------------------------------------------------------
// calculateGroupClassBilling({ groupClassId, studentId, periodStart, periodEnd })
//
// Gọi window.getBillableAttendanceForPeriod() (STEP 11I-B, KHÔNG tự viết lại query) rồi tính toán
// THUẦN TÚY trên kết quả (không query Supabase gì thêm trong hàm này).
//
// CÔNG THỨC (PHASE "CALCULATION" đề bài):
//   Với MỖI billable record: amount = class_rate (KHÔNG nhân duration, KHÔNG áp dụng multiplier
//   cho makeup — xem mục (c)/(d)/MAKEUP audit ở trên).
//   totalAmount = SUM(record.amount)
//
// class_rate ĐÃ được resolve theo ĐÚNG enrollment lịch sử của TỪNG session (STEP 11I-B PART 8) —
// hàm này KHÔNG re-resolve, KHÔNG query lại group_class_enrollments, KHÔNG dùng rate hiện tại áp
// dụng ngược cho session cũ (đề bài "IMPORTANT RATE RULE").
//
// Output: Promise<{
//   groupClassId, studentId, periodStart, periodEnd,
//   billableSessionCount,   // records.length
//   presentCount,           // số record có attendance_status === 'present'
//   lateCount,              // số record có attendance_status === 'late'
//   totalAmount,            // SUM(class_rate), giữ NGUYÊN giá trị VNĐ đầy đủ, KHÔNG làm tròn thêm
//   records: Array<{
//     id, scheduled_date, start_time, duration, session_type, attendance_status,
//     class_rate,   // VNĐ đầy đủ/buổi (đã ×1000 từ STEP 11I-B, giữ nguyên KHÔNG đổi lại)
//     amount        // === class_rate, tách riêng field để lớp invoice/payment sau này không phải
//                    // đọc lại class_rate và tự suy ra amount (PHASE "FUTURE INVOICE READINESS")
//   }>
// }>
//
// KHÔNG mutate DB (KHÔNG insert/update attendance/sessions/enrollments/payments, KHÔNG tạo
// invoice) — pure read + in-memory calculation, đúng PHASE "DATA INTEGRITY".
// ----------------------------------------------------------------------
async function calculateGroupClassBilling(params) {
    var groupClassId = params && params.groupClassId;
    var studentId = params && params.studentId;
    var periodStart = params && params.periodStart;
    var periodEnd = params && params.periodEnd;

    if (!groupClassId) throw new Error('groupClassId là bắt buộc');
    if (!studentId) throw new Error('studentId là bắt buộc');

    // KHÔNG tự validate lại format periodStart/periodEnd ở đây — getBillableAttendanceForPeriod()
    // (STEP 11I-B) đã validate (validatePeriod()) và throw Error rõ ràng nếu sai, tránh duplicate
    // logic validation giữa 2 lớp adapter.
    var billableRecords = await window.getBillableAttendanceForPeriod(groupClassId, studentId, periodStart, periodEnd);

    var presentCount = 0;
    var lateCount = 0;

    var records = billableRecords.map(function(r) {
        // class_rate từ STEP 11I-B ĐÃ LÀ VNĐ đầy đủ (Number, đã ×1000) — KHÔNG Number() lại từ
        // string để tránh nguy cơ mất chính xác nếu giá trị thay đổi kiểu; KHÔNG round().
        var amount = r.class_rate;

        if (r.attendance_status === 'present') presentCount++;
        else if (r.attendance_status === 'late') lateCount++;

        return {
            id: r.id,
            scheduled_date: r.scheduled_date,
            start_time: r.start_time,
            duration: r.duration,
            session_type: r.session_type,
            attendance_status: r.attendance_status,
            class_rate: r.class_rate,
            amount: amount // amount === class_rate, đúng PHASE "CALCULATION" (bản này chưa có multiplier nào)
        };
    });

    return {
        groupClassId: groupClassId,
        studentId: studentId,
        periodStart: periodStart,
        periodEnd: periodEnd,
        billableSessionCount: records.length,
        presentCount: presentCount,
        lateCount: lateCount,
        totalAmount: calculateGroupClassTotal(records),
        records: records
    };
}

// ----------------------------------------------------------------------
// calculateGroupClassTotal(records) — PURE HELPER (PHASE "GROUP CLASS TOTAL" đề bài):
//   KHÔNG query Supabase, KHÔNG mutate gì, KHÔNG hidden state — chỉ SUM(record.amount).
//   Nhận vào mảng record đã có field `amount` (từ calculateGroupClassBilling() ở trên, hoặc từ
//   bất kỳ nguồn nào khác có cùng shape — hàm này không phụ thuộc vào billing-adapter.js).
// ----------------------------------------------------------------------
function calculateGroupClassTotal(records) {
    var safeRecords = records || [];
    return safeRecords.reduce(function(sum, r) {
        return sum + (Number(r.amount) || 0);
    }, 0);
}

// ----------------------------------------------------------------------
// EXPOSE — classic window.* pattern giống billing-adapter.js/mọi module Group Class khác.
// ----------------------------------------------------------------------
window.calculateGroupClassBilling = calculateGroupClassBilling;
window.calculateGroupClassTotal = calculateGroupClassTotal;
