// ================================================================================
// ===== STEP 11I-K — GROUP CLASS FINANCE INTEGRATION (additive, isolated) =====
// ================================================================================
//
// PHASE 1 AUDIT (làm trước khi viết code, xem STEP_11I-K_REPORT.md §1 để biết đầy đủ):
//
// (1) Finance Dashboard (renderFinanceDashboard/renderFinanceTable, index.html) hiện CHỈ đọc
//     classList (1-to-1) + lessonsCacheByStudent + paymentsCacheByStudent, và
//     paymentsCacheByStudent/getPeriodPayments() ĐÃ được lọc `!p.group_class_id` từ STEP 11I-I —
//     tức Finance Dashboard 1-to-1 hiện tại KHÔNG hề đọc Group Class payment. Đây chính xác là chỗ
//     "chỉ đọc payment 1-to-1" mà đề bài Phase 1 yêu cầu xác định — và là nơi cần "thêm Group Class"
//     theo hướng ADDITIVE (mục 5 đề bài), không sửa lại các hàm 1-to-1 đang có.
// (2) Reports page (renderTutorAnalytics/#reports-page-view) và Admin Dashboard
//     (refreshAdminDashboardStats — đã explicit `.is('group_class_id', null)` từ STEP 11I-I) đều
//     là các UI KHÁC, không phải "Finance page phù hợp" theo nghĩa mục 11 đề bài (mục 11 nói rõ
//     "không tạo dashboard mới nếu dashboard hiện tại có thể mở rộng an toàn" — Finance Dashboard đã
//     có sẵn 1 khu vực đúng chỗ để thêm 1 section nhỏ, nên STEP này CHỈ động vào Finance Dashboard,
//     không đụng Reports page/Admin Dashboard, tránh over-design).
// (3) Student financial history (payment list trong Student Profile 1-to-1, dòng ~4565 index.html)
//     dùng getPeriodPayments() — đã tự động loại Group Class payment từ STEP 11I-I. Group Class
//     payment history đã có UI RIÊNG (renderInvoiceView() trong billing-payment.js, luôn scope theo
//     đúng 1 group_class_id + student_id đang mở) — không gộp mù theo student_id, không cần sửa gì
//     thêm ở đây (mục 10 đề bài đã được thoả mãn bởi kiến trúc đã có từ STEP 11I-G/11I-I).
// (4) computeBillingStats() (js/core/billing.js), billing-calculator.js, billing-adapter.js,
//     billing-payment.js, billing snapshot schema: KHÔNG có blocker nào chứng minh cần sửa các file
//     này cho STEP 11I-K — file này (gc-finance.js) không import/gọi bất kỳ hàm nào trong số đó.
// (5) DB: không có blocker DB. billing_snapshots.total_amount ("phải thu") và payments.amount
//     ("đã thu") là 2 khái niệm riêng — module này CHỈ cộng payments.amount (status paid/partial),
//     KHÔNG bao giờ cộng billing_snapshots.total_amount vào "Đã thu" (mục 6 đề bài).
//
// PHASE 2 — PHẠM VI: module này CHỈ đọc dữ liệu và render 1 section nhỏ trong Finance Dashboard
// (#gc-finance-section, index.html). KHÔNG ghi (insert/update/delete) bất cứ bảng nào. KHÔNG dùng
// service_role. KHÔNG sửa attendance/enrollment/generator/billing-*/gc-invoice.js.
//
// PHASE 3 — PAYMENT IDENTITY: Group Class payment nhận diện DUY NHẤT bằng
// `payments.group_class_id IS NOT NULL` (không bao giờ suy luận từ student_id + period — mục 3 đề
// bài). Mỗi payment còn có student_id + billing_snapshot_id riêng, nhưng module này chỉ cần
// group_class_id để phân loại "đây là Group Class revenue", và group_class_id (qua group_classes.id
// → group_classes.tutor_id) để xác định payment đó CÓ thuộc tutor đang đăng nhập hay không.
//
// PHASE 4 — REVENUE DATE: dùng payments.payment_date (KHÔNG dùng billing_snapshots.generated_at —
// mục 9 đề bài) để lọc đúng theo tháng Finance Dashboard đang xem (finCalYear/finCalMonth, truyền
// vào từ renderFinanceTable() — xem hook duy nhất ở index.html), cùng khái niệm "tháng" mà bảng
// "Chi tiết từng học sinh" 1-to-1 phía trên đang hiển thị.
//
// PHASE 5 — SECURITY (mục 16 đề bài): authenticated client (supabaseClient) duy nhất, KHÔNG
// service_role, KHÔNG bypass RLS. Ngoài việc dựa vào RLS, module CÒN tự lọc lại ở tầng ứng dụng —
// chỉ giữ payments có group_class_id nằm trong tập group_classes mà chính tutor đang đăng nhập sở
// hữu (đọc lại bằng `.eq('tutor_id', activeTutorId)`), cùng phong cách "không trust RLS một mình"
// mà billing-payment.js/gc-invoice.js đã áp dụng — Tutor A không thể thấy số của Tutor B dù có lỗi
// RLS giả định nào đó.

