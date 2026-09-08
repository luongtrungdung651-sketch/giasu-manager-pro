// ============================================================================
// js/group-class/session.js  —  STEP 11G-B: GROUP SESSION LIST + CREATE
// ============================================================================
// Đây là ES module thật (cùng convention js/group-class/group-class.js/
// js/group-class/enrollment.js — xem comment trong index.html tại vị trí nạp module này).
// Module này tự expose các hàm cần thiết qua window ở cuối file để (a) onclick="..."/
// onchange="..." trong HTML gọi được, và (b) group-class.js (switchGroupClassTab) gọi lại qua
// window.loadGroupSessionsIfNeeded.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js/group-class.js định nghĩa
// (activeTutorId, activeGroupClassId, groupClassList, supabaseClient, escapeHtml, showToast,
// describeSupabaseError, formatDate). Module này KHÔNG import group-class.js (tránh circular
// dependency — group-class.js gọi ngược lại module này qua window.* trong switchGroupClassTab(),
// cùng lý do enrollment.js không import group-class.js) và KHÔNG import enrollment.js (2 module
// ngang hàng, không phụ thuộc lẫn nhau). Cùng lý do defer/module với các module khác: module bị
// hoãn, chạy SAU khi script chính đã chạy xong, và group-class.js LUÔN load TRƯỚC session.js (xem
// thứ tự <script type="module"> trong index.html) nên tại thời điểm các hàm dưới đây THỰC SỰ
// được gọi (người dùng mở tab "Buổi học"/bấm nút), mọi global trên đã tồn tại.
//
// PHẠM VI STEP 11G-B (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN):
//   1. Group Session List (load/render theo scheduled_date ASC, start_time ASC).
//   2. Create Group Session (modal + INSERT, status LUÔN 'scheduled', KHÔNG cho chọn).
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (để dành cho step sau — KHÔNG code ở đây dù chỉ 1 dòng):
//   - Edit Session / đổi status lifecycle (completed/cancelled) — STEP 11G-C.
//   - Cancel/Delete Session dưới bất kỳ hình thức nào.
//   - Attendance / Attendance Matrix.
//   - Calendar integration.
//   - Overview KPI thật (Tổng buổi/Đã hoàn thành) — group-class.js vẫn tiếp tục hiển thị
//     placeholder tĩnh cho các KPI đó, module này KHÔNG tự ý nối dữ liệu vào đó.
//
// STEP 11G-C2-D — GHI ĐÈ 1 DÒNG DUY NHẤT ở renderGroupSessions(): STEP 11G-B2-A-FIX-2 (mục 4)
// từng lọc danh sách hiển thị CHỈ còn session_type='makeup' vì tại thời điểm đó Generator (STEP
// 11G-C2-B) chưa tồn tại nên KHÔNG có buổi 'regular' nào để hiển thị có ý nghĩa. Giờ Generator đã
// materialize buổi 'regular' thật vào group_sessions, filter đó khiến các buổi CHÍNH (từ Lịch học
// hàng tuần) bị ẩn hoàn toàn khỏi Sessions UI — đây là BUG hiển thị, KHÔNG phải business rule cố
// ý. STEP NÀY gỡ filter đó: danh sách hiển thị LẠI TOÀN BỘ group_sessions của activeGroupClassId
// (cả 'regular' lẫn 'makeup'), phân biệt bằng badge session_type (buildGroupSessionTypeBadgeHtml,
// đã có sẵn từ STEP 11G-B nhưng CHƯA từng được gọi ở đâu — nay mới dùng tới). KHÔNG đổi CÂU QUERY
// (loadGroupSessions() vốn đã KHÔNG lọc session_type ở Supabase — filter chỉ nằm ở client-side
// render, xem BƯỚC audit trong STEP_11G-C2-D_REPORT.md), KHÔNG đổi flow tạo buổi bù
// (submitCreateSession() nguyên vẹn, vẫn CHỈ tạo được qua modal 'add-group-session-modal' có sẵn,
// KHÔNG có đường nào trong file này tự ý insert session_type='regular' — đó là việc riêng của
// Generator, xem js/group-class/generator.js, KHÔNG đụng ở đây).
//
// NO HARD DELETE (STEP 11G-A mục 7/19 — bắt buộc đọc trước khi thêm bất kỳ hàm nào vào file
// này): attendance.session_id có FK ON DELETE CASCADE tới group_sessions — hard-delete 1
// group_sessions sẽ xóa vĩnh viễn toàn bộ attendance đã điểm danh của buổi đó, không thể hoàn
// tác. RLS hiện tại VẪN cho phép Tutor gọi .delete() trực tiếp (kỹ thuật không bị chặn ở tầng
// DB) — vì vậy "không có nút xóa" CHỦ Ý là quy ước tầng UI: module này TUYỆT ĐỐI KHÔNG được viết
// bất kỳ hàm nào gọi supabaseClient.from('group_sessions').delete(...). STEP 11G-B chỉ có
// Create — không có Cancel/Delete nào cả, nên ràng buộc này hiện tại tự động được giữ.
// ============================================================================

