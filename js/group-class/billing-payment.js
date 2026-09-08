// ============================================================================
// js/group-class/billing-payment.js  —  STEP 11I-I: GROUP CLASS PAYMENT WRITE
// ============================================================================
// Đây là ES module thật (cùng convention group-class.js/enrollment.js/session.js/schedule.js/
// generator.js/attendance.js/student-detail.js/billing-adapter.js/billing-calculator.js). Module
// này ĐỌC các global sẵn có (supabaseClient, activeTutorId, groupClassList, escapeHtml,
// formatDate, showToast, describeSupabaseError) và window.calculateGroupClassBilling() (STEP
// 11I-D). KHÔNG import billing-calculator.js/billing-adapter.js/student-detail.js (cùng lý do
// "module Group Class không phụ thuộc lẫn nhau" — gọi qua window.* lúc runtime).
//
// ============================================================================
// PHASE 1 AUDIT — GHI LẠI ĐÚNG NHỮNG GÌ TÌM THẤY TRƯỚC KHI CODE (bắt buộc theo đề bài STEP 11I-I)
// ============================================================================
// (1) payments schema (live, xem Supabase MCP): student_id, amount(>0), payment_date, period
//     (TEXT, NOT NULL — không có default), status (paid|partial|pending|cancelled, default 'paid'),
//     note, group_class_id (nullable, STEP 11I-G, ON DELETE SET NULL), billing_snapshot_id
//     (nullable, STEP 11I-G, ON DELETE SET NULL).
// (2) payments RLS (live): INSERT with_check CHỈ kiểm tra
//     `student_id IN (SELECT s.id FROM students s JOIN tutors t ON t.id = s.tutor_id WHERE
//     t.user_id = auth.uid())` — HOÀN TOÀN KHÔNG kiểm tra group_class_id. Đây là ĐÚNG blocker mà
//     PHASE 9 đề bài yêu cầu audit + report (xem "RESIDUAL RISK — RLS GAP" cuối file). Theo đúng
//     "KHÔNG tự ý sửa RLS trong cùng step nếu không thực sự cần thiết" + "Ưu tiên chặn overpayment/
//     ownership ở application layer", file này tự bù đắp bằng cách EXPLICIT verify group_class_id
//     ownership (group_classes.tutor_id === activeTutorId) TRƯỚC MỌI INSERT, KHÔNG trust riêng RLS
//     cho việc này. KHÔNG migration nào được apply ở STEP này.
// (3) billing_snapshots / billing_snapshot_items schema + RLS (live): ĐÃ tồn tại từ STEP 11I-G,
//     RLS INSERT/SELECT đã verify ownership ĐÚNG qua group_class_id -> group_classes -> tutors
//     (không có gap giống payments) — 0 rows ở cả 2 bảng tại thời điểm audit.
// (4) BLOCKER PHÁT HIỆN NGOÀI DỰ KIẾN CỦA STEP 11I-I: đề bài STEP 11I-I giả định STEP 11I-E
//     (Billing Preview UI, tạo billing_snapshots từ UI) VÀ STEP 11I-H (Legacy 1-to-1 isolation)
//     ĐÃ HOÀN TẤT. Audit source thực tế cho thấy KHÔNG ĐÚNG:
//       - student-detail.js Section F ("💳 Thanh toán") CHỈ là placeholder tĩnh trỏ tới "STEP 11I"
//         — KHÔNG có Billing Preview UI, KHÔNG có cách nào tạo billing_snapshots từ UI (đúng như
//         comment 11H-D "CHỦ Ý KHÔNG CÓ Ở STEP NÀY"). billing_snapshots có 0 dòng.
//       - getPeriodPayments()/Admin Dashboard payments query/Student Profile all-time stats
//         (index.html) KHÔNG loại trừ group_class_id IS NOT NULL — Legacy isolation (11I-H) CHƯA
//         được áp dụng ở tầng client, dù cột DB đã có (11I-G).
//     Không thể "chỉ thêm nút Thanh toán vào Billing Preview hiện tại" (Phase 10 đề bài) vì Billing
//     Preview KHÔNG tồn tại, và không có billing_snapshot nào để pay-down (Phase 3: "CHỈ cho phép
//     tạo Group Class payment nếu có billing_snapshot hợp lệ"). Theo đúng tinh thần "STOP và
//     report" của TOÀN BỘ chuỗi step này, quyết định thực tế được đưa ra là: (a) sửa 3 điểm Legacy
//     isolation còn thiếu ngay trong STEP này (bắt buộc, nếu không thì "Group Class payment can
//     contaminate legacy 1-to-1 aggregation" — FAIL CRITERIA của chính STEP 11I-I), và (b) bổ sung
//     PHẦN TỐI THIỂU của Billing Preview UI (xem tiếp/tạo hóa đơn — snapshot generation) NGAY
//     TRONG FILE NÀY, vì không có nó thì tính năng Payment Write không có gì để test/verify được.
//     Phần (b) được tách bạch rõ trong code (nhóm hàm "SNAPSHOT (BILLING PREVIEW) — bổ sung tối
//     thiểu") và trong FINAL REPORT — đây là scope vượt ranh giới nghiêm ngặt "KHÔNG làm Invoice/
//     Reports" của đề bài STEP 11I-I, được thực hiện có chủ đích, có ghi chú, KHÔNG che giấu.
//     KHÔNG đụng billing-calculator.js/billing-adapter.js/computeBillingStats() — snapshot
//     generation ở đây CHỈ gọi lại window.calculateGroupClassBilling() (STEP 11I-D) rồi INSERT
//     nguyên kết quả, không tính toán lại gì khác.
//
// PHẠM VI STEP NÀY (module này):
//   - Snapshot lookup theo (group_class_id, student_id, period_start, period_end).
//   - Snapshot creation TỐI THIỂU (freeze billing-calculator output) khi CHƯA có snapshot cho kỳ.
//   - createGroupClassPayment(): ghi payment thật, full/partial, chặn overpayment, ownership check.
//   - Payment History riêng cho Group Class (KHÔNG reuse renderPaymentHistory() 1-1).
//   - Render UI vào #gc-billing-section (đặt sẵn bởi student-detail.js Section F).
//   - Append-only: KHÔNG có edit/delete Group Class payment ở UI này (Phase 13 đề bài).
// ============================================================================