const GC_FIN_SECTION_ID = 'gc-finance-section';

function gcFinEl(id) {
    return document.getElementById(id);
}

function gcFinFmtVnd(n) {
    return (Number(n) || 0).toLocaleString('vi-VN') + ' đ';
}

// [start, end) dạng "YYYY-MM-DD" cho tháng (y, m) — m là 0-based (giống getMonthKey/Date JS trong
// index.html), dùng để lọc payments.payment_date (mục 9 — "revenue date" = payment_date thật, không
// phải chuỗi period text, tránh lệch múi giờ/định dạng).
function gcFinMonthRange(y, m) {
    var pad2 = function(n) { return String(n).padStart(2, '0'); };
    var start = y + '-' + pad2(m + 1) + '-01';
    var endY = (m === 11) ? y + 1 : y;
    var endM = (m === 11) ? 1 : m + 2;
    var end = endY + '-' + pad2(endM) + '-01';
    return { start: start, end: end };
}

var VI_MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

// Tránh 2 lần refresh chồng nhau chạy song song trả về không theo thứ tự (VD: bấm đổi tháng liên
// tiếp nhanh) — chỉ giữ lại kết quả của lần gọi MỚI NHẤT, giống pattern isStillCurrentBillingContext
// đã dùng trong billing-payment.js.
var gcFinRequestSeq = 0;

// Hàm chính — được gọi TỪ index.html (hook duy nhất, cuối renderFinanceTable()) mỗi khi Finance
// Dashboard render lại, truyền đúng (year, month, oneToOneCollectedVnd) của tháng đang xem.
async function gcRefreshFinanceSection(year, month, oneToOneCollectedVnd) {
    var section = gcFinEl(GC_FIN_SECTION_ID);
    if (!section) return; // Finance Dashboard chưa mở / DOM chưa sẵn sàng — bỏ qua, không lỗi.

    var mySeq = ++gcFinRequestSeq;
    var elLabel = gcFinEl('gc-fin-month-label');
    var elCollected = gcFinEl('gc-fin-collected');
    var elCount = gcFinEl('gc-fin-payment-count');
    var elActive = gcFinEl('gc-fin-active-count');
    var elBreakdown = gcFinEl('gc-fin-breakdown');
    var elError = gcFinEl('gc-fin-error');

    if (elLabel) elLabel.innerText = VI_MONTHS[month] + ' ' + year;
    if (elError) elError.style.display = 'none';

    if (!window.activeTutorId || !window.supabaseClient) {
        // Chưa đăng nhập / chưa sẵn sàng (module nạp trước khi login xong) — hiện trạng thái trống,
        // không phải lỗi.
        if (elCollected) elCollected.innerText = gcFinFmtVnd(0);
        if (elCount) elCount.innerText = '0';
        if (elActive) elActive.innerText = '0';
        if (elBreakdown) elBreakdown.innerHTML = '';
        return;
    }

    try {
        var supabaseClient = window.supabaseClient;
        var activeTutorId = window.activeTutorId;

        // BƯỚC 1: group_classes của ĐÚNG tutor đang đăng nhập (defense-in-depth — không trust RLS
        // một mình, xem PHASE 5 audit ở đầu file).
        var gcRes = await supabaseClient.from('group_classes').select('id, name, status').eq('tutor_id', activeTutorId);
        if (gcRes.error) throw gcRes.error;
        var myGroupClasses = gcRes.data || [];
        var myGroupClassIds = myGroupClasses.map(function(c) { return c.id; });

        if (mySeq !== gcFinRequestSeq) return; // đã có lần gọi mới hơn, bỏ kết quả cũ

        if (myGroupClassIds.length === 0) {
            // Tutor chưa có Group Class nào — 0 khắp nơi, KHÔNG gọi payments/enrollments thêm.
            if (elCollected) elCollected.innerText = gcFinFmtVnd(0);
            if (elCount) elCount.innerText = '0';
            if (elActive) elActive.innerText = '0 lớp · 0 học sinh';
            if (elBreakdown) elBreakdown.innerHTML = gcFinBuildBreakdown(oneToOneCollectedVnd, 0);
            return;
        }

        // BƯỚC 2: payments Group Class (group_class_id IS NOT NULL — mục 3 đề bài, PAYMENT IDENTITY),
        // đã thu (status paid/partial — mục 8 đề bài), đúng tháng đang xem (payment_date — mục 9/4).
        var range = gcFinMonthRange(year, month);
        var payRes = await supabaseClient
            .from('payments')
            .select('id, group_class_id, student_id, amount, status, payment_date')
            .not('group_class_id', 'is', null)
            .in('status', ['paid', 'partial'])
            .gte('payment_date', range.start)
            .lt('payment_date', range.end);
        if (payRes.error) throw payRes.error;

        if (mySeq !== gcFinRequestSeq) return;

        // Lọc lại ở tầng ứng dụng: chỉ giữ payment có group_class_id thuộc ĐÚNG tutor này (defense-
        // in-depth, PHASE 5 — mục 16 "Tutor A không được thấy... payment của Group Class Tutor B").
        var myGroupClassIdSet = {};
        myGroupClassIds.forEach(function(id) { myGroupClassIdSet[id] = true; });
        var myPayments = (payRes.data || []).filter(function(p) { return myGroupClassIdSet[p.group_class_id]; });

        // NO DOUBLE COUNT (mục 13 đề bài): mỗi payment row cộng ĐÚNG 1 LẦN — không cộng
        // billing_snapshots.total_amount (mục 6/14 — snapshot ≠ payment), không cộng lại payment nào
        // đã bị 'cancelled'/'pending' (đã loại ở filter .in('status', ...) phía trên, đúng mục 8).
        var collectedVnd = 0;
        myPayments.forEach(function(p) { collectedVnd += Number(p.amount) || 0; });

        // BƯỚC 3: lớp/học sinh đang hoạt động — group_class_enrollments.status = 'active', đã có sẵn
        // trên schema (mục 11 "nếu existing architecture đã có dữ liệu phù hợp"), giới hạn theo đúng
        // group_class_id của tutor này (RLS group_class_enrollments cũng scope qua group_classes, xem
        // audit — nhưng vẫn lọc client-side thêm cho nhất quán với payments ở trên).
        var activeClassesCount = myGroupClasses.filter(function(c) { return c.status === 'active'; }).length;
        var enrRes = await supabaseClient
            .from('group_class_enrollments')
            .select('group_class_id, student_id, status')
            .eq('status', 'active')
            .in('group_class_id', myGroupClassIds);
        if (enrRes.error) throw enrRes.error;

        if (mySeq !== gcFinRequestSeq) return;

        var activeStudentIdSet = {};
        (enrRes.data || []).forEach(function(e) {
            if (myGroupClassIdSet[e.group_class_id]) activeStudentIdSet[e.student_id] = true;
        });
        var activeStudentsCount = Object.keys(activeStudentIdSet).length;

        if (elCollected) elCollected.innerText = gcFinFmtVnd(collectedVnd);
        if (elCount) elCount.innerText = String(myPayments.length);
        if (elActive) elActive.innerText = activeClassesCount + ' lớp · ' + activeStudentsCount + ' học sinh';
        if (elBreakdown) elBreakdown.innerHTML = gcFinBuildBreakdown(oneToOneCollectedVnd, collectedVnd);
    } catch (err) {
        if (mySeq !== gcFinRequestSeq) return;
        console.error('[GROUP CLASS FINANCE] Lỗi tải dữ liệu:', err);
        if (elError) {
            elError.style.display = 'block';
            elError.innerText = '⚠️ Không tải được số liệu Group Class Finance.\n' + (window.describeSupabaseError ? window.describeSupabaseError(err) : (err && err.message) || String(err));
        }
        if (elCollected) elCollected.innerText = '⚠️';
        if (elCount) elCount.innerText = '—';
        if (elActive) elActive.innerText = '—';
        if (elBreakdown) elBreakdown.innerHTML = '';
    }
}