// ----------------------------------------------------------------------
// STATE (chỉ dùng trong module này — cùng convention gcEnrollmentListCache/
// gcEnrollmentListLoadedForClassId của enrollment.js: cache CONTEXT-AWARE theo
// activeGroupClassId, KHÔNG dùng boolean trần kiểu "groupSessionsLoaded = true" — tránh tái tạo
// bug hiển thị nhầm cache của lớp trước đó khi chuyển Group Class A -> B, hoặc Admin chuyển
// Tutor A -> B).
// ----------------------------------------------------------------------
var gcSessionListCache = [];
var gcSessionListLoadedForClassId = null;

// Guard chống double-submit — cùng pattern addEnrollmentInFlight (enrollment.js),
// addGroupClassInFlight (group-class.js).
var addGroupSessionInFlight = false;

// Session-specific status/type metadata — KHÔNG tái dùng lessonStatusMeta/groupClassStatusMeta
// (khác domain: đây là group_sessions.status, CHECK IN ('scheduled','completed','cancelled') —
// khác tập giá trị của lessons.status và group_classes.status dù có tên trùng 'completed').
var groupSessionStatusMeta = {
    scheduled: { label: 'Đã lên lịch', color: '#38bdf8' },
    completed: { label: 'Đã hoàn thành', color: '#10b981' },
    cancelled: { label: 'Đã hủy', color: '#ef4444' }
};
// STEP 11G-C2-D: nhãn thêm icon (📘/🔄) để phân biệt Buổi định kỳ (sinh tự động bởi Generator từ
// Lịch học hàng tuần) với Buổi học bù (tạo thủ công) NGAY TRONG badge, không cần thêm cột/thành
// phần UI mới — tái dùng NGUYÊN class .sched-tag đã có (style.css), KHÔNG tạo CSS mới.
var groupSessionTypeMeta = {
    regular: { label: '📘 Định kỳ', color: '#8b5cf6' },
    makeup: { label: '🔄 Học bù', color: '#f59e0b' }
};

function buildGroupSessionStatusBadgeHtml(status) {
    var meta = groupSessionStatusMeta[status] || groupSessionStatusMeta.scheduled;
    return '<span class="sched-tag" style="background:rgba(0,0,0,0); color:' + meta.color + '; border-color:' + meta.color + '33;">' + escapeHtml(meta.label) + '</span>';
}

function buildGroupSessionTypeBadgeHtml(sessionType) {
    var meta = groupSessionTypeMeta[sessionType] || groupSessionTypeMeta.regular;
    return '<span class="sched-tag" style="background:rgba(0,0,0,0); color:' + meta.color + '; border-color:' + meta.color + '33;">' + escapeHtml(meta.label) + '</span>';
}

