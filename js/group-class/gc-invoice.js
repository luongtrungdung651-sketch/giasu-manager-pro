// ============================================================================
// js/group-class/gc-invoice.js  —  STEP 11I-J: GROUP CLASS INVOICE (snapshot-based, read-only)
// ============================================================================
// ES module thật, cùng convention với group-class.js/enrollment.js/session.js/schedule.js/
// generator.js/attendance.js/student-detail.js/billing-adapter.js/billing-calculator.js/
// billing-payment.js. Module này ĐỌC các global sẵn có (supabaseClient, activeTutorId,
// escapeHtml, formatDate, showToast, describeSupabaseError, getUsers, currentUser, currentTutor)
// — KHÔNG import billing-payment.js/student-detail.js (module Group Class không phụ thuộc lẫn
// nhau — gọi qua window.* lúc runtime, đúng nguyên tắc đã áp dụng xuyên suốt chuỗi step này).
//
// ============================================================================
// PHASE 1 AUDIT — GHI LẠI TRƯỚC KHI CODE (bắt buộc theo đề bài STEP 11I-J)
// ============================================================================
// (1) billing_snapshots / billing_snapshot_items (live, STEP 11I-G): snapshots có
//     group_class_id, student_id, period_start, period_end, total_amount,
//     billable_session_count, generated_at. Items có billing_snapshot_id, session_id,
//     scheduled_date, class_rate, amount. RLS cả 2 bảng ĐÃ verify ownership đúng qua
//     group_class_id -> group_classes.tutor_id -> tutors.user_id = auth.uid() (KHÔNG có gap
//     giống payments đã audit ở STEP 11I-I/11I-I-R) — verify lại bằng pg_policies trước khi viết
//     module này, không có thay đổi RLS nào cần trong STEP này.
// (2) ĐƠN VỊ: billing_snapshot_items.class_rate/amount và billing_snapshots.total_amount ĐÃ LÀ
//     VNĐ ĐẦY ĐỦ (không phải "nghìn đồng") — xem billing-adapter.js dòng
//     `class_rate: (Number(enrollment.class_rate) || 0) * 1000` (×1000 áp dụng ở ADAPTER, TRƯỚC
//     khi ghi vào snapshot) và billing-calculator.js `amount = r.class_rate` (không nhân gì
//     thêm). renderInvoiceView() (billing-payment.js) đã dùng đúng convention này
//     (`Number(snapshot.total_amount).toLocaleString('vi-VN')`, KHÔNG ×1000). Module này giữ
//     NGUYÊN convention — KHÔNG ×1000 lại bất kỳ giá trị nào đọc từ snapshot/items.
// (3) existing exportInvoice()/buildInvoiceHtml() (index.html, ~dòng 9903-10030) là Invoice 1-to-1:
//     đọc classList/student.attendance[mk]/student.rate/computeBillingStats(), tutor identity từ
//     localStorage getUsers()[currentUser]. HOÀN TOÀN không có field group_class_id/snapshot —
//     không thể/không nên tái sử dụng trực tiếp cho Group Class (billing model khác hẳn — snapshot
//     immutable vs. tính lại từ attendance hiện tại). Theo đúng Phase 7 đề bài ("1-to-1 Invoice ≠
//     Group Class Invoice", "không merge 2 billing model nguy hiểm"), STEP này viết
//     buildGroupClassInvoiceHtml() ĐỘC LẬP hoàn toàn, KHÔNG gọi/sửa buildInvoiceHtml()/
//     exportInvoice()/exportInvoiceAsImage() — 3 hàm đó giữ NGUYÊN, byte-identical.
// (4) exportInvoiceAsImage() (index.html) dùng html2canvas (CDN đã load sẵn ở <head>, xem
//     index.html dòng 9 `cdnjs.cloudflare.com/.../html2canvas.min.js`) qua kỹ thuật iframe ẩn ->
//     canvas -> PNG. Kỹ thuật này GENERIC (không phụ thuộc billing model), được tái sử dụng Ở ĐÂY
//     bằng một hàm ĐỘC LẬP (gcExportInvoiceImage, không gọi exportInvoiceAsImage) — KHÔNG thêm
//     dependency mới (Phase 9 đề bài).
// (5) Tutor identity: `currentTutor` (global, gán lúc login = row thật từ bảng `tutors`, có
//     display_name/phone — xem index.html dòng ~6393 `currentTutor = tutor;`) là nguồn CHÍNH XÁC
//     hơn cho Group Class (đã là feature Supabase-backed hoàn toàn) so với localStorage
//     getUsers()[currentUser] mà 1-to-1 Invoice đang dùng (localStorage chỉ có displayName/qrInfo,
//     KHÔNG có trong DB). Module này ưu tiên currentTutor.display_name/phone, fallback về
//     getUsers()[currentUser].displayName nếu currentTutor rỗng (ví dụ phiên demo cũ), giữ QR
//     (getUsers()[currentUser].qrInfo) vì đó là dữ liệu CHUNG cho tutor hiện tại bất kể 1-to-1 hay
//     Group Class (không phải dữ liệu riêng của 1-to-1) — tái sử dụng ĐÚNG tinh thần "generic".
// (6) KHÔNG có bảng "invoices" nào trong DB (audit list_tables) — Phase 10 đề bài: KHÔNG tạo bảng
//     chỉ vì tên feature là "Invoice". Invoice ở STEP này là GENERATED-ON-DEMAND từ
//     billing_snapshots + billing_snapshot_items + payments hiện có, giống hệt kiến trúc 1-to-1
//     Invoice hiện tại (cũng generated-on-demand, không persist). KHÔNG migration nào trong STEP
//     này.
//
// PHẠM VI STEP NÀY (module này):
//   - Render Invoice (HTML document đầy đủ, xem/tải) TỪ billing_snapshot + billing_snapshot_items
//     + payments hiện có của ĐÚNG billing_snapshot_id đó — KHÔNG tính lại gì (Phase 2/6 đề bài).
//   - "Xem hóa đơn" (mở tab mới, xem/in) + "Tải ảnh hóa đơn" (PNG, tái sử dụng kỹ thuật
//     html2canvas). KHÔNG tạo payment mới, KHÔNG tạo/sửa snapshot, KHÔNG có invoice table.
//   - Verify ownership ĐỘC LẬP trước khi render (KHÔNG trust riêng RLS, cùng nguyên tắc
//     billing-payment.js) dù RLS billing_snapshots/items đã đúng — defense-in-depth.
// ============================================================================

