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
// Business rule (STEP 9A — Expected nay tính từ lessons.rate snapshot, xem khối
// comment ngay phía trên computeBillingStats() để biết đầy đủ lý do; các quy tắc
// khác GIỮ NGUYÊN như audit STEP 8D):
//   - Expected = TỔNG `lesson.rate` (VNĐ, đã là snapshot) của các lesson có status
//     'completed' trong `lessons` ('scheduled' và 'cancelled' KHÔNG được tính tiền,
//     ở BẤT KỲ đâu trong app)
//   - Collected = tổng payments.amount có status 'paid' HOẶC 'partial' trong
//     `payments` ('pending' và 'cancelled' KHÔNG được cộng)
//   - Outstanding = Math.max(0, Expected - Collected) — clamp về 0, không âm
//
// Vì hàm không tự biết "kỳ" (period) là gì, việc đảm bảo không cộng nhầm
// payment sai kỳ (payments.period) là trách nhiệm của TẦNG GỌI (vd
// getPeriodPayments() ở index.html lọc đúng period trước khi truyền vào).
//
// ĐƠN VỊ (STEP 9A — ĐỌC KỸ, đã đổi so với trước):
//   `lessons[i].rate` (field thật trên từng lesson truyền vào qua tham số
//   `lessons`) PHẢI LÀ VNĐ ĐẦY ĐỦ/buổi (vd 200000) — đúng như cách createLesson()
//   (js/lessons/lessons.js) đã INSERT (đã ×1000 từ students.rate/online_rate/
//   offline_rate MỘT LẦN DUY NHẤT lúc tạo lesson). Hàm này KHÔNG nhân ×1000 nữa
//   với lesson.rate. Tham số thứ 3 (`legacyRate`, trước đây tên là `rate`) KHÔNG
//   còn được dùng để tính expected — xem chi tiết compatibility ở khối comment
//   ngay trên computeBillingStats(). Output (expected/collected/outstanding) luôn
//   là VNĐ đầy đủ — UI dùng formatter riêng (fmt()/money()/toLocaleString()) để
//   hiển thị, KHÔNG format ở đây.
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

// ============================================================================
// STEP 9A — FIX: EXPECTED PHẢI DÙNG lessons.rate (HISTORICAL SNAPSHOT), KHÔNG DÙNG
// students.rate HIỆN TẠI NỮA
// ============================================================================
// STEP 8 đã phát hiện root cause: bản cũ của hàm này nhận `rate` là 1 SCALAR DUY
// NHẤT (quy đổi từ students.rate/online_rate/offline_rate HIỆN TẠI ở phía caller)
// rồi tính `expected = completedCount * rate` — nghĩa là MỌI lesson completed
// trong `lessons` (kể cả lesson cũ từ nhiều tháng trước, đã có sẵn `lessons.rate`
// snapshot đúng từ lúc tạo — xem STEP 6B/7) đều bị tính lại theo rate HIỆN TẠI của
// student. Nếu tutor đổi students.rate/online_rate/offline_rate sau này, Expected
// của các lesson cũ bị đổi theo — SAI, vì lessons.rate vốn đã là snapshot VNĐ tại
// thời điểm lesson được tạo (không đổi theo pricing hiện tại của student nữa) và
// cũng không phân biệt được lesson nào được tạo với online_rate, lesson nào với
// offline_rate (mỗi lesson tự mang đúng `rate` của mode lúc đó rồi, xem
// createLesson() trong js/lessons/lessons.js).
//
// FIX (STEP 9A): Expected = TỔNG `Number(lesson.rate) || 0` của TỪNG lesson có
// `status === 'completed'` trong `lessons` — không còn nhân completedCount với 1
// scalar rate nào nữa. `lessons.rate` ĐÃ LÀ VNĐ đầy đủ (không phải "nghìn đồng" như
// students.rate) — do đó KHÔNG nhân ×1000 ở đây (khác hẳn scalar `rate` cũ, vốn bắt
// buộc caller phải tự ×1000 trước khi truyền vào). Hàm KHÔNG đọc students.rate/
// online_rate/offline_rate/teaching_mode ở bất kỳ đâu — mọi field đó đã được
// "chốt" thành đúng 1 con số duy nhất ngay trên `lesson.rate` từ lúc INSERT.
//
// COMPATIBILITY (Phần 3 STEP 9A — KHÔNG sửa caller ở bước này): tham số thứ 3
// `legacyRate` được GIỮ LẠI trong signature để không làm vỡ ~20 call site hiện có
// trong app.js/students.js đang gọi `computeBillingStats(lessons, payments, rate)`
// — nhận vào bình thường (không throw nếu thiếu) nhưng TUYỆT ĐỐI KHÔNG được dùng
// để tính `expected` nữa (xem Phần 2 đề bài). Các caller này SẼ vẫn còn bug đã nêu
// ở STEP 8 audit (vì bản thân họ đang tự tính/truyền `student.rate*1000`) — sửa
// caller nằm NGOÀI phạm vi STEP 9A (chỉ được phép sửa billing.js), cần 1 step sau.
function computeBillingStats(lessons, payments, legacyRate) {
    var safeLessons = lessons || [];
    var safePayments = payments || [];
    void legacyRate; // STEP 9A: nhận để tương thích chữ ký cũ, CHỦ Ý không dùng cho expected nữa

    var completedLessons = safeLessons.filter(function(l) { return l.status === 'completed'; });
    var completedCount = completedLessons.length;
    var hours = completedLessons.reduce(function(sum, l) { return sum + (Number(l.duration) || 0); }, 0);

    // STEP 9A: Expected = TỔNG lesson.rate (VNĐ, đã là snapshot đầy đủ) của từng
    // lesson completed — KHÔNG nhân với count, KHÔNG nhân ×1000, KHÔNG fallback
    // sang students.rate khi lesson.rate null/invalid (chỉ đơn giản cộng 0 cho
    // lesson đó, giữ đúng pattern `Number(...) || 0` đã dùng cho `duration`/`amount`
    // ở ngay trong file này, không crash khi dữ liệu thiếu/không hợp lệ).
    var expected = completedLessons.reduce(function(sum, l) { return sum + (Number(l.rate) || 0); }, 0);

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