// ----------------------------------------------------------------------
// LOAD (context-aware theo activeGroupClassId) + RENDER LIST TAB "BUỔI HỌC"
// ----------------------------------------------------------------------
// Được gọi từ switchGroupClassTab('sessions') (group-class.js) mỗi lần vào tab. Chỉ tái dùng
// cache khi cache đó THỰC SỰ thuộc về activeGroupClassId hiện tại — nếu vừa chuyển Group Class A
// -> B (activeGroupClassId đổi), điều kiện tự động false và bắt buộc query lại Supabase cho đúng
// lớp mới, KHÔNG bao giờ render nhầm cache của lớp trước đó (STEP 11G-A mục 17 test 8, đề bài
// mục XX/XXVI test 8).
async function loadGroupSessionsIfNeeded() {
    if (gcSessionListLoadedForClassId === activeGroupClassId) {
        renderGroupSessions();
        return;
    }
    await loadGroupSessions();
}

async function loadGroupSessions() {
    var container = document.getElementById('gc-session-list');
    if (!activeGroupClassId) return;

    if (container) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px; font-size:14px;">⏳ Đang tải buổi học...</div>';
    }

    try {
        // group_class_id = activeGroupClassId đã tự động chỉ trả về đúng lớp thuộc activeTutorId
        // đang active (RLS Tutor scope qua group_classes -> tutors chain, xem STEP 11G-A mục 2/14)
        // — không cần lọc lại tutor_id ở đây, cùng convention loadEnrollments() (enrollment.js).
        var result = await supabaseClient
            .from('group_sessions')
            .select('id, group_class_id, scheduled_date, start_time, duration, status, session_type, notes, created_at')
            .eq('group_class_id', activeGroupClassId)
            .order('scheduled_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (result.error) {
            console.error('[GROUP SESSION] Tải danh sách buổi học FAILED:', result.error);
            if (container) {
                container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được danh sách buổi học.<br>' + escapeHtml(describeSupabaseError(result.error)) + '</div>';
            }
            return;
        }

        gcSessionListCache = result.data || [];
        gcSessionListLoadedForClassId = activeGroupClassId;
        renderGroupSessions();
    } catch (err) {
        console.error('[GROUP SESSION] Tải danh sách buổi học EXCEPTION:', err);
        if (container) {
            container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Lỗi không xác định khi tải danh sách buổi học.</div>';
        }
    }
}

// STEP 11G-C2-D: hiển thị TOÀN BỘ group_sessions (cả 'regular' lẫn 'makeup') — thêm badge
// session_type (buildGroupSessionTypeBadgeHtml) CẠNH badge status hiện có để phân biệt rõ "buổi
// định kỳ" (Generator sinh tự động từ Lịch học hàng tuần) với "buổi học bù" (tạo thủ công qua
// modal bên dưới). Vẫn chỉ hiển thị compact, read-only — KHÔNG thêm action Sửa/Hủy/Xem chi tiết
// (giữ nguyên hành vi STEP 11G-B: codebase hiện KHÔNG có modal/view chi tiết buổi học nào để tái
// dùng cho cả 2 loại, thêm mới sẽ là redesign, ngoài phạm vi STEP 11G-C2-D — xem mục 10 đề bài).
function buildCompactGroupSessionRowHtml(gs) {
    var d = new Date(gs.scheduled_date + 'T00:00:00');
    var shortDate = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    var timeStr = escapeHtml(String(gs.start_time || '').slice(0, 5));
    var noteHtml = gs.notes
        ? ' · <span style="color:var(--text-sub);">' + escapeHtml(gs.notes) + '</span>'
        : '';
    return '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 0; border-top:1px solid var(--border-color); font-size:12.5px; flex-wrap:wrap;">' +
            '<div style="color:var(--text-main); font-weight:600;">' + escapeHtml(shortDate) + ' · ' + timeStr + ' · ' + Number(gs.duration) + 'p' + noteHtml + '</div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">' +
                buildGroupSessionTypeBadgeHtml(gs.session_type) +
                buildGroupSessionStatusBadgeHtml(gs.status) +
            '</div>' +
        '</div>';
    // STEP 11G-B CHỦ Ý không có action Sửa/Hủy/Xem chi tiết trên từng dòng (dành cho STEP 11G-C
    // — codebase hiện KHÔNG có modal/view chi tiết buổi học nào để tái dùng, thêm mới sẽ là
    // redesign kiến trúc tạo buổi học, đề bài mục 6/9 cấm). Danh sách chỉ hiển thị compact.
}