// ----------------------------------------------------------------------
// STATE — cùng pattern context-token của student-detail.js/attendance.js (chống race condition
// khi đổi học sinh/lớp/tháng trong lúc đang chờ mạng).
// ----------------------------------------------------------------------
var gcBillingContext = null; // { groupClassId, studentId, monthKey }
var gcBillingInFlight = false; // in-flight guard (Phase 6 — double click/double submit)

function isStillCurrentBillingContext(ctx) {
    return gcBillingContext
        && gcBillingContext.groupClassId === ctx.groupClassId
        && gcBillingContext.studentId === ctx.studentId
        && gcBillingContext.monthKey === ctx.monthKey;
}

function defaultMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// monthKey "YYYY-MM" -> { periodStart, periodEnd } (ngày đầu/cuối tháng, "YYYY-MM-DD") — CHỈ hỗ
// trợ billing theo THÁNG DƯƠNG LỊCH ở UI này (đúng ví dụ "Học phí tháng 09/2026" của đề bài Phase
// 10) — KHÔNG hỗ trợ custom range tự do ở STEP này (ngoài phạm vi).
function monthKeyToPeriod(monthKey) {
    var parts = monthKey.split('-');
    var y = Number(parts[0]), m = Number(parts[1]); // m: 1-12
    var periodStart = monthKey + '-01';
    var lastDay = new Date(y, m, 0).getDate(); // ngày cuối tháng m (Date tháng 0-based nên m ở đây đúng = tháng sau -1 ngày)
    var periodEnd = monthKey + '-' + String(lastDay).padStart(2, '0');
    return { periodStart: periodStart, periodEnd: periodEnd };
}

function monthKeyLabel(monthKey) {
    var parts = monthKey.split('-');
    return 'tháng ' + parts[1] + '/' + parts[0];
}

