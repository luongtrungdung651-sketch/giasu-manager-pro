// ============================================================================
// js/core/billing.js  —  STEP 8D: BILLING CORE EXTRACTION
// ============================================================================
// Đây là nơi DUY NHẤT trong toàn app chứa công thức billing (Expected/
// Collected/Outstanding). TRƯỚC STEP 8D, hàm này ("Finance Core V1") nằm
// trực tiếp trong <script> chính của index.html (khối "FINANCE DASHBOARD").
// STEP 8D CHỈ DI CHUYỂN VỊ TRÍ khai báo — KHÔNG đổi 1 dòng logic/công thức
// nào so với bản gốc (xem STEP_8D_REPORT.md mục C để đối chiếu).
//
// PURE FUNCTION: không query Supabase, không đụng DOM/UI state, không tự lọc
// theo ngày/kỳ, không mutate bất kỳ dữ liệu nào truyền vào — chỉ nhận
// `lessons`/`payments` ĐÃ ĐƯỢC LỌC ĐÚNG PHẠM VI (1 tháng / N ngày / custom
// range / all-time / payments.period tương ứng) từ phía gọi rồi tính toán
// thuần túy trên dữ liệu trong bộ nhớ. Finance Dashboard / Reports (Tutor) /
// Admin Reports / Admin Dashboard / Student Profile / Invoice đều gọi lại
// hàm này thay vì tự viết "rate × count" ở từng nơi.
//
// Business rule (giữ NGUYÊN như audit STEP 8D đã xác nhận — KHÔNG tự đổi):
//   - Expected = (số lesson có status 'completed' trong `lessons`) × rate
//     ('scheduled' và 'cancelled' KHÔNG được tính tiền, ở BẤT KỲ đâu trong app)
//   - Collected = tổng payments.amount có status 'paid' HOẶC 'partial' trong
//     `payments` ('pending' và 'cancelled' KHÔNG được cộng)
//   - Outstanding = Math.max(0, Expected - Collected) — clamp về 0, không âm
//
// Vì hàm không tự biết "kỳ" (period) là gì, việc đảm bảo không cộng nhầm
// payment sai kỳ (payments.period) là trách nhiệm của TẦNG GỌI (vd
// getPeriodPayments() ở index.html lọc đúng period trước khi truyền vào).
//
// ĐƠN VỊ (BUG-RISK — đọc kỹ trước khi gọi hàm này):
//   `rate` truyền vào PHẢI LÀ VNĐ ĐẦY ĐỦ / buổi (vd 200000), KHÔNG PHẢI
//   "nghìn đồng" như cột students.rate lưu trong DB (vd 200). Hàm này KHÔNG
//   tự nhân ×1000 — mọi giá trị "nghìn đồng" PHẢI được caller quy đổi
//   (`Number(student.rate) * 1000`) TRƯỚC khi gọi. Output (expected/
//   collected/outstanding) luôn là VNĐ đầy đủ — UI dùng formatter riêng
//   (fmt()/money()/toLocaleString()) để hiển thị, KHÔNG format ở đây.
//
// GROUP CLASS (mục 4 của yêu cầu STEP 8D — ĐỌC KỸ):
//   Model billing hiện tại là STUDENT-CENTRIC / 1-1 ORIENTED: 1 lesson → 1
//   student → 1 rate/học sinh (`rate` là 1 số duy nhất truyền vào, không có
//   khái niệm "lớp"/"nhiều học sinh chia sẻ 1 buổi"/"tách học phí theo buổi
//   nhóm"). STEP 8D KHÔNG sửa giả định này để hỗ trợ Group Class — Group
//   Class sẽ cần một billing model TƯỜNG MINH RIÊNG (class rate / per-class
//   rate / per-student class rate / split tuition / enrollment billing /
//   attendance billing), được THIẾT KẾ Ở BƯỚC SAU, không phải ở đây.
//
// KIẾN TRÚC / DEPENDENCY (mục 7-8 của yêu cầu STEP 8D):
//   Billing Core (file này) → KHÔNG import/đọc bất kỳ thứ gì từ Finance UI,
//   Reports UI, Calendar UI, Students UI, hay Supabase client. Ngược lại,
//   Finance/Reports/Students/Student Profile/Invoice đọc hàm này qua
//   window.computeBillingStats (biến/hàm global, giống cách state.js đã làm
//   ở STEP 8B) — không có phụ thuộc ngược Core → UI.
//
// ĐÂY LÀ CLASSIC SCRIPT (KHÔNG PHẢI type="module") — cùng lý do với
// js/core/state.js: các module type="module" (toast/utils/supabase/
// students/lessons/calendar) bị TRÌ HOÃN (defer) và chỉ chạy SAU KHI script
// chính (classic <script>) đã parse xong. Script chính gọi
// `__verifyComputeBillingStats()` NGAY LÚC PARSE (dev-verification, xem
// index.html khối "FINANCE CORE V1 — DEV VERIFICATION"), và hàm đó gọi
// computeBillingStats() ngay lập tức — nếu billing.js là module,
// computeBillingStats sẽ CHƯA TỒN TẠI tại thời điểm đó (đổi behavior, điều
// TUYỆT ĐỐI không được phép ở bước này). Do đó billing.js PHẢI là classic
// script và PHẢI được nạp TRƯỚC thẻ <script> chính trong index.html (đặt
// ngay sau js/core/state.js).
// ============================================================================

function computeBillingStats(lessons, payments, rate) {
    var safeLessons = lessons || [];
    var safePayments = payments || [];
    var safeRateVnd = Number(rate) || 0; // rate ở đây PHẢI đã là VNĐ đầy đủ/buổi, KHÔNG nhân thêm ×1000 nữa

    var completedLessons = safeLessons.filter(function(l) { return l.status === 'completed'; });
    var completedCount = completedLessons.length;
    var hours = completedLessons.reduce(function(sum, l) { return sum + (Number(l.duration) || 0); }, 0);

    var expected = completedCount * safeRateVnd;

    var collected = safePayments.reduce(function(sum, p) {
        if (p.status === 'paid' || p.status === 'partial') return sum + (Number(p.amount) || 0);
        return sum;
    }, 0);

    var remaining = Math.max(0, expected - collected);

    return {
        expected: expected,          // VNĐ đầy đủ
        taught: expected,            // alias — nhiều nơi trong code đọc "taught" thay vì "expected"
        collected: collected,        // VNĐ đầy đủ
        outstanding: remaining,      // VNĐ đầy đủ, đã clamp >= 0
        remaining: remaining,        // alias — nhiều nơi trong code đọc "remaining" thay vì "outstanding"
        lessonCount: safeLessons.length,   // tổng lesson truyền vào (mọi status)
        completedLessonCount: completedCount, // tên theo spec Finance Core V1
        completedCount: completedCount,    // alias — code cũ trong repo đọc "completedCount"
        hours: hours
    };
}

// Expose như global (classic script, không cần window. prefix để gán, nhưng
// gán tường minh qua window.* để nhất quán với state.js và để rõ ràng đây là
// API công khai của Billing Core, đúng pattern STEP 8B).
window.computeBillingStats = computeBillingStats;