// STEP 11G-C2-D: gỡ filter session_type==='makeup' (bug hiển thị từ 11G-B2-A-FIX-2, xem comment
// đầu file) — hiển thị NGUYÊN gcSessionListCache. Cache này đã được sắp xếp scheduled_date ASC,
// start_time ASC NGAY TỪ CÂU QUERY (loadGroupSessions(), .order() x2) — KHÔNG cần sort lại ở
// client (mục 11 đề bài: "If the existing query already provides correct ordering, preserve it").
function renderGroupSessions() {
    var container = document.getElementById('gc-session-list');
    if (!container) return;

    if (gcSessionListCache.length === 0) {
        // STEP 11G-C2-D mục 8 đề bài: empty state KHÔNG được ngụ ý "không có buổi học" chỉ vì
        // không có buổi HỌC BÙ — đổi từ "Chưa có buổi học bù nào." (dễ hiểu lầm khi thực ra có
        // buổi định kỳ nhưng UI cũ lọc mất) sang "Chưa có buổi học nào." (đúng với thực tế: danh
        // sách này giờ là TOÀN BỘ group_sessions). Vẫn giữ nguyên style siêu nhỏ gọn của STEP
        // 11G-B2-A-FIX-2 mục 2 (~50-70px, KHÔNG center dọc, KHÔNG padding lớn, KHÔNG <br>, KHÔNG
        // lặp lại nút CTA — nút "+ Thêm buổi bù" cố định ngay phía trên đã đủ dùng).
        container.innerHTML = '<div style="color:#9ca3af; text-align:left; padding:2px 0; font-size:12.5px;">Chưa có buổi học nào.</div>';
        return;
    }

    container.innerHTML = gcSessionListCache.map(buildCompactGroupSessionRowHtml).join('');
}