// Khối "Tổng doanh thu" — mục 5 đề bài (ví dụ y hệt format trong đề bài: 1-to-1 / Group Class /
// Tổng cộng). Đây CHỈ là cộng hiển thị (aggregation layer) — không tạo lại phép tính 1-to-1, số
// oneToOneVnd được TRUYỀN VÀO từ renderFinanceTable() (đã tính sẵn ở đó, xem hook ở index.html).
function gcFinBuildBreakdown(oneToOneVnd, groupClassVnd) {
    var total = (Number(oneToOneVnd) || 0) + (Number(groupClassVnd) || 0);
    return '<div style="display:flex;justify-content:space-between;"><span>Doanh thu 1-to-1</span><strong>' + gcFinFmtVnd(oneToOneVnd) + '</strong></div>'
        + '<div style="display:flex;justify-content:space-between;"><span>Doanh thu Group Class</span><strong>' + gcFinFmtVnd(groupClassVnd) + '</strong></div>'
        + '<div style="border-top:1px solid rgba(245,158,11,0.35);margin:4px 0;"></div>'
        + '<div style="display:flex;justify-content:space-between;"><span>Tổng doanh thu</span><strong style="color:#f59e0b;">' + gcFinFmtVnd(total) + '</strong></div>';
}

// Expose qua window — module ES (type="module") nên KHÔNG có global tự động; index.html (classic
// script) gọi qua window.gcRefreshFinanceSection(...), đúng pattern các module Group Class khác
// (window.gcOpenInvoicePreview, v.v.).
window.gcRefreshFinanceSection = gcRefreshFinanceSection;