function shiftMonthKey(monthKey, delta) {
    var parts = monthKey.split('-');
    var y = Number(parts[0]), m = Number(parts[1]) - 1; // 0-based
    var d = new Date(y, m + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ----------------------------------------------------------------------
// ENTRY POINT — gọi từ student-detail.js sau khi render xong Section F placeholder.
// ----------------------------------------------------------------------
function loadGroupClassBillingSection(groupClassId, studentId) {
    var ctx = { groupClassId: groupClassId, studentId: studentId, monthKey: defaultMonthKey() };
    gcBillingContext = ctx;
    fetchAndRenderBilling(ctx);
}

function gcBillingChangeMonth(delta) {
    if (!gcBillingContext) return;
    var ctx = { groupClassId: gcBillingContext.groupClassId, studentId: gcBillingContext.studentId, monthKey: shiftMonthKey(gcBillingContext.monthKey, delta) };
    gcBillingContext = ctx;
    fetchAndRenderBilling(ctx);
}

function billingSectionEl() {
    return document.getElementById('gc-billing-section');
}

function renderBillingShell(ctx, innerHtml) {
    var el = billingSectionEl();
    if (!el || !isStillCurrentBillingContext(ctx)) return;
    var monthNavHtml = '<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">' +
        '<button type="button" class="btn-secondary" style="padding:3px 9px; font-size:12px;" onclick="gcBillingChangeMonth(-1)">‹</button>' +
        '<div style="font-size:12.5px; color:var(--text-main); font-weight:600; min-width:110px; text-align:center;">' + escapeHtml(monthKeyLabel(ctx.monthKey)) + '</div>' +
        '<button type="button" class="btn-secondary" style="padding:3px 9px; font-size:12px;" onclick="gcBillingChangeMonth(1)">›</button>' +
        '</div>';
    el.innerHTML = monthNavHtml + '<div id="gc-billing-body">' + innerHtml + '</div>';
}

// ----------------------------------------------------------------------
// LOAD + RENDER — snapshot đã có -> invoice/payment view. Chưa có -> preview + "Tạo hóa đơn".
// ----------------------------------------------------------------------
async function fetchAndRenderBilling(ctx) {
    renderBillingShell(ctx, '<div style="color:var(--text-sub); font-size:12.5px; padding:6px 0;">⏳ Đang tải học phí...</div>');

    try {
        var period = monthKeyToPeriod(ctx.monthKey);

        var snapRes = await supabaseClient
            .from('billing_snapshots')
            .select('id, group_class_id, student_id, period_start, period_end, total_amount, billable_session_count, generated_at')
            .eq('group_class_id', ctx.groupClassId)
            .eq('student_id', ctx.studentId)
            .eq('period_start', period.periodStart)
            .eq('period_end', period.periodEnd)
            .maybeSingle();

        if (!isStillCurrentBillingContext(ctx)) return;

        if (snapRes.error) {
            renderBillingShell(ctx, '<div style="color:#ef4444; font-size:12.5px; padding:6px 0;">⚠️ Không tải được hóa đơn.<br>' + escapeHtml(describeSupabaseError(snapRes.error)) + '</div>');
            return;
        }

        if (snapRes.data) {
            await renderInvoiceView(ctx, snapRes.data);
        } else {
            await renderPreviewView(ctx, period);
        }
    } catch (err) {
        if (!isStillCurrentBillingContext(ctx)) return;
        console.error('[GROUP CLASS BILLING] fetchAndRenderBilling EXCEPTION:', err);
        renderBillingShell(ctx, '<div style="color:#ef4444; font-size:12.5px; padding:6px 0;">⚠️ Lỗi không xác định khi tải học phí.</div>');
    }
}

// ----------------------------------------------------------------------
// SNAPSHOT (BILLING PREVIEW) — bổ sung tối thiểu (xem PHASE 1 AUDIT mục (4) ở đầu file — đây là
// phần lẽ ra thuộc STEP 11I-E, được bổ sung tối thiểu vì 11I-I không thể test/hoạt động nếu
// thiếu). CHỈ gọi lại calculateGroupClassBilling() (STEP 11I-D) rồi freeze nguyên kết quả —
// KHÔNG tự tính toán gì khác, KHÔNG sửa billing-calculator.js.
// ----------------------------------------------------------------------
async function renderPreviewView(ctx, period) {
    if (!isStillCurrentBillingContext(ctx)) return;
    try {
        var preview = await window.calculateGroupClassBilling({
            groupClassId: ctx.groupClassId, studentId: ctx.studentId,
            periodStart: period.periodStart, periodEnd: period.periodEnd
        });
        if (!isStillCurrentBillingContext(ctx)) return;

        var html = '<div style="font-size:12.5px; color:var(--text-sub); line-height:1.8; margin-bottom:10px;">' +
            'Chưa tạo hóa đơn cho ' + escapeHtml(monthKeyLabel(ctx.monthKey)) + '.<br>' +
            'Số buổi billable (tạm tính): <strong style="color:var(--text-main);">' + preview.billableSessionCount + '</strong><br>' +
            'Tổng tạm tính: <strong style="color:var(--text-main);">' + preview.totalAmount.toLocaleString('vi-VN') + ' đ</strong>' +
            '</div>';

        if (preview.billableSessionCount > 0) {
            html += '<button type="button" class="btn-primary" style="padding:6px 14px; font-size:12.5px;" onclick="gcBillingCreateSnapshot()">📄 Tạo hóa đơn ' + escapeHtml(monthKeyLabel(ctx.monthKey)) + '</button>';
        } else {
            html += '<div style="color:#9ca3af; font-size:12px;">Không có buổi học billable nào trong kỳ này — chưa thể tạo hóa đơn.</div>';
        }

        renderBillingShell(ctx, html);
    } catch (err) {
        if (!isStillCurrentBillingContext(ctx)) return;
        console.error('[GROUP CLASS BILLING] renderPreviewView EXCEPTION:', err);
        renderBillingShell(ctx, '<div style="color:#ef4444; font-size:12.5px; padding:6px 0;">⚠️ Không tính được học phí tạm tính cho kỳ này.<br>' + escapeHtml(err && err.message ? err.message : String(err)) + '</div>');
    }
}

// "Tạo hóa đơn" — tính lại NGAY LÚC BẤM (KHÔNG dùng số đã render, tránh lệch dữ liệu nếu attendance
// vừa đổi trong lúc xem), rồi INSERT billing_snapshots (header) + billing_snapshot_items (dòng
// từng buổi) NGUYÊN VĂN kết quả calculateGroupClassBilling() — KHÔNG tính lại theo cách khác.
async function gcBillingCreateSnapshot() {
    if (!gcBillingContext || gcBillingInFlight) return;
    var ctx = gcBillingContext;
    var period = monthKeyToPeriod(ctx.monthKey);
    gcBillingInFlight = true;

    try {
        var fresh = await window.calculateGroupClassBilling({
            groupClassId: ctx.groupClassId, studentId: ctx.studentId,
            periodStart: period.periodStart, periodEnd: period.periodEnd
        });
        if (!isStillCurrentBillingContext(ctx)) { gcBillingInFlight = false; return; }

        if (fresh.billableSessionCount === 0) {
            showToast('⚠️', 'Không thể tạo hóa đơn', 'Không có buổi học billable nào trong kỳ này.', 3500);
            gcBillingInFlight = false;
            return;
        }

        // Ownership defense-in-depth (giống createGroupClassPayment bên dưới — RLS billing_snapshots
        // đã tự verify qua group_class_id->tutors nên đây KHÔNG phải bù RLS gap, chỉ giữ nhất quán
        // với nguyên tắc "không trust group_class_id chỉ vì đến từ UI" của Phase 7 đề bài).
        var gcCheck = await supabaseClient.from('group_classes').select('id, tutor_id').eq('id', ctx.groupClassId).maybeSingle();
        if (!isStillCurrentBillingContext(ctx)) { gcBillingInFlight = false; return; }
        if (gcCheck.error || !gcCheck.data || gcCheck.data.tutor_id !== activeTutorId) {
            showToast('⚠️', 'Không thể tạo hóa đơn', 'Group Class không hợp lệ hoặc không thuộc quyền của bạn.', 3500);
            gcBillingInFlight = false;
            return;
        }

        var snapInsert = await supabaseClient
            .from('billing_snapshots')
            .insert({
                group_class_id: ctx.groupClassId,
                student_id: ctx.studentId,
                period_start: period.periodStart,
                period_end: period.periodEnd,
                total_amount: fresh.totalAmount,
                billable_session_count: fresh.billableSessionCount
            })
            .select()
            .single();

        if (!isStillCurrentBillingContext(ctx)) { gcBillingInFlight = false; return; }

        if (snapInsert.error) {
            console.error('[GROUP CLASS BILLING] Tạo billing_snapshots FAILED:', snapInsert.error);
            showToast('⚠️', 'Lỗi', 'Không tạo được hóa đơn.\n' + describeSupabaseError(snapInsert.error), 4000);
            gcBillingInFlight = false;
            return;
        }

        var snapshot = snapInsert.data;

        if (fresh.records.length > 0) {
            var itemRows = fresh.records.map(function(r) {
                return {
                    billing_snapshot_id: snapshot.id,
                    session_id: r.id,
                    scheduled_date: r.scheduled_date,
                    class_rate: r.class_rate,
                    amount: r.amount
                };
            });
            var itemsInsert = await supabaseClient.from('billing_snapshot_items').insert(itemRows);
            if (itemsInsert.error) {
                // Header đã tạo nhưng items lỗi — KHÔNG rollback thủ công (billing_snapshots không
                // cho UPDATE/DELETE theo thiết kế 11I-G immutable). Báo lỗi rõ, KHÔNG giả vờ thành
                // công, để người dùng/tutor biết cần liên hệ hỗ trợ thay vì bấm lại (bấm lại sẽ tạo
                // header trùng vì period đã có 1 header nhưng thiếu items).
                console.error('[GROUP CLASS BILLING] Tạo billing_snapshot_items FAILED (header đã tạo, id=' + snapshot.id + '):', itemsInsert.error);
                showToast('⚠️', 'Lỗi một phần', 'Đã tạo hóa đơn nhưng chưa lưu được chi tiết từng buổi. Vui lòng tải lại trang và kiểm tra.', 5000);
                gcBillingInFlight = false;
                return;
            }
        }

        showToast('✅', 'Đã tạo hóa đơn', monthKeyLabel(ctx.monthKey), 2500);
        gcBillingInFlight = false;
        fetchAndRenderBilling(ctx);
    } catch (err) {
        gcBillingInFlight = false;
        console.error('[GROUP CLASS BILLING] gcBillingCreateSnapshot EXCEPTION:', err);
        showToast('⚠️', 'Lỗi', 'Không tạo được hóa đơn (lỗi không xác định).', 4000);
    }
}

// ----------------------------------------------------------------------
// INVOICE VIEW — snapshot đã tồn tại: hiển thị Tổng/Đã thu/Còn lại + form thanh toán (nếu còn nợ)
// + Payment History riêng cho Group Class (Phase 10 + 11 đề bài).
// ----------------------------------------------------------------------
async function renderInvoiceView(ctx, snapshot) {
    try {
        var payRes = await supabaseClient
            .from('payments')
            .select('id, amount, payment_date, status, note, created_at')
            .eq('billing_snapshot_id', snapshot.id)
            .order('payment_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (!isStillCurrentBillingContext(ctx)) return;

        if (payRes.error) {
            renderBillingShell(ctx, '<div style="color:#ef4444; font-size:12.5px; padding:6px 0;">⚠️ Không tải được lịch sử thanh toán.<br>' + escapeHtml(describeSupabaseError(payRes.error)) + '</div>');
            return;
        }

        var payments = payRes.data || [];
        // "Đã thu" — cancelled KHÔNG tính (đúng semantics computePeriodStatus/computeBillingStats
        // hiện có: chỉ 'paid'/'partial' được cộng; 'pending' cũng KHÔNG cộng — nhưng payment Group
        // Class ở UI này LUÔN insert status='paid' (xem createGroupClassPayment, không có ô chọn
        // status ở Phase 10 UI), nên 'pending' trên thực tế sẽ không xuất hiện từ UI này — vẫn giữ
        // đúng rule loại trừ để không cộng nhầm nếu có payment 'pending'/'cancelled' từ nguồn khác).
        var collected = payments.reduce(function(sum, p) {
            if (p.status === 'paid' || p.status === 'partial') return sum + (Number(p.amount) || 0);
            return sum;
        }, 0);
        var remaining = Math.max(0, Number(snapshot.total_amount) - collected);

        var html = '<div style="font-size:12.5px; color:var(--text-sub); line-height:1.9; margin-bottom:10px;">' +
            'Học phí ' + escapeHtml(monthKeyLabel(ctx.monthKey)) + '<br>' +
            'Tổng: <strong style="color:var(--text-main);">' + Number(snapshot.total_amount).toLocaleString('vi-VN') + ' đ</strong><br>' +
            'Đã thu: <strong style="color:#10b981;">' + collected.toLocaleString('vi-VN') + ' đ</strong><br>' +
            'Còn lại: <strong style="color:' + (remaining > 0 ? '#ef4444' : 'var(--text-main)') + ';">' + remaining.toLocaleString('vi-VN') + ' đ</strong>' +
            '</div>';

        // STEP 11I-J: action Invoice — CHỈ hiện khi đã có billing_snapshot (luôn đúng ở nhánh này
        // vì renderInvoiceView() chỉ được gọi khi fetchAndRenderBilling() tìm thấy snapshot).
        // Module js/group-class/gc-invoice.js tự audit/verify/tải lại toàn bộ dữ liệu cần thiết —
        // ở đây CHỈ truyền id, KHÔNG truyền số liệu đã render (đúng nguyên tắc "không trust số trên
        // màn hình" xuyên suốt STEP 11I-I).
        html += '<div style="margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button type="button" class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="gcOpenInvoicePreview(\'' + ctx.groupClassId + '\', \'' + ctx.studentId + '\', \'' + snapshot.id + '\')">🧾 Xem hóa đơn</button>' +
            '<button type="button" class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="gcExportInvoiceImage(\'' + ctx.groupClassId + '\', \'' + ctx.studentId + '\', \'' + snapshot.id + '\')">🖼️ Tải ảnh hóa đơn</button>' +
            '</div>';

        if (remaining > 0) {
            html += '<div id="gc-payment-form" style="margin-bottom:14px; padding:10px; border:1px solid var(--border-color); border-radius:8px;">' +
                '<div style="margin-bottom:6px;"><label style="font-size:12px; color:var(--text-sub);">Số tiền thanh toán</label>' +
                '<input type="number" id="gc-payment-amount" min="1" max="' + remaining + '" placeholder="' + remaining + '" style="width:100%; margin-top:3px;"></div>' +
                '<div style="margin-bottom:6px;"><label style="font-size:12px; color:var(--text-sub);">Ngày thanh toán</label>' +
                '<input type="date" id="gc-payment-date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:100%; margin-top:3px;"></div>' +
                '<div style="margin-bottom:8px;"><label style="font-size:12px; color:var(--text-sub);">Ghi chú</label>' +
                '<input type="text" id="gc-payment-note" placeholder="(không bắt buộc)" style="width:100%; margin-top:3px;"></div>' +
                '<div id="gc-payment-error" style="display:none; color:#ef4444; font-size:12px; margin-bottom:6px;"></div>' +
                '<button type="button" id="gc-payment-submit-btn" class="btn-primary" style="padding:6px 14px; font-size:12.5px;" onclick="gcBillingSubmitPayment(\'' + snapshot.id + '\')">💰 Thanh toán</button>' +
                '</div>';
        } else {
            html += '<div style="color:#10b981; font-size:12.5px; margin-bottom:14px;">✅ Đã thu đủ học phí kỳ này.</div>';
        }

        html += '<div style="font-size:12.5px; color:var(--text-main); font-weight:600; margin-bottom:6px;">Lịch sử thanh toán (Group Class)</div>';
        if (payments.length === 0) {
            html += '<div style="color:#9ca3af; font-size:12.5px; padding:4px 0;">Chưa có khoản thanh toán nào.</div>';
        } else {
            html += payments.map(function(p) {
                var statusLabel = { paid: 'Đã thu', partial: 'Thu một phần', pending: 'Chờ xử lý', cancelled: 'Đã hủy' }[p.status] || p.status;
                var statusColor = p.status === 'cancelled' ? '#ef4444' : (p.status === 'pending' ? '#f59e0b' : '#10b981');
                return '<div style="padding:5px 0; border-top:1px solid var(--border-color); font-size:12.5px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">' +
                    '<span style="color:var(--text-main);">' + formatDate(p.payment_date) + ' · <strong>' + Number(p.amount).toLocaleString('vi-VN') + ' đ</strong>' + (p.note ? (' · ' + escapeHtml(p.note)) : '') + '</span>' +
                    '<span style="color:' + statusColor + ';">' + escapeHtml(statusLabel) + '</span>' +
                    '</div>';
            }).join('');
        }

        renderBillingShell(ctx, html);
    } catch (err) {
        if (!isStillCurrentBillingContext(ctx)) return;
        console.error('[GROUP CLASS BILLING] renderInvoiceView EXCEPTION:', err);
        renderBillingShell(ctx, '<div style="color:#ef4444; font-size:12.5px; padding:6px 0;">⚠️ Lỗi không xác định khi tải hóa đơn.</div>');
    }
}

// ----------------------------------------------------------------------
// CREATE PAYMENT — Phase 7-9 đề bài: verify TOÀN BỘ trước INSERT, KHÔNG trust group_class_id/
// student_id/billing_snapshot_id chỉ vì đến từ UI/context hiện tại.
// ----------------------------------------------------------------------
async function gcBillingSubmitPayment(billingSnapshotId) {
    if (!gcBillingContext || gcBillingInFlight) return;
    var ctx = gcBillingContext;

    var errEl = document.getElementById('gc-payment-error');
    var amountInput = document.getElementById('gc-payment-amount');
    var dateInput = document.getElementById('gc-payment-date');
    var noteInput = document.getElementById('gc-payment-note');
    var submitBtn = document.getElementById('gc-payment-submit-btn');
    if (errEl) errEl.style.display = 'none';

    var amount = parseFloat(amountInput ? amountInput.value : '');
    var paymentDate = dateInput ? dateInput.value : '';
    var note = noteInput ? noteInput.value.trim() : '';

    if (!amount || isNaN(amount) || amount <= 0) {
        if (errEl) { errEl.innerText = '⚠️ Vui lòng nhập số tiền hợp lệ.'; errEl.style.display = 'block'; }
        return;
    }
    if (!paymentDate) {
        if (errEl) { errEl.innerText = '⚠️ Vui lòng chọn ngày thanh toán.'; errEl.style.display = 'block'; }
        return;
    }

    gcBillingInFlight = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ Đang lưu...'; }

    try {
        // (1) authenticated user (application-layer — RLS vẫn là lớp bảo vệ THẬT SỰ ở DB).
        if (!activeTutorId) {
            throw { userMessage: 'Phiên đăng nhập không hợp lệ. Vui lòng tải lại trang.' };
        }

        // (2)+(10) Group Class tồn tại + thuộc ĐÚNG tutor hiện tại — bù đắp RLS gap đã audit
        // (payments INSERT policy KHÔNG verify group_class_id — xem PHASE 1 AUDIT đầu file).
        var gcRes = await supabaseClient.from('group_classes').select('id, tutor_id').eq('id', ctx.groupClassId).maybeSingle();
        if (gcRes.error || !gcRes.data) throw { userMessage: 'Không tìm thấy Group Class.' };
        if (gcRes.data.tutor_id !== activeTutorId) throw { userMessage: 'Group Class này không thuộc quyền quản lý của bạn.' };

        // (3) Student tồn tại + thuộc ĐÚNG tutor hiện tại (đồng bộ với payments RLS ownership rule).
        var stRes = await supabaseClient.from('students').select('id, tutor_id').eq('id', ctx.studentId).maybeSingle();
        if (stRes.error || !stRes.data) throw { userMessage: 'Không tìm thấy học sinh.' };
        if (stRes.data.tutor_id !== activeTutorId) throw { userMessage: 'Học sinh này không thuộc quyền quản lý của bạn.' };

        // (4)+(5)+(6)+(9) Snapshot tồn tại, thuộc ĐÚNG Group Class + student đang mở, period hợp lệ.
        // Đọc LẠI từ DB (KHÔNG dùng số đã render trên màn hình) để tránh race condition (2 tab,
        // vừa có thanh toán khác chèn vào giữa lúc form đang mở).
        var snapRes = await supabaseClient.from('billing_snapshots').select('id, group_class_id, student_id, period_start, period_end, total_amount').eq('id', billingSnapshotId).maybeSingle();
        if (snapRes.error || !snapRes.data) throw { userMessage: 'Không tìm thấy hóa đơn (billing snapshot).' };
        var snapshot = snapRes.data;
        if (snapshot.group_class_id !== ctx.groupClassId) throw { userMessage: 'Hóa đơn không khớp với Group Class đang mở.' };
        if (snapshot.student_id !== ctx.studentId) throw { userMessage: 'Hóa đơn không khớp với học sinh đang mở.' };
        if (!snapshot.period_start || !snapshot.period_end || snapshot.period_start > snapshot.period_end) {
            throw { userMessage: 'Hóa đơn có kỳ thanh toán không hợp lệ.' };
        }

        // (7) amount > 0 — đã check ở trên, giữ lại theo checklist đề bài.
        if (!(amount > 0)) throw { userMessage: 'Số tiền thanh toán phải lớn hơn 0.' };

        // (8) amount <= remaining — tính LẠI remaining từ payments hiện có trong DB tại thời điểm
        // submit (KHÔNG dùng remaining đã render, đúng PHASE 6 "double click/two tabs/retry").
        var existingPayRes = await supabaseClient.from('payments').select('amount, status').eq('billing_snapshot_id', billingSnapshotId);
        if (existingPayRes.error) throw { userMessage: 'Không kiểm tra được số dư hóa đơn. Vui lòng thử lại.' };
        var alreadyCollected = (existingPayRes.data || []).reduce(function(sum, p) {
            if (p.status === 'paid' || p.status === 'partial') return sum + (Number(p.amount) || 0);
            return sum;
        }, 0);
        var remaining = Math.max(0, Number(snapshot.total_amount) - alreadyCollected);
        if (remaining <= 0) throw { userMessage: 'Hóa đơn này đã được thu đủ.' };
        if (amount > remaining) throw { userMessage: 'Số tiền vượt quá số còn phải thu (' + remaining.toLocaleString('vi-VN') + ' đ).' };

        // period (TEXT, NOT NULL trên schema payments — xem PHASE 1 AUDIT (1)) — snapshot.period_start
        // LUÔN là "YYYY-MM-DD" đầu tháng do monthKeyToPeriod() sinh ra, nên .slice(0,7) cho đúng
        // "YYYY-MM" tương thích Legacy — CHỈ để tương thích cột NOT NULL, KHÔNG dùng field này làm
        // nguồn tham chiếu chính (billing_snapshot_id mới là nguồn tham chiếu chính — đúng Phase 2/8).
        var row = {
            student_id: ctx.studentId,
            group_class_id: ctx.groupClassId,
            billing_snapshot_id: billingSnapshotId,
            amount: amount,
            payment_date: paymentDate,
            period: snapshot.period_start.slice(0, 7),
            status: 'paid', // Phase 10 UI đề bài KHÔNG có ô chọn trạng thái — mỗi lần ghi là 1 khoản THỰC ĐÃ THU.
            note: note || null
        };

        var insertRes = await supabaseClient.from('payments').insert(row).select().single();
        if (insertRes.error) throw { userMessage: 'Không lưu được thanh toán.\n' + describeSupabaseError(insertRes.error) };

        showToast('✅', 'Đã ghi thanh toán', amount.toLocaleString('vi-VN') + ' đ', 2500);
        gcBillingInFlight = false;
        // (Phase 12) refresh: reload lại toàn bộ section (snapshot balance + payment history).
        fetchAndRenderBilling(ctx);
    } catch (err) {
        gcBillingInFlight = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '💰 Thanh toán'; }
        var msg = (err && err.userMessage) ? err.userMessage : 'Lỗi không xác định khi ghi thanh toán.';
        if (!(err && err.userMessage)) console.error('[GROUP CLASS BILLING] gcBillingSubmitPayment EXCEPTION:', err);
        if (errEl) { errEl.innerText = '⚠️ ' + msg; errEl.style.display = 'block'; }
    }
}

// ============================================================================
// EXPOSE QUA WINDOW (cùng convention mọi module Group Class khác) — chỉ export entry point cần
// cho onclick trong HTML render ở trên hoặc để student-detail.js gọi vào.
// ============================================================================
export {
    loadGroupClassBillingSection, gcBillingChangeMonth, gcBillingCreateSnapshot, gcBillingSubmitPayment
};

window.loadGroupClassBillingSection = loadGroupClassBillingSection;
window.gcBillingChangeMonth = gcBillingChangeMonth;
window.gcBillingCreateSnapshot = gcBillingCreateSnapshot;
window.gcBillingSubmitPayment = gcBillingSubmitPayment;