var gcInvoiceInFlight = false; // guard nhẹ chống double-click (read-only, không phải rủi ro ghi dữ liệu)

var _giViMonths = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function _giMonthLabelFromPeriodStart(periodStart) {
    // periodStart luôn "YYYY-MM-DD" (đầu tháng, do monthKeyToPeriod() ở billing-payment.js sinh ra
    // lúc tạo snapshot) — KHÔNG suy đoán từ Date() local timezone để tránh lệch ngày.
    var parts = String(periodStart).split('-');
    var y = Number(parts[0]), m = Number(parts[1]);
    return _giViMonths[m] + ' ' + y;
}

// ----------------------------------------------------------------------
// PHASE 1 (bên trong load) — nạp + verify TOÀN BỘ dữ liệu cần cho invoice, KHÔNG trust riêng
// tham số truyền vào (groupClassId/studentId/billingSnapshotId đến từ onclick HTML — vẫn phải
// verify lại DB, đúng nguyên tắc Phase 7/11 đề bài).
// ----------------------------------------------------------------------
async function _giLoadInvoicePayload(groupClassId, studentId, billingSnapshotId) {
    if (!activeTutorId) throw { userMessage: 'Phiên đăng nhập không hợp lệ. Vui lòng tải lại trang.' };

    var snapRes = await supabaseClient
        .from('billing_snapshots')
        .select('id, group_class_id, student_id, period_start, period_end, total_amount, billable_session_count, generated_at')
        .eq('id', billingSnapshotId)
        .maybeSingle();
    if (snapRes.error || !snapRes.data) throw { userMessage: 'Không tìm thấy hóa đơn (billing snapshot).' };
    var snapshot = snapRes.data;
    if (snapshot.group_class_id !== groupClassId) throw { userMessage: 'Hóa đơn không khớp với Group Class đang mở.' };
    if (snapshot.student_id !== studentId) throw { userMessage: 'Hóa đơn không khớp với học sinh đang mở.' };

    // Ownership: group_classes -> tutor hiện tại (defense-in-depth, RLS billing_snapshots đã đúng
    // nhưng vẫn KHÔNG trust riêng RLS, đúng convention billing-payment.js).
    var gcRes = await supabaseClient.from('group_classes').select('id, name, tutor_id').eq('id', groupClassId).maybeSingle();
    if (gcRes.error || !gcRes.data) throw { userMessage: 'Không tìm thấy Group Class.' };
    if (gcRes.data.tutor_id !== activeTutorId) throw { userMessage: 'Group Class này không thuộc quyền quản lý của bạn.' };

    var stRes = await supabaseClient.from('students').select('id, name, subject, parent_name, parent_phone, tutor_id').eq('id', studentId).maybeSingle();
    if (stRes.error || !stRes.data) throw { userMessage: 'Không tìm thấy học sinh.' };
    if (stRes.data.tutor_id !== activeTutorId) throw { userMessage: 'Học sinh này không thuộc quyền quản lý của bạn.' };

    var itemsRes = await supabaseClient
        .from('billing_snapshot_items')
        .select('id, scheduled_date, class_rate, amount')
        .eq('billing_snapshot_id', billingSnapshotId)
        .order('scheduled_date', { ascending: true });
    if (itemsRes.error) throw { userMessage: 'Không tải được chi tiết hóa đơn.\n' + describeSupabaseError(itemsRes.error) };

    // Payment aggregation — CHỈ theo ĐÚNG billing_snapshot_id này (Phase 5 đề bài: không cộng
    // payment của 1-to-1/Group Class khác/snapshot khác — filter theo billing_snapshot_id đã tự
    // đảm bảo điều này, giống hệt renderInvoiceView() ở billing-payment.js).
    var payRes = await supabaseClient.from('payments').select('amount, status').eq('billing_snapshot_id', billingSnapshotId);
    if (payRes.error) throw { userMessage: 'Không tải được lịch sử thanh toán của hóa đơn.\n' + describeSupabaseError(payRes.error) };
    var collected = (payRes.data || []).reduce(function(sum, p) {
        if (p.status === 'paid' || p.status === 'partial') return sum + (Number(p.amount) || 0);
        return sum;
    }, 0);
    var remaining = Math.max(0, Number(snapshot.total_amount) - collected);

    return {
        snapshot: snapshot,
        groupClassName: gcRes.data.name,
        student: stRes.data,
        items: itemsRes.data || [],
        collected: collected,
        remaining: remaining
    };
}