// ----------------------------------------------------------------------
// CREATE MODAL — status LUÔN 'scheduled' khi tạo (mục XIV đề bài, KHÔNG cho user chọn)
// ----------------------------------------------------------------------
function openCreateSessionModal() {
    if (!activeGroupClassId) return;

    var gc = (groupClassList || []).find(function(x) { return x.id === activeGroupClassId; });
    var nameEl = document.getElementById('acs-group-class-name');
    if (nameEl) nameEl.innerText = gc ? gc.name : '';

    document.getElementById('acs-date').value = '';
    document.getElementById('acs-start-time').value = '';
    document.getElementById('acs-duration').value = '';
    // STEP 11G-B2-A-FIX-2 mục 6: nút gọi hàm này giờ CHỈ còn "+ Thêm buổi bù" (khối "Buổi học
    // bù"), nên mặc định chọn sẵn 'makeup' — vẫn KHÔNG xoá option 'Buổi thường' khỏi <select>
    // (giữ nguyên modal/kiến trúc tạo buổi học có sẵn, đề bài mục 6/9 cấm sửa/tạo modal mới),
    // người dùng vẫn có thể tự đổi lại nếu thật sự cần.
    document.getElementById('acs-session-type').value = 'makeup';
    document.getElementById('acs-notes').value = '';

    var errBox = document.getElementById('add-group-session-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    document.getElementById('add-group-session-modal').classList.add('open');
}

function closeCreateSessionModal() {
    var modal = document.getElementById('add-group-session-modal');
    if (modal) modal.classList.remove('open');
}

async function submitCreateSession() {
    if (!activeGroupClassId) return;

    var errBox = document.getElementById('add-group-session-error');
    function showModalError(msg) {
        if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
        else { alert(msg); }
    }

    var dateVal = document.getElementById('acs-date').value;
    var startTimeVal = document.getElementById('acs-start-time').value;
    var durationRaw = document.getElementById('acs-duration').value;
    var sessionType = document.getElementById('acs-session-type').value;
    var notes = document.getElementById('acs-notes').value.trim();

    // Mục X/XI đề bài: KHÔNG tạo date-picker/timezone architecture mới — <input type="date">/
    // <input type="time"> đã trả sẵn đúng format PostgREST chấp nhận (YYYY-MM-DD / HH:MM), cùng
    // cách project đang dùng cho public.lessons/student_schedules (xem STEP 11G-A mục 9).
    if (!dateVal) { showModalError('Vui lòng chọn Ngày học.'); return; }
    if (!startTimeVal) { showModalError('Vui lòng chọn Giờ bắt đầu.'); return; }

    // Mục XII: validate duration ở CLIENT — numeric, > 0. STEP 11G-A mục 2/19 đã xác nhận cột
    // group_sessions.duration trên live DB là NUMERIC (không phải INTEGER như đề bài giả định) —
    // DB không tự chặn số thập phân, nên phải ép số nguyên phút ở đây (input có step="1" nhưng
    // vẫn parse lại phòng trường hợp trình duyệt/dán giá trị thập phân).
    var duration = parseInt(durationRaw, 10);
    if (!durationRaw || isNaN(duration) || duration <= 0 || String(duration) !== String(durationRaw).trim()) {
        showModalError('Thời lượng phải là số nguyên phút lớn hơn 0.');
        return;
    }

    if (['regular', 'makeup'].indexOf(sessionType) === -1) {
        showModalError('Loại buổi không hợp lệ.');
        return;
    }

    // Mục XVII: guard chống double-submit — cùng pattern addEnrollmentInFlight (enrollment.js).
    if (addGroupSessionInFlight) return;
    addGroupSessionInFlight = true;
    var confirmBtn = document.getElementById('confirm-add-group-session-btn');
    var confirmBtnOrigText = confirmBtn ? confirmBtn.innerText : null;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = 'Đang lưu...'; }

    try {
        // Mục XIV/XVI: KHÔNG gửi status (dùng đúng DEFAULT 'scheduled' của group_sessions.status
        // ở DB, cùng convention addNewGroupClass() không tự gửi status='active') — và KHÔNG gửi
        // tutor_id (bảng này vốn không có cột đó, ownership qua group_class_id).
        var insertResult = await supabaseClient
            .from('group_sessions')
            .insert({
                group_class_id: activeGroupClassId,
                scheduled_date: dateVal,
                start_time: startTimeVal,
                duration: duration,
                session_type: sessionType,
                notes: notes || null
            })
            .select()
            .single();

        if (insertResult.error || !insertResult.data) {
            console.error('[GROUP SESSION] Tạo buổi học FAILED:', insertResult.error);
            showModalError('⚠️ Không thể tạo buổi học: ' + (insertResult.error ? describeSupabaseError(insertResult.error) : 'không nhận được dữ liệu trả về'));
            return; // Mục XIX: KHÔNG đóng modal, giữ input để retry.
        }

        showToast('✅', 'Đã thêm buổi học', formatDate(insertResult.data.scheduled_date));
        closeCreateSessionModal();
        await loadGroupSessions(); // Mục XVIII: refresh danh sách từ Supabase, KHÔNG tự suy luận thêm vào cache.
    } catch (err) {
        console.error('[GROUP SESSION] Tạo buổi học EXCEPTION:', err);
        showModalError('⚠️ Lỗi không xác định khi tạo buổi học.');
    } finally {
        addGroupSessionInFlight = false;
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = confirmBtnOrigText; }
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention group-class.js/enrollment.js mục "HTML
// COMPATIBILITY") — chỉ export những entry point thực sự cần cho onclick trong HTML hoặc để
// group-class.js gọi lại (loadGroupSessionsIfNeeded).
// ============================================================================
export {
    loadGroupSessionsIfNeeded, loadGroupSessions, renderGroupSessions,
    openCreateSessionModal, closeCreateSessionModal, submitCreateSession
};

window.loadGroupSessionsIfNeeded = loadGroupSessionsIfNeeded;
window.openCreateSessionModal = openCreateSessionModal;
window.closeCreateSessionModal = closeCreateSessionModal;
window.submitCreateSession = submitCreateSession;