// ----------------------------------------------------------------------
// BUILD HTML — Group Class Invoice ĐỘC LẬP hoàn toàn với buildInvoiceHtml() 1-to-1 (Phase 7 đề
// bài). KHÔNG đọc students.rate/enrollment.class_rate hiện tại — CHỈ đọc payload từ snapshot/items
// (Phase 2/6 đề bài — "Snapshot là historical source of truth").
// ----------------------------------------------------------------------
function buildGroupClassInvoiceHtml(payload) {
    var snapshot = payload.snapshot;
    var student = payload.student;
    var monthLabel = _giMonthLabelFromPeriodStart(snapshot.period_start);
    var now = new Date();
    var invoiceNum = 'INV-GC-' + String(snapshot.period_start).slice(0, 7).replace('-', '') + '-' + String(snapshot.id).slice(-4);

    // Tutor identity — xem PHASE 1 AUDIT mục (5) ở đầu file.
    var tutorName = (typeof currentTutor !== 'undefined' && currentTutor && currentTutor.display_name)
        || ((typeof getUsers === 'function' && typeof currentUser !== 'undefined') ? (getUsers()[currentUser] || {}).displayName : null)
        || (typeof currentUser !== 'undefined' ? currentUser : null)
        || 'Gia sư';
    var tutorPhone = (typeof currentTutor !== 'undefined' && currentTutor && currentTutor.phone) || '';
    var qrInfo = (typeof getUsers === 'function' && typeof currentUser !== 'undefined') ? ((getUsers()[currentUser] || {}).qrInfo || null) : null;

    var itemRows = (payload.items || []).map(function(it, idx) {
        return '<tr>' +
            '<td style="padding:8px 10px;border:1px solid #f0f0f0;color:#9ca3af;font-size:12px;">' + (idx + 1) + '</td>' +
            '<td style="padding:8px 10px;border:1px solid #f0f0f0;color:#374151;font-size:13px;">' + escapeHtml(formatDate(it.scheduled_date)) + '</td>' +
            '<td style="padding:8px 10px;border:1px solid #f0f0f0;color:#374151;font-size:13px;text-align:right;">' + Number(it.class_rate).toLocaleString('vi-VN') + ' đ</td>' +
            '<td style="padding:8px 10px;border:1px solid #f0f0f0;color:#111827;font-size:13px;font-weight:700;text-align:right;">' + Number(it.amount).toLocaleString('vi-VN') + ' đ</td>' +
            '</tr>';
    }).join('');

    var qrHtml = '';
    if (qrInfo && payload.remaining > 0) {
        var bankNames = { '970415': 'VietinBank', '970436': 'Vietcombank', '970418': 'BIDV', '970422': 'MB Bank', '970426': 'TPBank', '970432': 'VPBank', '970407': 'Techcombank', '970416': 'ACB', '970405': 'Agribank', '970423': 'Sacombank', '970403': 'SHB', '970448': 'OCB' };
        if (qrInfo.type === 'image' && qrInfo.imageData) {
            qrHtml = '<div style="margin-top:24px;padding:26px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;text-align:center;">'
                + '<div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:16px;">💳 Quét mã QR để thanh toán học phí</div>'
                + '<img src="' + qrInfo.imageData + '" style="max-width:280px;max-height:280px;width:100%;border-radius:10px;border:1px solid #bbf7d0;">'
                + '<div style="font-size:15px;font-weight:700;color:#059669;margin-top:14px;">' + Number(payload.remaining).toLocaleString('vi-VN') + ' đ</div>'
                + '</div>';
        } else if (qrInfo.type === 'vietqr' && qrInfo.account) {
            var desc = 'Hoc phi ' + String(student.name || '').replace(/\s/g, '') + ' ' + monthLabel.replace(/\s/g, '');
            var qrUrl = 'https://img.vietqr.io/image/' + qrInfo.bank + '-' + qrInfo.account + '-compact2.png?amount=' + payload.remaining + '&addInfo=' + encodeURIComponent(desc) + '&accountName=' + encodeURIComponent(qrInfo.name);
            qrHtml = '<div style="margin-top:24px;padding:26px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center;">'
                + '<img src="' + qrUrl + '" crossorigin="anonymous" style="width:240px;height:240px;border-radius:8px;flex-shrink:0;" onerror="this.parentNode.style.display=\'none\'">'
                + '<div><div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:8px;">💳 Thanh toán chuyển khoản</div>'
                + '<div style="font-size:13px;color:#374151;line-height:2.1;">'
                + '<strong>' + (bankNames[qrInfo.bank] || qrInfo.bank) + '</strong><br>'
                + 'STK: <strong>' + qrInfo.account + '</strong><br>'
                + 'Chủ TK: <strong>' + qrInfo.name + '</strong><br>'
                + 'Số tiền còn thu: <strong style="color:#059669;font-size:16px;">' + Number(payload.remaining).toLocaleString('vi-VN') + ' đ</strong>'
                + '</div></div></div>';
        }
    }

    var paid = payload.remaining <= 0;

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        + '<title>Hóa đơn ' + monthLabel + ' – ' + escapeHtml(student.name || '') + ' (' + escapeHtml(payload.groupClassName || '') + ')</title>'
        + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
        + '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Inter,sans-serif;background:#f8fafc;color:#1a1a2e;padding:32px;}.page{max-width:720px;margin:0 auto;}.inv-header{background:linear-gradient(135deg,#4f46e5,#4338ca);border-radius:16px 16px 0 0;padding:32px 36px;display:flex;justify-content:space-between;align-items:flex-start;}.inv-logo span{font-size:12px;color:rgba(255,255,255,0.65);}.inv-logo strong{display:block;font-size:20px;color:#fff;font-weight:800;}.inv-num span{font-size:11px;color:rgba(255,255,255,0.65);text-align:right;display:block;}.inv-num strong{display:block;font-size:18px;color:#fff;font-weight:700;text-align:right;}.inv-body{background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px 36px;}.freeze-note{font-size:11.5px;color:#6b7280;background:#f9fafb;border:1px dashed #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:20px;line-height:1.6;}.inv-meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #f3f4f6;}.meta-block .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:5px;}.meta-block .val{font-size:14px;font-weight:700;color:#111827;}.meta-block .sub{font-size:12px;color:#6b7280;margin-top:2px;}.summary-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;}.sum-card{background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:12px;}.sum-card .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;margin-bottom:6px;}.sum-card .val{font-size:18px;font-weight:800;}table{width:100%;border-collapse:collapse;}th{padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border:1px solid #f0f0f0;}.total-row{padding:14px 36px;background:#eef2ff;border-top:2px solid #6366f1;display:flex;justify-content:space-between;align-items:center;margin-top:14px;border-radius:0 0 10px 10px;}.status-badge{display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;}.badge-g{background:#d1fae5;color:#065f46;}.badge-r{background:#fee2e2;color:#991b1b;}.footer{margin-top:20px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.8;}@media print{body{padding:0;background:#fff;}}</style>'
        + '</head><body><div class="page">'
        + '<div class="inv-header"><div class="inv-logo"><span>Group Class · Gia sư chuyên nghiệp</span><strong>' + escapeHtml(tutorName) + '</strong>' + (tutorPhone ? ('<span style="margin-top:4px;">' + escapeHtml(tutorPhone) + '</span>') : '') + '</div><div class="inv-num"><span>Số hóa đơn</span><strong>' + invoiceNum + '</strong></div></div>'
        + '<div class="inv-body">'
        + '<div class="freeze-note">📌 Hóa đơn này được tạo dựa trên dữ liệu điểm danh đã CHỐT lúc ' + escapeHtml(new Date(snapshot.generated_at).toLocaleString('vi-VN')) + '. Số tiền KHÔNG thay đổi dù lịch học, điểm danh hoặc học phí lớp có được cập nhật sau đó.</div>'
        + '<div class="inv-meta">'
        + '<div class="meta-block"><div class="lbl">Học sinh</div><div class="val">' + escapeHtml(student.name || '') + '</div><div class="sub">' + escapeHtml(student.subject || '') + '</div></div>'
        + '<div class="meta-block"><div class="lbl">Kỳ thanh toán</div><div class="val">' + monthLabel + '</div><div class="sub">Xuất ngày: ' + now.toLocaleDateString('vi-VN') + '</div></div>'
        + '<div class="meta-block"><div class="lbl">Group Class</div><div class="val">' + escapeHtml(payload.groupClassName || '') + '</div></div>'
        + '<div class="meta-block"><div class="lbl">Phụ huynh</div><div class="val" style="font-size:13px;">' + escapeHtml(student.parent_name || '—') + '</div>' + (student.parent_phone ? ('<div class="sub">' + escapeHtml(student.parent_phone) + '</div>') : '') + '</div>'
        + '</div>'
        + '<div class="summary-row">'
        + '<div class="sum-card"><div class="lbl">Số buổi tính phí</div><div class="val" style="color:#4f46e5;">' + Number(snapshot.billable_session_count) + '</div></div>'
        + '<div class="sum-card"><div class="lbl">Tổng cộng</div><div class="val" style="color:#111827;">' + Number(snapshot.total_amount).toLocaleString('vi-VN') + ' đ</div></div>'
        + '<div class="sum-card"><div class="lbl">Đã thu</div><div class="val" style="color:#059669;">' + Number(payload.collected).toLocaleString('vi-VN') + ' đ</div></div>'
        + '<div class="sum-card"><div class="lbl">Trạng thái</div><div class="val" style="font-size:13px;margin-top:4px;"><span class="status-badge ' + (paid ? 'badge-g' : 'badge-r') + '">' + (paid ? '✓ Đã thu đủ' : '✗ Còn ' + Number(payload.remaining).toLocaleString('vi-VN') + ' đ') + '</span></div></div>'
        + '</div>'
        + '<table><thead><tr><th>STT</th><th>Ngày</th><th style="text-align:right;">Học phí/buổi</th><th style="text-align:right;">Thành tiền</th></tr></thead>'
        + '<tbody>' + (itemRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;border:1px solid #f0f0f0;">Không có buổi học nào trong hóa đơn này</td></tr>') + '</tbody></table>'
        + '<div class="total-row"><span style="font-size:14px;font-weight:700;color:#3730a3;">TỔNG ' + monthLabel.toUpperCase() + '</span><span style="font-size:24px;font-weight:800;color:#4f46e5;">' + Number(snapshot.total_amount).toLocaleString('vi-VN') + ' đ</span></div>'
        + qrHtml
        + '</div>'
        + '<div class="footer">' + escapeHtml(tutorName) + ' · Hóa đơn Group Class tự động · ' + now.toLocaleString('vi-VN') + '</div>'
        + '</div></bo' + '' + 'dy></ht' + '' + 'ml>';

    return { html: html, filenameBase: 'HoaDon_GroupClass_' + String(student.name || '').replace(/\s+/g, '_') + '_' + String(snapshot.period_start).slice(0, 7) };
}

// ----------------------------------------------------------------------
// "Xem hóa đơn" — mở tab mới (blob URL), tutor có thể xem/in (Ctrl+P -> Save as PDF, KHÔNG cần
// thư viện PDF mới, đúng Phase 9 đề bài).
// ----------------------------------------------------------------------
async function gcOpenInvoicePreview(groupClassId, studentId, billingSnapshotId) {
    if (gcInvoiceInFlight) return;
    gcInvoiceInFlight = true;
    try {
        var payload = await _giLoadInvoicePayload(groupClassId, studentId, billingSnapshotId);
        var result = buildGroupClassInvoiceHtml(payload);
        var blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var win = window.open(url, '_blank');
        if (!win) {
            showToast('⚠️', 'Trình duyệt đã chặn cửa sổ mới', 'Vui lòng cho phép popup rồi thử lại.', 4000);
        }
    } catch (err) {
        var msg = (err && err.userMessage) ? err.userMessage : 'Lỗi không xác định khi tạo hóa đơn.';
        if (!(err && err.userMessage)) console.error('[GROUP CLASS INVOICE] gcOpenInvoicePreview EXCEPTION:', err);
        showToast('⚠️', 'Không xem được hóa đơn', msg, 4000);
    } finally {
        gcInvoiceInFlight = false;
    }
}

// ----------------------------------------------------------------------
// "Tải ảnh hóa đơn" — tái sử dụng ĐỘC LẬP kỹ thuật iframe-ẩn + html2canvas (xem PHASE 1 AUDIT mục
// (4) ở đầu file) — KHÔNG gọi exportInvoiceAsImage() 1-to-1, KHÔNG thêm dependency mới.
// ----------------------------------------------------------------------
async function gcExportInvoiceImage(groupClassId, studentId, billingSnapshotId) {
    if (gcInvoiceInFlight) return;
    gcInvoiceInFlight = true;
    try {
        var payload = await _giLoadInvoicePayload(groupClassId, studentId, billingSnapshotId);
        var result = buildGroupClassInvoiceHtml(payload);

        if (typeof html2canvas === 'undefined') {
            showToast('⚠️', 'Không thể tạo ảnh', 'Vui lòng kiểm tra kết nối mạng rồi thử lại.', 4000);
            gcInvoiceInFlight = false;
            return;
        }

        showToast('⏳', 'Đang tạo ảnh hóa đơn...', 'Vui lòng đợi trong giây lát.', 2000);

        var iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-99999px';
        iframe.style.top = '0';
        iframe.style.width = '760px';
        iframe.style.height = '1200px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        iframe.srcdoc = result.html;

        iframe.onload = function() {
            setTimeout(function() {
                var doc = iframe.contentDocument;
                var pageEl = doc.querySelector('.page');
                var target = pageEl || doc.body;
                var fullHeight = Math.max(target.scrollHeight, doc.body.scrollHeight);
                iframe.style.height = fullHeight + 'px';

                html2canvas(target, { scale: 2, backgroundColor: '#f8fafc', useCORS: true, allowTaint: false, logging: false })
                    .then(function(canvas) {
                        canvas.toBlob(function(blob) {
                            document.body.removeChild(iframe);
                            gcInvoiceInFlight = false;
                            if (!blob) {
                                showToast('⚠️', 'Tạo ảnh thất bại', 'Hãy thử dùng nút "Xem hóa đơn" (HTML) thay thế.', 4000);
                                return;
                            }
                            var a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = result.filenameBase + '.png';
                            a.click();
                            showToast('🖼️', 'Tải ảnh hóa đơn thành công', 'Ảnh PNG đã tải về máy.', 2500);
                        }, 'image/png');
                    })
                    .catch(function(err) {
                        document.body.removeChild(iframe);
                        gcInvoiceInFlight = false;
                        console.error('[GROUP CLASS INVOICE] gcExportInvoiceImage html2canvas EXCEPTION:', err);
                        showToast('⚠️', 'Tạo ảnh thất bại', 'Hãy thử dùng nút "Xem hóa đơn" (HTML) thay thế.', 4000);
                    });
            }, 400);
        };
    } catch (err) {
        gcInvoiceInFlight = false;
        var msg = (err && err.userMessage) ? err.userMessage : 'Lỗi không xác định khi tạo hóa đơn.';
        if (!(err && err.userMessage)) console.error('[GROUP CLASS INVOICE] gcExportInvoiceImage EXCEPTION:', err);
        showToast('⚠️', 'Không tạo được ảnh hóa đơn', msg, 4000);
    }
}

// ============================================================================
// EXPOSE QUA WINDOW (cùng convention mọi module Group Class khác).
// ============================================================================
export { gcOpenInvoicePreview, gcExportInvoiceImage };

window.gcOpenInvoicePreview = gcOpenInvoicePreview;
window.gcExportInvoiceImage = gcExportInvoiceImage;
