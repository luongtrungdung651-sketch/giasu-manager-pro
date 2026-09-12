// ============================================================================
// js/group-class/group-class.js  —  STEP 11E: GROUP CLASS CRUD (SCOPE-LIMITED)
// ============================================================================
// Đây là ES module thật (cùng convention tách module với js/students/students.js,
// js/lessons/lessons.js, js/calendar/calendar.js — xem comment trong index.html tại vị trí
// nạp module này). Module này tự expose các hàm cần thiết qua window ở cuối file để (a) các
// onclick="..."/onchange="..."/oninput="..." trong HTML gọi được, và (b) script chính (classic
// script) có thể gọi lại nếu cần.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js định nghĩa (activeTutorId,
// supabaseClient, escapeHtml, showToast, describeSupabaseError, switchTutorPage,
// activeGroupClassId, gcCurrentTab, groupClassList). Module này KHÔNG import những thứ đó
// (cùng lý do với Students/Lessons/Calendar: module bị hoãn/defer, chạy SAU khi script chính đã
// chạy xong, nên tại thời điểm các hàm dưới đây THỰC SỰ được gọi, mọi global trên đã tồn tại).
//
// PHẠM VI STEP 11E (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN):
//   1. Group Class List (load/render/search/filter)
//   2. Create Group Class
//   3. Edit Group Class (tên/môn học/trạng thái)
//   4. Open Group Class Detail (shell: hero + KPI placeholder + 4 tab)
//   5. Group Class Overview (tab "Tổng quan" — nội dung thật DUY NHẤT trong Detail)
//   6. Search/filter Group Class
//   7. Status active/inactive/completed (qua Edit modal)
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (để dành cho step sau — KHÔNG code ở đây dù chỉ 1 dòng):
//   - Enrollment CRUD / group_class_enrollments UI (tab "Học viên" chỉ placeholder tĩnh)
//   - Group Session CRUD / group_sessions UI (tab "Buổi học" chỉ placeholder tĩnh)
//   - Attendance / Attendance Matrix (tab "Điểm danh" chỉ placeholder tĩnh)
//   - Bất kỳ query nào tới group_class_enrollments/group_sessions/attendance — KPI trong Detail
//     CHỦ Ý hiển thị giá trị an toàn tĩnh (0/"chưa có dữ liệu"), KHÔNG query 3 bảng trên chỉ để
//     lấp số liệu KPI (đúng yêu cầu "DO NOT query attendance/enrollment/payment tables merely to
//     populate future KPI").
//   - Calendar/Finance/Billing/Reports integration.
//   - Không có nút "Xóa lớp" (xem khối comment "NO HARD DELETE" ngay dưới).
//
// STEP 11F-B-FIX — GHI ĐÈ 1 DÒNG DUY NHẤT ở trên: Enrollment CRUD thật đã được triển khai ở
// js/group-class/enrollment.js (STEP 11F-B/11F-C, tab "Học viên"). STEP NÀY (11F-B-FIX) chỉ bổ
// sung phần "Sĩ số" (KPI card + dòng trong Overview) đọc lại đúng active enrollment count —
// group-class.js VẪN KHÔNG tự query group_class_enrollments (giữ nguyên nguyên tắc "no query chỉ
// để lấp KPI" ở trên): số liệu lấy qua 2 hàm ĐỌC window.getCachedActiveEnrollmentCount()/
// window.getActiveEnrollmentCount() do enrollment.js expose (xem
// refreshGroupClassOverviewEnrollmentCount() bên dưới) — CHỈ query Supabase khi cache của
// enrollment.js chưa có sẵn cho đúng lớp đang mở (ví dụ vừa mở Detail, chưa từng vào tab "Học
// viên" lần nào). Các KPI còn lại (Tổng buổi/Hoàn thành/Tỷ lệ chuyên cần/Doanh thu) TIẾP TỤC là
// placeholder tĩnh, KHÔNG đụng tới.
//
// STEP 11G-B — GHI ĐÈ 1 DÒNG DUY NHẤT ở mục "CHỦ Ý KHÔNG CÓ Ở STEP NÀY" phía trên: Group Session
// List + Create thật đã được triển khai ở js/group-class/session.js (tab "Buổi học") — xem
// switchGroupClassTab() bên dưới (nhánh gọi window.loadGroupSessionsIfNeeded). group-class.js VẪN
// KHÔNG tự query group_sessions (giữ nguyên nguyên tắc "không nhét toàn bộ Session logic vào
// group-class.js" — chỉ điều phối tab/entry point). Tab "Điểm danh" và Overview KPI (Tổng
// buổi/Hoàn thành) TIẾP TỤC là placeholder tĩnh, KHÔNG đụng tới ở STEP này.
//
// NO HARD DELETE (bắt buộc đọc trước khi sửa file này):
//   group_classes/group_class_enrollments/group_sessions/attendance dùng FK ON DELETE CASCADE
//   (STEP 11A/11A-FIX, đã apply STEP 11B — xem STEP_11A_DATABASE_SCHEMA_REPORT.md). Vòng đời lớp
//   trước STEP group-class-delete chỉ thay đổi qua trường "Trạng thái" (active/inactive/completed)
//   trong Edit modal, KHÔNG có nút xóa cứng, đúng như comment gốc ở đây.
//
// STEP group-class-delete — GHI ĐÈ ĐOẠN TRÊN: đã thêm nút "🗑️ Xóa lớp" (xem removeGroupClass()
// cuối file). ĐÃ XÁC NHẬN TRỰC TIẾP TRÊN SUPABASE (pg_constraint.confdeltype) trước khi viết hàm
// này — FK CASCADE ở DB vẫn y nguyên, KHÔNG hề sửa schema/migration:
//   group_class_enrollments.group_class_id -> group_classes: CASCADE
//   group_sessions.group_class_id          -> group_classes: CASCADE
//   group_class_schedules.group_class_id   -> group_classes: CASCADE
//   billing_snapshots.group_class_id       -> group_classes: CASCADE
//   attendance.session_id                  -> group_sessions: CASCADE
//   payments.group_class_id                -> group_classes: SET NULL (payment KHÔNG bị xóa)
//   session_reports.group_session_id       -> group_sessions: RESTRICT
// Vì CASCADE thật sự tồn tại ở DB, removeGroupClass() KHÔNG BAO GIỜ được phép gọi thẳng DELETE —
// bắt buộc tự đếm dữ liệu phụ thuộc ở tầng application TRƯỚC, và chỉ cho xóa thật khi tất cả = 0
// (xem removeGroupClass()). RLS "Tutors can delete own group classes" (tutor_id = tutor đang đăng
// nhập) và "Admins can manage all group classes" đã có sẵn, KHÔNG cần thêm policy nào.
//
// STEP group-class-delete-403-FIX — GHI ĐÈ ĐOẠN TRÊN: precheck THẬT SỰ chỉ còn
// enrollments/sessions/attendance (đếm thẳng bảng, Tutor có SELECT sẵn) +
// billing_snapshots (qua RPC boolean public.gc_has_billing_history(), KHÔNG select thẳng bảng vì
// Tutor không có GRANT SELECT trên billing_snapshots — đã xác nhận qua
// information_schema.role_table_grants). payments KHÔNG còn trong precheck (FK SET NULL, không
// mất dữ liệu khi xóa lớp). session_reports không precheck — FK RESTRICT ở DB tự chặn DELETE thật
// nếu còn sót (mã lỗi 23503), xử lý ở BƯỚC 2.
//
// STEP group-class-delete-SCHEDULES-NOT-HISTORY — GHI ĐÈ ĐOẠN TRÊN (quy tắc mới, đã áp dụng
// thật trong removeGroupClass() bên dưới): group_class_schedules KHÔNG PHẢI dữ liệu lịch sử —
// nó chỉ là cấu hình lịch lặp lại của lớp (thứ/giờ học), không phản ánh việc lớp đã từng diễn ra
// hay có học viên/điểm danh/học phí thật. Vì vậy:
//   - group_class_schedules bị BỎ KHỎI hasDependentData — KHÔNG còn dùng để chặn xóa.
//   - Một lớp mới tạo (có schedule nhưng chưa từng có enrollment/session/attendance/billing)
//     PHẢI xóa được, dù group_class_schedules còn row.
//   - Trước khi DELETE group_classes, removeGroupClass() tự xóa các row
//     group_class_schedules của đúng group_class_id đó (KHÔNG dựa vào FK CASCADE mới — FK
//     CASCADE hiện có trên group_class_schedules giữ nguyên như cũ, chỉ là ở đây ta chủ động xóa
//     trước cho rõ ràng và để phát hiện lỗi sớm nếu bước này thất bại).
//   - Nếu bước xóa schedules lỗi, DỪNG NGAY, KHÔNG gọi DELETE group_classes, KHÔNG báo "xóa
//     thành công".
//
// STEP group-class-delete-DIAGNOSTIC (TẠM THỜI) — GHI ĐÈ ĐOẠN TRÊN: chỉ thêm hiển thị/log chi
// tiết lý do chặn, KHÔNG đổi điều kiện hasDependentData/thứ tự xử lý ở trên. removeGroupClass()
// giờ console.log riêng response/error thô của cả 4 precheck (enrollRes/sessionsRes/
// attendanceRes/billingRpcRes) NGAY SAU khi mỗi cái chạy xong, cộng thêm 1 console.log tổng hợp
// đúng shape {group_class_id, enrollments_count, group_sessions_count, attendance_count,
// billing_history}. Khi bị chặn, alert() liệt kê rõ 4 dòng (Học viên/Buổi học/Điểm danh/Lịch sử
// học phí: Có/Không) thay vì câu chung chung cũ — dùng đúng 4 biến diagEnrollCount/
// diagSessionsCount/diagAttendanceCount/diagBillingHistory lấy thẳng từ *Res ở trên, KHÔNG query
// thêm, KHÔNG có nhánh cho phép xóa mới nào. Không đổi DB/RLS/FK/GRANT/UI khác.
//
// SUPABASE-ONLY: Group Class là tính năng MỚI, chỉ hoạt động khi có activeTutorId (phiên
// Supabase — Tutor tự đăng nhập hoặc Admin đang quản lý hộ 1 Tutor cụ thể). KHÔNG hỗ trợ tài
// khoản local-only cũ (activeTutorId null) — KHÔNG tạo thêm 1 cơ chế lưu localStorage song song
// cho Group Class (khác với Students, vốn có lịch sử hỗ trợ local trước khi có Supabase).
// ============================================================================

// ----------------------------------------------------------------------
// SOURCE OF TRUTH state của riêng Group Class (chỉ dùng trong module này, KHÔNG có bản sao nào
// khác). window.activeGroupClassId/window.gcCurrentTab/window.groupClassList được khai báo ở
// js/core/state.js (STEP 11E) — đây là state DÙNG CHUNG duy nhất được thêm, đúng scope yêu cầu.
// ----------------------------------------------------------------------
var gcSearchState = { query: '', subject: 'all', status: 'all' };
var editingGroupClassId = null;

// STEP 11E-FIX — CONTEXT-AWARE CACHE GUARD (thay cho boolean `groupClassListLoaded` cũ).
// ROOT CAUSE đã sửa: guard cũ là 1 boolean không gắn với activeTutorId nào — khi Admin đang
// "quản lý hộ" chuyển từ Tutor A sang Tutor B (activeTutorId đổi A -> B) NGAY TRONG CÙNG 1
// phiên trình duyệt, guard cũ vẫn coi là "đã load rồi" và render lại groupClassList đang cache
// của Tutor A cho màn hình Tutor B — sai dữ liệu, dù RLS/DB hoàn toàn đúng (đây là bug hiển thị
// ở tầng cache client, không phải bug bảo mật).
// FIX: lưu ĐÚNG activeTutorId mà cache hiện tại thuộc về. Guard chỉ dùng cache khi
// groupClassListLoadedForTutorId === activeTutorId (so sánh với giá trị HIỆN TẠI của
// activeTutorId tại thời điểm gọi, không hard-code bất kỳ tutor id nào). Khác thì luôn phải
// query lại Supabase cho đúng tutor đang active.
var groupClassListLoadedForTutorId = null;

// STEP 11E guard chống double-submit (double-click nút) — cùng pattern addClassInFlight/
// saveEditClassInFlight của js/students/students.js.
var addGroupClassInFlight = false;
var saveEditGroupClassInFlight = false;

// Group Class-specific status metadata — KHÔNG tái dùng lessonStatusMeta (khác domain: đây là
// group_classes.status, CHECK IN ('active','inactive','completed'), hoàn toàn khác tập giá trị
// scheduled/completed/absent/cancelled của lessons.status).
var groupClassStatusMeta = {
    active:    { label: 'Đang hoạt động', color: '#10b981' },
    inactive:  { label: 'Tạm ngưng',      color: '#f59e0b' },
    completed: { label: 'Đã hoàn thành',  color: '#6b7280' }
};

function buildGroupClassStatusBadgeHtml(status) {
    var meta = groupClassStatusMeta[status] || groupClassStatusMeta.active;
    return '<span style="color:' + meta.color + '; font-size:12px; margin-left:10px;">[' + meta.label + ']</span>';
}

// ----------------------------------------------------------------------
// LOAD (Supabase, context-aware cache theo activeTutorId) + RENDER LIST + SEARCH/FILTER
// ----------------------------------------------------------------------
// Được gọi từ switchTutorPage('group-classes') mỗi lần vào trang. Chỉ tái dùng cache
// groupClassList khi cache đó THỰC SỰ thuộc về activeTutorId hiện tại
// (groupClassListLoadedForTutorId === activeTutorId) — nếu Admin vừa chuyển sang quản lý 1
// Tutor khác (activeTutorId đổi), điều kiện này tự động false và bắt buộc query lại Supabase
// cho đúng tutor mới, KHÔNG bao giờ render nhầm cache của tutor trước đó.
async function loadGroupClassesIfNeeded() {
    if (groupClassListLoadedForTutorId === activeTutorId) { renderGroupClassList(); return; }
    await loadGroupClasses();
}

async function loadGroupClasses() {
    var container = document.getElementById('group-class-container');

    if (!activeTutorId) {
        // Không có phiên Supabase (tài khoản local cũ) — Group Class không hỗ trợ, hiển thị
        // rỗng thay vì lỗi (không có gì để tải). Vẫn ghi nhận đúng context (activeTutorId =
        // null lúc này) để lần gọi sau so sánh nhất quán, không hard-code giá trị nào khác.
        groupClassList = [];
        groupClassListLoadedForTutorId = activeTutorId;
        renderGroupClassList();
        return;
    }

    if (container) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px; font-size:14px;">⏳ Đang tải danh sách lớp nhóm...</div>';
    }

    try {
        // .eq('tutor_id', activeTutorId) tường minh — cùng convention loadTutorClassList()
        // (public.students) — KHÔNG chỉ dựa vào RLS, vì khi Admin đang quản lý hộ 1 Tutor cụ
        // thể, RLS admin là "FOR ALL" (thấy toàn bộ tutor), filter tường minh này mới đảm bảo
        // Group Class List chỉ hiện đúng lớp của activeTutorId đang được quản lý, không lẫn lớp
        // của tutor khác.
        var result = await supabaseClient
            .from('group_classes')
            .select('id, tutor_id, name, subject, status, created_at')
            .eq('tutor_id', activeTutorId)
            .order('created_at', { ascending: false });

        if (result.error) {
            console.error('[GROUP CLASS] Tải danh sách lớp nhóm FAILED:', result.error);
            if (container) {
                container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được danh sách lớp nhóm.<br>' + escapeHtml(describeSupabaseError(result.error)) + '</div>';
            }
            return;
        }

        groupClassList = result.data || [];
        groupClassListLoadedForTutorId = activeTutorId; // ghi nhận ĐÚNG tutor mà cache này vừa tải cho — dùng chính giá trị activeTutorId hiện tại, không hard-code
        renderGroupClassList();
    } catch (err) {
        console.error('[GROUP CLASS] Tải danh sách lớp nhóm EXCEPTION:', err);
        if (container) {
            container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Lỗi không xác định khi tải danh sách lớp nhóm.</div>';
        }
    }
}

function applyGroupClassFilters(list) {
    var q = (gcSearchState.query || '').trim().toLowerCase();
    var subjectFilter = gcSearchState.subject;
    var statusFilter = gcSearchState.status;
    return list.filter(function(gc) {
        if (q) {
            var hay = [gc.name, gc.subject].filter(Boolean).join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        if (subjectFilter !== 'all' && (gc.subject || '') !== subjectFilter) return false;
        if (statusFilter !== 'all' && (gc.status || '') !== statusFilter) return false;
        return true;
    });
}

// Dựng lại option "Môn học" TỪ ĐÚNG dữ liệu groupClassList hiện tại (không hard-code) — cùng
// convention renderTutorStudentFilterOptions(). "Trạng thái" KHÔNG dựng động: group_classes.status
// là enum cố định (CHECK IN active/inactive/completed) nên option đã hard-code sẵn trong HTML —
// khác với "Môn học" là free-text nên phải dựng từ dữ liệu thật.
function renderGroupClassFilterOptions() {
    var subjectSel = document.getElementById('gc-subject-filter');
    if (!subjectSel) return;

    var subjects = Array.from(new Set(groupClassList.map(function(gc) { return gc.subject; }).filter(Boolean))).sort();
    subjectSel.innerHTML = '<option value="all">Môn học: Tất cả</option>'
        + subjects.map(function(s) { return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; }).join('');

    subjectSel.value = subjects.indexOf(gcSearchState.subject) > -1 ? gcSearchState.subject : 'all';
    if (subjectSel.value === 'all') gcSearchState.subject = 'all';
}

function onGroupClassSearchInput(value) {
    gcSearchState.query = value;
    renderGroupClassList();
}

function onGroupClassFilterChange(key, value) {
    gcSearchState[key] = value;
    renderGroupClassList();
}

function renderGroupClassList() {
    var container = document.getElementById('group-class-container');
    if (!container) return;
    container.innerHTML = '';

    if (groupClassList.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:30px; font-size:14px;">Chưa có lớp nhóm nào được thêm.</div>';
        renderGroupClassFilterOptions();
        return;
    }

    renderGroupClassFilterOptions();
    var visible = applyGroupClassFilters(groupClassList);

    if (visible.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:30px; font-size:14px;">Không tìm thấy lớp nhóm phù hợp.</div>';
        return;
    }

    visible.forEach(function(gc) {
        var statusBadge = buildGroupClassStatusBadgeHtml(gc.status);
        var idJs = "'" + String(gc.id).replace(/'/g, "\\'") + "'";

        var card = document.createElement('div'); card.className = 'class-card';
        card.innerHTML = `
            <div class="class-meta" onclick="openGroupClassDetail(${idJs})">
                <h4><strong>${escapeHtml(gc.name)}</strong> - <span style="color:#00cca3">${escapeHtml(gc.subject)}</span> ${statusBadge}</h4>
                <div>
                    <span class="sched-tag">👥 Sĩ số: Chưa có học viên</span>
                    <span class="sched-tag">📅 Buổi tiếp theo: Chưa có buổi học</span>
                    <span class="profile-btn-tag">📝 Vào chi tiết lớp ➔</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
                <button onclick="openEditGroupClass(${idJs}); event.stopPropagation();" class="btn-edit-class" title="Chỉnh sửa lớp nhóm">✏️</button>
                <button onclick="removeGroupClass(${idJs}, this); event.stopPropagation();" class="btn-del" title="Xóa lớp nhóm">🗑️</button>
            </div>
        `;
        // Ghi chú "Sĩ số"/"Buổi tiếp theo" CỐ Ý là text tĩnh ở STEP 11E (chưa có
        // group_class_enrollments/group_sessions UI) — KHÔNG query 2 bảng đó chỉ để lấp số liệu
        // này, đúng yêu cầu phạm vi STEP 11E. Sẽ được thay bằng số liệu thật ở STEP triển khai
        // Enrollment/Session.
        container.appendChild(card);
    });
}

// ----------------------------------------------------------------------
// TẠO LỚP NHÓM MỚI
// ----------------------------------------------------------------------
async function addNewGroupClass() {
    var name = document.getElementById('gc-name').value.trim();
    var subject = document.getElementById('gc-subject').value.trim();

    if (!name || !subject) { alert('Vui lòng nhập đầy đủ Tên lớp và Môn học!'); return; }

    if (!activeTutorId) {
        alert('Tính năng Lớp nhóm chỉ khả dụng với tài khoản đã đăng nhập Supabase.');
        return;
    }

    // STEP 11E guard chống double-submit — cùng pattern addClassInFlight (students.js).
    if (addGroupClassInFlight) return;
    addGroupClassInFlight = true;
    var addBtn = document.getElementById('add-group-class-btn');
    var addBtnOrigText = addBtn ? addBtn.innerText : null;
    if (addBtn) { addBtn.disabled = true; addBtn.innerText = 'Đang lưu...'; }

    try {
        // KHÔNG truyền status — dùng đúng DEFAULT 'active' của group_classes.status ở DB (không
        // hard-code 'active' ở client rồi gửi lên, để DB luôn là nguồn sự thật duy nhất cho giá
        // trị mặc định này).
        var insertResult = await supabaseClient
            .from('group_classes')
            .insert({ tutor_id: activeTutorId, name: name, subject: subject })
            .select()
            .single();

        if (insertResult.error || !insertResult.data) {
            console.error('[GROUP CLASS] Tạo lớp nhóm FAILED:', insertResult.error);
            alert('⚠️ Không thể tạo lớp nhóm: ' + (insertResult.error ? describeSupabaseError(insertResult.error) : 'không nhận được dữ liệu trả về'));
            return;
        }

        groupClassList.unshift(insertResult.data);

        document.getElementById('gc-name').value = '';
        document.getElementById('gc-subject').value = '';

        renderGroupClassList();
        showToast('✅', 'Đã tạo lớp nhóm', insertResult.data.name);
    } catch (err) {
        console.error('[GROUP CLASS] Tạo lớp nhóm EXCEPTION:', err);
        alert('⚠️ Lỗi không xác định khi tạo lớp nhóm.');
    } finally {
        addGroupClassInFlight = false;
        if (addBtn) { addBtn.disabled = false; addBtn.innerText = addBtnOrigText; }
    }
}

// ----------------------------------------------------------------------
// SỬA LỚP NHÓM (modal) — tên/môn học/trạng thái. KHÔNG có nút xóa (xem "NO HARD DELETE" ở đầu file).
// ----------------------------------------------------------------------
function openEditGroupClass(id) {
    var gc = groupClassList.find(function(x) { return x.id === id; });
    if (!gc) return;
    editingGroupClassId = id;

    document.getElementById('ecgc-name').value = gc.name;
    document.getElementById('ecgc-subject').value = gc.subject;
    document.getElementById('ecgc-status').value = gc.status || 'active';
    var errBox = document.getElementById('edit-group-class-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    document.getElementById('edit-group-class-modal').classList.add('open');
}

// Nút "✏️ Sửa lớp" trong Group Class Detail (hero) — mở đúng modal Edit ở trên cho
// activeGroupClassId đang xem, KHÔNG tạo modal/form thứ hai riêng cho Detail.
function openEditGroupClassFromDetail() {
    if (activeGroupClassId == null) return;
    openEditGroupClass(activeGroupClassId);
}

function closeEditGroupClass() {
    document.getElementById('edit-group-class-modal').classList.remove('open');
    editingGroupClassId = null;
}

async function saveEditGroupClass() {
    var gc = groupClassList.find(function(x) { return x.id === editingGroupClassId; });
    if (!gc) return;

    var name = document.getElementById('ecgc-name').value.trim();
    var subject = document.getElementById('ecgc-subject').value.trim();
    var status = document.getElementById('ecgc-status').value;
    var errBox = document.getElementById('edit-group-class-error');

    function showModalError(msg) {
        if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
        else { alert(msg); }
    }

    if (!name) { showModalError('Vui lòng nhập Tên lớp.'); return; }
    if (!subject) { showModalError('Vui lòng nhập Môn học.'); return; }
    if (['active', 'inactive', 'completed'].indexOf(status) === -1) { showModalError('Trạng thái không hợp lệ.'); return; }

    // STEP 11E guard chống double-submit — cùng pattern saveEditClassInFlight (students.js).
    if (saveEditGroupClassInFlight) return;
    saveEditGroupClassInFlight = true;
    var saveBtn = document.getElementById('save-edit-group-class-btn');
    var saveBtnOrigText = saveBtn ? saveBtn.innerText : null;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Đang lưu...'; }

    try {
        var updResult = await supabaseClient
            .from('group_classes')
            .update({ name: name, subject: subject, status: status })
            .eq('id', editingGroupClassId)
            .select()
            .single();

        if (updResult.error || !updResult.data) {
            console.error('[GROUP CLASS] Sửa lớp nhóm FAILED:', updResult.error);
            showModalError('⚠️ Không thể lưu: ' + (updResult.error ? describeSupabaseError(updResult.error) : 'không nhận được dữ liệu trả về'));
            return;
        }

        // Supabase là SOURCE OF TRUTH — cập nhật lại đúng object trong cache từ row vừa trả về.
        gc.name = updResult.data.name;
        gc.subject = updResult.data.subject;
        gc.status = updResult.data.status;

        renderGroupClassList();
        closeEditGroupClass();
        showToast('✅', 'Đã lưu thay đổi', gc.name);

        // Nếu đang mở Group Class Detail của đúng lớp này thì cập nhật lại hero/tiêu đề ngay,
        // không bắt tutor phải đóng/mở lại Detail mới thấy thay đổi (cùng tinh thần
        // saveEditClassActual() cập nhật lại #view-student-title khi đang mở đúng hồ sơ đó).
        if (activeGroupClassId === gc.id) {
            renderGroupClassDetailHero(gc);
            renderGroupClassOverviewTab(gc);
        }
    } catch (err) {
        console.error('[GROUP CLASS] Sửa lớp nhóm EXCEPTION:', err);
        showModalError('⚠️ Lỗi không xác định khi lưu.');
    } finally {
        saveEditGroupClassInFlight = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = saveBtnOrigText; }
    }
}

// ----------------------------------------------------------------------
// GROUP CLASS DETAIL (shell: hero + KPI placeholder + 4 tab, chỉ tab "Tổng quan" có nội dung)
// ----------------------------------------------------------------------
function openGroupClassDetail(id) {
    var gc = groupClassList.find(function(x) { return x.id === id; });
    if (!gc) return;
    activeGroupClassId = id;

    document.getElementById('main-page-view').style.display = 'none';
    document.getElementById('group-class-detail-view').style.display = 'block';

    renderGroupClassDetailHero(gc);
    renderGroupClassDetailKpiPlaceholders();
    renderGroupClassOverviewTab(gc);
    switchGroupClassTab('overview');
}

function closeGroupClassDetail() {
    document.getElementById('group-class-detail-view').style.display = 'none';
    document.getElementById('main-page-view').style.display = 'flex';
    activeGroupClassId = null;
    renderGroupClassList(); // phản ánh ngay nếu vừa sửa lớp trong lúc ở Detail
}

// ----------------------------------------------------------------------
// XÓA LỚP NHÓM (group-class-delete) — HARD DELETE CÓ ĐIỀU KIỆN, CHỈ KHI KHÔNG CÒN DỮ LIỆU
// LỊCH SỬ PHỤ THUỘC. Xem khối comment "NO HARD DELETE" / "STEP group-class-delete" ở đầu file
// để biết đầy đủ FK/RLS đã kiểm tra trực tiếp trên Supabase trước khi viết hàm này.
//
// STEP group-class-delete-403-FIX — GHI ĐÈ BƯỚC 1 cũ (đã áp dụng thật, không còn giả định):
//   - payments KHÔNG còn là blocking precheck. FK payments.group_class_id -> group_classes đã
//     xác nhận lại qua pg_constraint là ON DELETE SET NULL — xóa lớp KHÔNG làm mất payment nào,
//     chỉ gỡ liên kết group_class_id, nên không cần thiết cho quyết định xóa.
//   - billing_snapshots KHÔNG SELECT thẳng bảng nữa. Đã xác nhận qua
//     information_schema.role_table_grants trên Supabase thật: role authenticated KHÔNG có
//     GRANT SELECT nào trên billing_snapshots (dù RLS "Tutors can view own billing snapshots" đã
//     đúng ownership) — đây là nguyên nhân 403 thật (lỗi "Không thể kiểm tra dữ liệu học phí").
//     Thay vì GRANT SELECT thô cho Tutor, dùng RPC boolean-only public.gc_has_billing_history()
//     (SECURITY DEFINER, chỉ trả true/false, KHÔNG trả total_amount hay bất kỳ số liệu nào). RPC
//     dùng đúng điều kiện Admin đã đối chiếu từ pg_policies trên group_classes
//     ("Admins can manage all group classes" = get_my_role() = 'admin'), không đoán tên bảng/cột.
//   - Thêm group_class_schedules vào precheck: FK CASCADE thật tới group_classes (xác nhận qua
//     pg_constraint) nhưng KHÔNG được kiểm tra ở bản cũ — gap thật. Tutor đã có sẵn SELECT hợp lệ
//     trên bảng này (dùng thường xuyên ở schedule.js) nên không phát sinh permission issue mới.
//   - session_reports KHÔNG được query trực tiếp để precheck — FK RESTRICT
//     (session_reports.group_session_id -> group_sessions, xác nhận qua pg_constraint) là lưới
//     bảo vệ cuối ở tầng DB: nếu lọt qua mọi precheck (race condition hiếm), DELETE thật sự sẽ bị
//     Postgres chặn với mã lỗi 23503 (đã test thật, có ROLLBACK, trên Supabase) — xử lý riêng ở
//     BƯỚC 2 để hiển thị lý do rõ ràng thay vì lỗi kỹ thuật chung chung.
// ----------------------------------------------------------------------
var removeGroupClassInFlight = false;

async function removeGroupClass(id, btnEl) {
    // Guard chống double-click, cùng pattern removeClassInFlight của js/students/students.js.
    if (removeGroupClassInFlight) return;
    var gc = groupClassList.find(function(x) { return x.id === id; });
    if (!gc) return;

    // confirm() chặn double-click TRONG lúc dialog đang mở; removeGroupClassInFlight (set ngay
    // sau dòng này) chặn click thứ 2 SAU khi đã bấm OK, trong lúc các query bên dưới đang await.
    var confirmMsg = 'Bạn có chắc muốn xóa lớp "' + gc.name + '"?\n\n' +
        '⚠️ Đây là thao tác KHÔNG THỂ HOÀN TÁC.';
    if (!confirm(confirmMsg)) return;

    removeGroupClassInFlight = true;
    var origHtml = btnEl ? btnEl.innerHTML : null;
    if (btnEl) { btnEl.disabled = true; btnEl.innerText = '⏳'; }

    try {
        // BƯỚC 1 — kiểm tra dữ liệu LỊCH SỬ THẬT trên Supabase (không dùng cache client, vì cache
        // có thể chưa từng load hoặc đã cũ) TRƯỚC khi cho phép xóa. Chỉ kiểm tra đúng những bảng
        // thực sự là lịch sử (enrollment/session/attendance/billing) — KHÔNG dùng payments (SET
        // NULL, không mất dữ liệu) và KHÔNG dùng group_class_schedules (không phải lịch sử — xem
        // "STEP group-class-delete-SCHEDULES-NOT-HISTORY" ở đầu file) làm blocking gate.
        var enrollRes = await supabaseClient
            .from('group_class_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('group_class_id', id);
        // DIAGNOSTIC (tạm, chỉ log, KHÔNG đổi logic quyết định) — log riêng response/error thô
        // của từng precheck để xác định chính xác bảng nào đang chặn xóa.
        console.log('[GC-DELETE-DIAGNOSTIC] enrollRes:', enrollRes);
        if (enrollRes.error) { alert('⚠️ Không thể kiểm tra dữ liệu học viên: ' + describeSupabaseError(enrollRes.error)); return; }

        // DIAGNOSTIC (tạm, chỉ đọc/log, KHÔNG dùng cho hasDependentData — enrollRes ở trên vẫn là
        // nguồn duy nhất quyết định chặn/không chặn, giữ nguyên y hệt) — query RIÊNG lấy đủ field
        // để xác định chính xác 1 enrollment đang là gì (active hay đã left từ bao giờ).
        var diagEnrollRowsRes = await supabaseClient
            .from('group_class_enrollments')
            .select('id, student_id, status, joined_at, left_at')
            .eq('group_class_id', id);
        console.log('[GC-DELETE-DIAGNOSTIC] enrollment rows chi tiết:', JSON.stringify(diagEnrollRowsRes.data, null, 2));
        if (diagEnrollRowsRes.error) {
            console.error('[GC-DELETE-DIAGNOSTIC] Lỗi query chi tiết enrollment (chỉ log, KHÔNG chặn xóa):', diagEnrollRowsRes.error);
        }

        // group_sessions — STEP group-class-delete-FUTURE-VS-HISTORICAL: lấy đủ scheduled_date +
        // status thay vì chỉ đếm, để phân biệt "buổi tương lai do Generator tự sinh từ
        // group_class_schedules" (KHÔNG chặn xóa) với "buổi đã diễn ra / có dữ liệu thực tế"
        // (VẪN chặn xóa) — xem audit A/B ở comment đầu file.
        // DIAGNOSTIC: thêm session_type vào select (CHỈ để log/xác định, hasDependentData và
        // historicalSessions/futureSessions bên dưới VẪN chỉ dùng status/scheduled_date như cũ,
        // KHÔNG đổi điều kiện phân loại).
        var sessionsRes = await supabaseClient
            .from('group_sessions')
            .select('id, scheduled_date, status, session_type')
            .eq('group_class_id', id);
        console.log('[GC-DELETE-DIAGNOSTIC] sessionsRes:', sessionsRes);
        if (sessionsRes.error) { alert('⚠️ Không thể kiểm tra dữ liệu buổi học: ' + describeSupabaseError(sessionsRes.error)); return; }

        // todayIso dùng đúng helper getLocalIsoDate() sẵn có (js/core/utils.js, cùng cách
        // generator.js/enrollment.js đang tính "hôm nay") — KHÔNG tự chế logic ngày mới.
        var todayIso = getLocalIsoDate(new Date());
        var allSessions = sessionsRes.data || [];
        // historical: status khác 'scheduled' (đã completed/cancelled = quyết định thật) HOẶC
        // scheduled_date đã tới/qua hôm nay (dù status chưa kịp cập nhật) — coi là "đã diễn ra".
        var historicalSessions = allSessions.filter(function(s) {
            return s.status !== 'scheduled' || s.scheduled_date <= todayIso;
        });
        // future: CHỈ những buổi còn 'scheduled' VÀ ngày còn ở tương lai — đúng tập Generator tự
        // sinh từ Lịch học hàng tuần, chưa từng diễn ra, KHÔNG có dữ liệu thực tế nào.
        var futureSessions = allSessions.filter(function(s) {
            return s.status === 'scheduled' && s.scheduled_date > todayIso;
        });
        // DIAGNOSTIC (tạm, chỉ log) — liệt kê từng session kèm nhãn phân loại thật (historical/
        // future) để xác định chính xác 1 historical session đang là gì, KHÔNG đổi
        // historicalSessions/futureSessions ở trên.
        console.log('[GC-DELETE-DIAGNOSTIC] group_sessions phân loại chi tiết:', JSON.stringify(allSessions.map(function(s) {
            return {
                id: s.id,
                scheduled_date: s.scheduled_date,
                status: s.status,
                session_type: s.session_type,
                classification: (s.status !== 'scheduled' || s.scheduled_date <= todayIso) ? 'historical' : 'future'
            };
        }), null, 2));

        // attendance không có cột group_class_id trực tiếp (chỉ có session_id) — lọc qua bảng
        // group_sessions bằng embedded filter của PostgREST (attendance.session_id ->
        // group_sessions.id đã có FK sẵn nên PostgREST nhận diện được quan hệ này).
        var attendanceRes = await supabaseClient
            .from('attendance')
            .select('id, group_sessions!inner(group_class_id)', { count: 'exact', head: true })
            .eq('group_sessions.group_class_id', id);
        console.log('[GC-DELETE-DIAGNOSTIC] attendanceRes:', attendanceRes);
        if (attendanceRes.error) { alert('⚠️ Không thể kiểm tra dữ liệu điểm danh: ' + describeSupabaseError(attendanceRes.error)); return; }

        // DIAGNOSTIC (tạm, chỉ đọc/log, KHÔNG dùng cho hasDependentData — attendanceRes ở trên
        // vẫn là nguồn duy nhất quyết định chặn/không chặn, giữ nguyên y hệt) — query RIÊNG lấy
        // đủ field (kèm join group_sessions lấy scheduled_date/status/session_type) để xác định
        // chính xác 1 attendance đang gắn với buổi nào, ngày nào, trạng thái gì.
        //
        // FIX (audit schema thật, xem js/group-class/attendance.js dòng ~19-21, SOURCE OF TRUTH
        // STEP 11H-A): public.attendance có cột session_id (FK -> group_sessions, CASCADE) và
        // student_id (FK -> students, CASCADE) — KHÔNG có cột "group_session_id" (tên đó không
        // tồn tại trong schema thật, đó là nguyên nhân HTTP 400 ở query cũ). attendance CŨNG
        // KHÔNG có FK trực tiếp tới group_class_enrollments (không có enrollment_id) — enrollment
        // hợp lệ được enforce bằng trigger check_attendance_enrollment(), không phải FK, nên
        // KHÔNG query enrollment ở đây. Sửa lại đúng tên cột thật: session_id (không đổi ý nghĩa,
        // vẫn cùng 1 giá trị dùng để biết attendance thuộc buổi học nào).
        var diagAttendanceRowsRes = await supabaseClient
            .from('attendance')
            .select('id, session_id, student_id, status, group_sessions!inner(group_class_id, scheduled_date, status, session_type)')
            .eq('group_sessions.group_class_id', id);
        console.log('[GC-DELETE-DIAGNOSTIC] attendance rows chi tiết (session_id = cột FK thật tới group_sessions, KHÔNG phải group_session_id):', JSON.stringify(diagAttendanceRowsRes.data, null, 2));
        if (diagAttendanceRowsRes.error) {
            console.error('[GC-DELETE-DIAGNOSTIC] Lỗi query chi tiết attendance (chỉ log, KHÔNG chặn xóa):', diagAttendanceRowsRes.error);
        }

        // billing_snapshots — RPC boolean-only (public.gc_has_billing_history, đã apply migration
        // trên Supabase), KHÔNG select thẳng bảng, KHÔNG lộ số tiền/dữ liệu billing nào.
        var billingRpcRes = await supabaseClient.rpc('gc_has_billing_history', { p_group_class_id: id });
        console.log('[GC-DELETE-DIAGNOSTIC] billingRpcRes:', billingRpcRes);
        if (billingRpcRes.error) { alert('⚠️ Không thể kiểm tra dữ liệu học phí: ' + describeSupabaseError(billingRpcRes.error)); return; }

        // group_class_schedules KHÔNG còn nằm trong precheck này (quy tắc mới: schedule không
        // phải dữ liệu lịch sử — xem comment "STEP group-class-delete-SCHEDULES-NOT-HISTORY" ở
        // đầu file). Nó được xóa riêng ở BƯỚC 2 trước khi DELETE group_classes, KHÔNG dùng để
        // quyết định hasDependentData.
        var diagEnrollCount = enrollRes.count || 0;
        var diagSessionsCount = historicalSessions.length;
        var diagAttendanceCount = attendanceRes.count || 0;
        var diagBillingHistory = billingRpcRes.data === true;

        // DIAGNOSTIC (tạm) — log tổng hợp đúng shape yêu cầu, KHÔNG dùng để tính hasDependentData
        // (hasDependentData vẫn tính thẳng từ *Res/historicalSessions ở dưới, giữ nguyên logic
        // quyết định cũ, chỉ thay phần group_sessions theo audit đã thống nhất).
        console.log('[GC-DELETE-DIAGNOSTIC] summary:', {
            group_class_id: id,
            enrollments_count: diagEnrollCount,
            group_sessions_count: diagSessionsCount,
            group_sessions_total: allSessions.length,
            group_sessions_future: futureSessions.length,
            attendance_count: diagAttendanceCount,
            billing_history: diagBillingHistory
        });

        // STEP group-class-delete-FUTURE-VS-HISTORICAL: CHỈ historicalSessions mới chặn xóa —
        // futureSessions (Generator tự sinh, chưa diễn ra) KHÔNG được coi là dữ liệu lịch sử.
        var hasDependentData = (enrollRes.count || 0) > 0 || historicalSessions.length > 0 ||
            (attendanceRes.count || 0) > 0 || billingRpcRes.data === true;

        if (hasDependentData) {
            // CHẶN CỨNG — không được gọi DELETE trong trường hợp này (xem cảnh báo CASCADE ở
            // đầu file). Đây chính là hàng rào ngăn cascade xóa lịch sử THẬT (học viên/buổi
            // học/điểm danh/học phí) — group_class_schedules không còn ở đây.
            // DIAGNOSTIC (tạm) — popup giờ liệt kê rõ từng loại dữ liệu thay vì câu chung chung,
            // dùng đúng 4 biến diag* ở trên (không tính lại, không đổi điều kiện chặn).
            alert(
                'Không thể xóa lớp vì còn dữ liệu:\n' +
                'Học viên: ' + diagEnrollCount + '\n' +
                'Buổi học: ' + diagSessionsCount + '\n' +
                'Điểm danh: ' + diagAttendanceCount + '\n' +
                'Lịch sử học phí: ' + (diagBillingHistory ? 'Có' : 'Không')
            );
            return;
        }

        // BƯỚC 1b — KHÔNG còn dữ liệu lịch sử thật: xóa các futureSessions (chỉ đúng danh sách id
        // đã xác định ở trên, KHÔNG xóa theo group_class_id mù) TRƯỚC group_class_schedules/
        // group_classes, đúng audit đã thống nhất (mục 4). Nếu bước này lỗi, DỪNG NGAY, KHÔNG gọi
        // DELETE group_class_schedules/group_classes, KHÔNG báo xóa thành công.
        if (futureSessions.length > 0) {
            var futureSessionIds = futureSessions.map(function(s) { return s.id; });
            var delFutureSessionsRes = await supabaseClient
                .from('group_sessions')
                .delete()
                .in('id', futureSessionIds);
            if (delFutureSessionsRes.error) {
                console.error('XÓA future group_sessions FAILED:', delFutureSessionsRes.error);
                alert('⚠️ Không thể xóa các buổi học tương lai của lớp: ' + describeSupabaseError(delFutureSessionsRes.error));
                return;
            }
        }

        // BƯỚC 2a — xóa group_class_schedules của đúng lớp này TRƯỚC (schedule không phải lịch
        // sử, chỉ là cấu hình lặp lại — xem comment đầu file).
        // Nếu bước này lỗi, DỪNG NGAY, KHÔNG gọi DELETE group_classes, KHÔNG báo xóa thành công.
        var delSchedRes = await supabaseClient
            .from('group_class_schedules')
            .delete()
            .eq('group_class_id', id);
        if (delSchedRes.error) {
            console.error('XÓA group_class_schedules FAILED:', delSchedRes.error);
            alert('⚠️ Không thể xóa lịch học của lớp: ' + describeSupabaseError(delSchedRes.error));
            return;
        }

        // BƯỚC 2b — chỉ sau khi group_class_schedules đã xóa xong mới gọi DELETE group_classes.
        // RLS "Tutors can delete own group classes" tự giới hạn tutor_id = tutor đang đăng nhập;
        // nếu Supabase từ chối (RLS/lỗi mạng/...) thì rơi vào nhánh error bên dưới — KHÔNG đụng
        // vào groupClassList/UI, giữ nguyên dữ liệu, không giả lập xóa thành công (schedule đã bị
        // xóa thật ở bước trên, nhưng group_classes vẫn còn — KHÔNG coi đây là "xóa lớp thành
        // công" vì lớp mẹ vẫn tồn tại).
        var delRes = await supabaseClient.from('group_classes').delete().eq('id', id);
        if (delRes.error) {
            console.error('XÓA LỚP NHÓM FAILED:', delRes.error);
            // Lưới bảo vệ cuối: nếu vẫn còn session_reports lọt qua precheck (race condition
            // hiếm), FK RESTRICT ở DB sẽ chặn ở đây với mã 23503 — hiển thị lý do rõ ràng thay vì
            // lỗi kỹ thuật chung chung.
            if (delRes.error.code === '23503') {
                alert('⚠️ Không thể xóa: lớp vẫn còn báo cáo buổi học (Session Reports) liên quan chưa được gỡ.');
            } else {
                alert('⚠️ Không thể xóa lớp: ' + describeSupabaseError(delRes.error));
            }
            return;
        }

        // BƯỚC 3 — CHỈ cập nhật UI SAU KHI Supabase xác nhận xóa thành công (không có card cũ
        // nào còn sót lại vì renderGroupClassList() vẽ lại toàn bộ từ groupClassList đã lọc).
        groupClassList = groupClassList.filter(function(x) { return x.id !== id; });
        if (activeGroupClassId === id) { closeGroupClassDetail(); }
        renderGroupClassList();
        showToast('✅', 'Đã xóa lớp nhóm', gc.name);
    } catch (err) {
        console.error('[GROUP CLASS] Xóa lớp nhóm EXCEPTION:', err);
        alert('⚠️ Lỗi không xác định khi xóa lớp.');
    } finally {
        // Luôn restore dù thành công hay lỗi. Nếu xóa thành công, renderGroupClassList() ở trên
        // đã vẽ lại toàn bộ danh sách (card cũ + nút cũ không còn trong DOM) nên gán lại btnEl vô
        // hại; nếu lỗi/return sớm, renderGroupClassList() KHÔNG chạy nên nút vẫn còn trên DOM và
        // cần được restore đúng ở đây — cùng pattern removeClass() của js/students/students.js.
        removeGroupClassInFlight = false;
        if (btnEl) { btnEl.disabled = false; if (origHtml !== null) btnEl.innerHTML = origHtml; }
    }
}

function renderGroupClassDetailHero(gc) {
    document.getElementById('gc-detail-title').innerText = 'Lớp nhóm: ' + gc.name;
    document.getElementById('gc-detail-subtitle').innerText = 'Bộ môn: ' + gc.subject;
    document.getElementById('gc-hero-name').innerText = gc.name;
    document.getElementById('gc-hero-meta').innerText = 'Môn học: ' + gc.subject;
    document.getElementById('gc-hero-status').innerHTML = buildGroupClassStatusBadgeHtml(gc.status);
}

// KPI ở STEP 11E CHỦ Ý chỉ hiển thị giá trị an toàn — KHÔNG query
// group_class_enrollments/group_sessions/attendance/payments (đúng yêu cầu phạm vi). Các KPI
// này sẽ được nối vào dữ liệu thật ở đúng STEP triển khai Enrollment/Session/Attendance.
//
// STEP 11F-B-FIX: gc-kpi-enrollment-count vẫn được reset về '0' ở đây MỖI LẦN mở Detail (giữ
// nguyên hành vi placeholder-trước-khi-có-dữ-liệu — tránh hiển thị số liệu CŨ của lớp trước đó
// trong khoảnh khắc trước khi refreshGroupClassOverviewEnrollmentCount() kịp chạy xong) — nhưng
// renderGroupClassOverviewTab() (gọi ngay sau hàm này trong openGroupClassDetail()) sẽ cập nhật
// lại giá trị THẬT ngay lập tức nếu đã có sẵn cache, hoặc sau 1 lần query nếu chưa có. Các KPI
// khác (Tổng buổi/Hoàn thành/Tỷ lệ chuyên cần/Doanh thu) TIẾP TỤC là placeholder tĩnh, ngoài
// phạm vi STEP này (mục X đề bài).
function renderGroupClassDetailKpiPlaceholders() {
    document.getElementById('gc-kpi-total-sessions').innerText = '0';
    document.getElementById('gc-kpi-completed-sessions').innerText = '0';
    document.getElementById('gc-kpi-enrollment-count').innerText = '0';
    document.getElementById('gc-kpi-attendance-rate').innerText = 'Chưa có dữ liệu';
    document.getElementById('gc-kpi-revenue').innerText = 'Chưa có dữ liệu';
}

function renderGroupClassOverviewTab(gc) {
    var box = document.getElementById('gc-overview-info-box');
    if (!box) return;
    box.innerHTML =
        '<div>Tên lớp: <strong style="color:var(--text-main);">' + escapeHtml(gc.name) + '</strong></div>' +
        '<div style="margin-top:6px;">Môn học: <strong style="color:var(--text-main);">' + escapeHtml(gc.subject) + '</strong></div>' +
        '<div style="margin-top:6px;">Trạng thái: ' + buildGroupClassStatusBadgeHtml(gc.status) + '</div>' +
        '<div style="margin-top:6px;" id="gc-overview-si-so">Sĩ số: Đang tải...</div>' +
        '<div style="margin-top:6px;">Buổi học: Chưa có buổi học</div>';

    refreshGroupClassOverviewEnrollmentCount(gc.id);
    refreshGroupClassOverviewAttendanceSummary(gc.id);
}

// ----------------------------------------------------------------------
// STEP 11H-D — ATTENDANCE SUMMARY + KPI "Tỷ lệ chuyên cần" (#gc-kpi-attendance-rate)
// ----------------------------------------------------------------------
// Công thức (mục 3 đề bài): rate = (present + late) / (present + absent + excused + late), CHỈ
// tính trên attendance ĐÃ tồn tại trong DB — session scheduled chưa điểm danh KHÔNG bị coi là
// absent (mục 4/12), cancelled session bị loại khỏi mẫu số dù có anomaly attendance hay không
// (mục 4/11 — không xoá DB, chỉ loại + log cảnh báo).
//
// Query strategy (mục 13): 1 query group_sessions (chỉ id + status) của activeGroupClassId +
// 1 query attendance WHERE session_id IN (...) — KHÔNG N+1, KHÔNG query attendance của toàn bộ
// tutor rồi lọc ở client (mục 6).
//
// KHÔNG cache riêng (groupClassAttendanceSummary) — mục 14 cho phép bỏ qua cache nếu không thực
// sự cần: hàm này vốn đã được gọi lại mỗi lần renderGroupClassOverviewTab() chạy (mở Detail lần
// đầu — mục 14 "class isolation") VÀ mỗi lần Attendance Save thành công (mục 15, xem
// attendance.js gọi window.refreshGroupClassOverviewAttendanceSummary() — cùng pattern
// enrollment.js gọi window.syncGroupClassOverviewEnrollmentCount()), nên không có tình huống nào
// cần đọc lại một cache cũ thay vì query mới.
async function refreshGroupClassOverviewAttendanceSummary(groupClassId) {
    try {
        var sessionsResult = await supabaseClient
            .from('group_sessions')
            .select('id, status')
            .eq('group_class_id', groupClassId);

        // Mục VI (cùng convention refreshGroupClassOverviewEnrollmentCount): chỉ áp dụng nếu vẫn
        // còn đúng lớp lúc bắt đầu gọi — tránh leak summary của lớp A sang màn hình lớp B.
        if (activeGroupClassId !== groupClassId) return;

        if (sessionsResult.error) {
            console.error('[GROUP CLASS OVERVIEW] Tải buổi học cho Attendance Summary FAILED:', sessionsResult.error);
            applyAttendanceSummaryError(groupClassId);
            return;
        }

        var sessions = sessionsResult.data || [];
        if (sessions.length === 0) {
            applyAttendanceSummaryEmpty(groupClassId);
            return;
        }

        var cancelledSessionIds = {};
        var sessionIds = sessions.map(function(s) {
            if (s.status === 'cancelled') cancelledSessionIds[s.id] = true;
            return s.id;
        });

        var attResult = await supabaseClient
            .from('attendance')
            .select('session_id, status')
            .in('session_id', sessionIds);

        if (activeGroupClassId !== groupClassId) return;

        if (attResult.error) {
            console.error('[GROUP CLASS OVERVIEW] Tải Attendance Summary FAILED:', attResult.error);
            applyAttendanceSummaryError(groupClassId);
            return;
        }

        var counts = { present: 0, absent: 0, excused: 0, late: 0 };
        var anomalyCount = 0;
        (attResult.data || []).forEach(function(row) {
            if (cancelledSessionIds[row.session_id]) {
                // Mục 4/11 đề bài: buổi học đã huỷ KHÔNG được có attendance — nếu vẫn có (anomaly),
                // KHÔNG xoá/sửa DB ở đây, CHỈ loại khỏi Summary + log cảnh báo cho dev biết.
                anomalyCount++;
                return;
            }
            if (counts.hasOwnProperty(row.status)) counts[row.status]++;
        });

        if (anomalyCount > 0) {
            console.warn('[GROUP CLASS OVERVIEW] ANOMALY: ' + anomalyCount + ' attendance record(s) thuộc buổi học đã HUỶ (cancelled) — đã loại khỏi Attendance Summary/KPI, KHÔNG xoá/sửa DB. group_class_id=' + groupClassId);
        }

        var totalMarked = counts.present + counts.absent + counts.excused + counts.late;
        if (totalMarked === 0) {
            // Mục 7 đề bài: phân biệt rõ "chưa có dữ liệu" với "0% attendance" — KHÔNG hiển thị 0%.
            applyAttendanceSummaryEmpty(groupClassId);
            return;
        }

        var rate = (counts.present + counts.late) / totalMarked;
        applyAttendanceSummaryData(groupClassId, counts, totalMarked, rate);
    } catch (err) {
        console.error('[GROUP CLASS OVERVIEW] Attendance Summary EXCEPTION:', err);
        applyAttendanceSummaryError(groupClassId);
    }
}

function applyAttendanceSummaryEmpty(groupClassId) {
    if (groupClassId !== activeGroupClassId) return;
    var kpiEl = document.getElementById('gc-kpi-attendance-rate');
    if (kpiEl) kpiEl.innerText = 'Chưa có dữ liệu';
    var box = document.getElementById('gc-attendance-summary-box');
    if (box) box.innerHTML = '<div style="color:var(--text-sub);">Chưa có dữ liệu điểm danh.</div>';
}

function applyAttendanceSummaryError(groupClassId) {
    if (groupClassId !== activeGroupClassId) return;
    // Mục 19 đề bài: lỗi query KHÔNG được âm thầm rơi về 0%/'Chưa có dữ liệu' như thành công —
    // hiển thị rõ là lỗi tải, giữ đúng convention báo lỗi (màu đỏ) đã dùng ở các nơi khác trong
    // Group Class Detail (session.js/enrollment.js/attendance.js).
    var kpiEl = document.getElementById('gc-kpi-attendance-rate');
    if (kpiEl) kpiEl.innerText = 'Chưa có dữ liệu';
    var box = document.getElementById('gc-attendance-summary-box');
    if (box) box.innerHTML = '<div style="color:#ef4444;">⚠️ Không tải được dữ liệu điểm danh.</div>';
}

// Formatter: reuse ĐÚNG convention percent hiện có của app (1-to-1 dashboard, index.html —
// attendanceRate = Math.round(x * 1000) / 10, hiển thị 1 chữ số thập phân, VD "83.3%") — mục 18
// đề bài "nếu có formatter percentage → reuse", KHÔNG tự bịa Math.round(x*100) (số nguyên) khác
// convention đã có.
function applyAttendanceSummaryData(groupClassId, counts, totalMarked, rate) {
    if (groupClassId !== activeGroupClassId) return;
    var ratePercent = Math.round(rate * 1000) / 10;
    var percentText = ratePercent + '%';

    var kpiEl = document.getElementById('gc-kpi-attendance-rate');
    if (kpiEl) kpiEl.innerText = percentText;

    var box = document.getElementById('gc-attendance-summary-box');
    if (box) {
        box.innerHTML =
            '<div style="text-align:center; padding:2px 0 12px;">' +
                '<div style="font-size:28px; font-weight:800; color:var(--text-main);">' + percentText + '</div>' +
                '<div style="font-size:12px; color:var(--text-sub); margin-top:2px;">Tỷ lệ tham dự · ' + totalMarked + ' lượt điểm danh</div>' +
            '</div>' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; font-size:13px;">' +
                '<div style="color:#10b981;">Có mặt</div><div style="text-align:right; font-weight:700; color:var(--text-main);">' + counts.present + '</div>' +
                '<div style="color:#f59e0b;">Muộn</div><div style="text-align:right; font-weight:700; color:var(--text-main);">' + counts.late + '</div>' +
                '<div style="color:#ef4444;">Vắng</div><div style="text-align:right; font-weight:700; color:var(--text-main);">' + counts.absent + '</div>' +
                '<div style="color:#38bdf8;">Có phép</div><div style="text-align:right; font-weight:700; color:var(--text-main);">' + counts.excused + '</div>' +
            '</div>';
    }
}

// ----------------------------------------------------------------------
// STEP 11F-B-FIX — SĨ SỐ = active enrollment count (mục III: source of truth DUY NHẤT là
// group_class_enrollments WHERE group_class_id = activeGroupClassId AND status = 'active';
// KHÔNG dùng students/classList/student_schedules/lessons).
// ----------------------------------------------------------------------
// Ưu tiên dùng cache đã có sẵn trong enrollment.js (window.getCachedActiveEnrollmentCount() —
// KHÔNG query lại Supabase nếu cache đó đã đúng activeGroupClassId, mục IV "reuse dữ liệu hiện
// tại nếu an toàn"). CHỈ query trực tiếp (window.getActiveEnrollmentCount(), live head-count, hàm
// đã có sẵn từ STEP 11F-B) khi cache CHƯA có cho lớp này — ví dụ Detail vừa mở, tab "Học viên"
// chưa từng được vào lần nào trong phiên hiện tại. Gọi qua window.* (KHÔNG import enrollment.js ở
// đây — cùng lý do "tránh circular dependency" đã ghi ở đầu file/switchGroupClassTab()).
async function refreshGroupClassOverviewEnrollmentCount(groupClassId) {
    var cached = (typeof window.getCachedActiveEnrollmentCount === 'function')
        ? window.getCachedActiveEnrollmentCount()
        : null;

    if (cached !== null) {
        applyGroupClassOverviewEnrollmentCount(groupClassId, cached);
        return;
    }

    if (typeof window.getActiveEnrollmentCount !== 'function') return;
    var count = await window.getActiveEnrollmentCount();
    // Mục VI: trong lúc query đang chạy, user có thể đã đóng Detail hoặc chuyển sang Group Class
    // khác (activeGroupClassId đổi) — CHỈ áp dụng kết quả nếu vẫn còn đúng lớp lúc bắt đầu gọi,
    // tránh leak số liệu của lớp A sang màn hình đang mở của lớp B.
    if (activeGroupClassId !== groupClassId) return;
    if (count === null) return; // lỗi mạng/Supabase — giữ nguyên "Đang tải...", KHÔNG hiển thị sai số liệu
    applyGroupClassOverviewEnrollmentCount(groupClassId, count);
}

// Cập nhật DOM (KPI card + dòng Overview) — dùng chung bởi refreshGroupClassOverviewEnrollmentCount()
// (initial/khi chưa có cache) VÀ syncGroupClassOverviewEnrollmentCount() (mục V, gọi từ
// enrollment.js mỗi khi danh sách enrollment thay đổi: thêm existing/thêm mới/rời lớp).
function applyGroupClassOverviewEnrollmentCount(groupClassId, count) {
    if (groupClassId !== activeGroupClassId) return; // mục VI: không áp dụng nhầm lớp
    var kpiEl = document.getElementById('gc-kpi-enrollment-count');
    if (kpiEl) kpiEl.innerText = String(count);
    var siSoEl = document.getElementById('gc-overview-si-so');
    if (siSoEl) siSoEl.innerText = 'Sĩ số: ' + (count > 0 ? (count + ' học viên') : 'Chưa có học viên');
}

// Entry point GỌI TỪ enrollment.js (mục V: sync sau khi enroll/leave, KHÔNG reload toàn bộ trang)
// — enrollment.js đã có sẵn count chính xác (gcEnrollmentListCache.length) ngay sau khi
// loadEnrollments()/renderEnrollmentList() chạy xong nên gọi thẳng applyGroupClassOverviewEnrollmentCount(),
// KHÔNG cần query lại (mục IV). window.syncGroupClassOverviewEnrollmentCount được gán ở cuối file
// (cùng khối EXPOSE QUA WINDOW) — xem ở đó.
function syncGroupClassOverviewEnrollmentCount(groupClassId, count) {
    applyGroupClassOverviewEnrollmentCount(groupClassId, count);
}

// Copy nguyên logic switchStudentProfileTab() (STEP 11E-A mục 4/6) — đổi danh sách tab. 3 tab
// students/sessions/attendance chỉ toggle display, nội dung bên trong là placeholder tĩnh đã có
// sẵn trong HTML (KHÔNG render/query gì thêm khi chuyển sang các tab này).
function switchGroupClassTab(tab) {
    gcCurrentTab = tab;
    document.querySelectorAll('#group-class-detail-view .sp-tab-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-sp-tab') === tab);
    });
    ['overview', 'students', 'sessions', 'attendance'].forEach(function(t) {
        var panel = document.getElementById('gc-tab-' + t);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    });

    // STEP 11F-B — tab "Học viên" giờ có nội dung thật (Enrollment), khác "sessions"/"attendance"
    // vẫn còn là placeholder tĩnh (ngoài phạm vi STEP này). Gọi qua window.* (KHÔNG import
    // js/group-class/enrollment.js ở đây — xem comment "tránh circular dependency" trong
    // index.html tại vị trí nạp enrollment.js). typeof-check để group-class.js không vỡ nếu
    // enrollment.js lỗi tải/chưa nạp kịp vì lý do nào đó.
    // STEP 11H-D: reset tab "Học viên" về VIEW 1 (danh sách) TRƯỚC KHI load lại — tránh hiển thị
    // lại Group Class Student Detail của 1 học sinh đã mở TRƯỚC KHI người dùng rời tab "Học viên"
    // (ví dụ mở chi tiết học sinh A, chuyển sang tab "Buổi học", quay lại "Học viên": phải thấy lại
    // danh sách, KHÔNG phải chi tiết học sinh A còn treo trên màn hình) — cùng nguyên tắc
    // loadGroupClassAttendanceIfNeeded() (attendance.js) tự reset về VIEW 1 mỗi lần vào tab. Gọi
    // qua window.* (KHÔNG import js/group-class/student-detail.js ở đây — cùng lý do "tránh
    // circular dependency" đã áp dụng cho enrollment.js/session.js/schedule.js/generator.js/
    // attendance.js ở trên). typeof-check để group-class.js không vỡ nếu student-detail.js lỗi
    // tải/chưa nạp kịp vì lý do nào đó.
    if (tab === 'students' && typeof window.resetGroupClassStudentDetailView === 'function') {
        window.resetGroupClassStudentDetailView();
    }

    if (tab === 'students' && typeof window.loadEnrollmentsIfNeeded === 'function') {
        window.loadEnrollmentsIfNeeded();
    }

    // STEP 11G-B — tab "Buổi học" giờ có nội dung thật (Group Session List + Create), khác
    // "attendance" vẫn còn là placeholder tĩnh (ngoài phạm vi STEP này). Gọi qua window.* (KHÔNG
    // import js/group-class/session.js ở đây — cùng lý do "tránh circular dependency" đã áp dụng
    // cho enrollment.js ở trên). typeof-check để group-class.js không vỡ nếu session.js lỗi
    // tải/chưa nạp kịp vì lý do nào đó.
    if (tab === 'sessions' && typeof window.loadGroupSessionsIfNeeded === 'function') {
        window.loadGroupSessionsIfNeeded();
    }

    // STEP 11G-B2-A — tab "Buổi học" giờ CÒN hiển thị thêm khối "Lịch học hàng tuần"
    // (public.group_class_schedules, xem js/group-class/schedule.js) NGAY TRÊN danh sách buổi
    // học đã có từ STEP 11G-B. Gọi qua window.* (KHÔNG import js/group-class/schedule.js ở đây —
    // cùng lý do "tránh circular dependency" đã áp dụng cho enrollment.js/session.js ở trên).
    // typeof-check để group-class.js không vỡ nếu schedule.js lỗi tải/chưa nạp kịp vì lý do nào đó.
    if (tab === 'sessions' && typeof window.loadGroupClassSchedulesIfNeeded === 'function') {
        window.loadGroupClassSchedulesIfNeeded();
    }

    // STEP 11G-C2-B — tab "Buổi học" giờ CÒN tự động chạy Group Session Generator (12-week
    // rolling window, xem js/group-class/generator.js) để đảm bảo group_sessions 'regular' của
    // các lịch học hàng tuần đang active đã được materialized trước khi Calendar/danh sách cần
    // đọc tới. Gọi qua window.* (KHÔNG import js/group-class/generator.js ở đây — cùng lý do
    // "tránh circular dependency" đã áp dụng cho enrollment.js/session.js/schedule.js ở trên).
    // typeof-check để group-class.js không vỡ nếu generator.js lỗi tải/chưa nạp kịp vì lý do nào
    // đó. KHÔNG await (giữ nguyên switchGroupClassTab() là hàm sync như trước, không chặn UI) —
    // Generator tự re-check activeGroupClassId/gcCurrentTab TRƯỚC KHI query (bên trong
    // generator.js) và ở đây TRƯỚC KHI refresh UI, nên không có rủi ro áp kết quả của 1 lớp/tab
    // khác đã chuyển sang trong lúc chờ mạng.
    if (tab === 'sessions' && typeof window.runGroupSessionGeneratorIfNeeded === 'function') {
        window.runGroupSessionGeneratorIfNeeded().then(function(result) {
            if (!result) return;
            if (result.status === 'error') {
                console.error('[GROUP SESSION GENERATOR] Auto-run FAILED:', result.error);
                if (typeof window.showToast === 'function') {
                    window.showToast('⚠️', 'Không thể tự động tạo buổi học', result.error || 'Lỗi không xác định.');
                }
                return;
            }
            // Chỉ refresh lại danh sách buổi học (session.js) nếu THỰC SỰ có session mới được tạo
            // VÀ người dùng vẫn đang đứng ở đúng lớp + đúng tab lúc Generator chạy xong (tránh ghi
            // đè UI của 1 lớp/tab khác họ đã chuyển sang trong lúc chờ mạng, cùng nguyên tắc
            // "chỉ áp dụng kết quả nếu vẫn còn đúng context" của enrollment.js).
            if (result.insertedCount > 0 && activeGroupClassId === result.groupClassId && gcCurrentTab === 'sessions' && typeof window.loadGroupSessions === 'function') {
                window.loadGroupSessions();
            }
        });
    }

    // STEP 11H-B — tab "Điểm danh" giờ có nội dung thật (xem js/group-class/attendance.js). Gọi
    // qua window.* (KHÔNG import js/group-class/attendance.js ở đây — cùng lý do "tránh circular
    // dependency" đã áp dụng cho enrollment.js/session.js/schedule.js/generator.js ở trên).
    // typeof-check để group-class.js không vỡ nếu attendance.js lỗi tải/chưa nạp kịp vì lý do nào
    // đó.
    if (tab === 'attendance' && typeof window.loadGroupClassAttendanceIfNeeded === 'function') {
        window.loadGroupClassAttendanceIfNeeded();
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention students.js mục "HTML COMPATIBILITY") — chỉ
// export những hàm được gọi trực tiếp từ onclick/onchange/oninput trong HTML hoặc từ
// switchTutorPage() trong script chính.
// ============================================================================
export {
    loadGroupClassesIfNeeded, loadGroupClasses, renderGroupClassList,
    applyGroupClassFilters, renderGroupClassFilterOptions,
    onGroupClassSearchInput, onGroupClassFilterChange,
    addNewGroupClass,
    openEditGroupClass, openEditGroupClassFromDetail, closeEditGroupClass, saveEditGroupClass,
    openGroupClassDetail, closeGroupClassDetail, switchGroupClassTab,
    syncGroupClassOverviewEnrollmentCount, refreshGroupClassOverviewAttendanceSummary,
    removeGroupClass
};

window.loadGroupClassesIfNeeded = loadGroupClassesIfNeeded;
window.onGroupClassSearchInput = onGroupClassSearchInput;
window.onGroupClassFilterChange = onGroupClassFilterChange;
window.addNewGroupClass = addNewGroupClass;
window.openEditGroupClass = openEditGroupClass;
window.openEditGroupClassFromDetail = openEditGroupClassFromDetail;
window.closeEditGroupClass = closeEditGroupClass;
window.saveEditGroupClass = saveEditGroupClass;
window.openGroupClassDetail = openGroupClassDetail;
window.closeGroupClassDetail = closeGroupClassDetail;
window.switchGroupClassTab = switchGroupClassTab;
// STEP 11F-B-FIX — gọi từ js/group-class/enrollment.js (mục V), KHÔNG phải từ HTML onclick.
window.syncGroupClassOverviewEnrollmentCount = syncGroupClassOverviewEnrollmentCount;
// STEP 11H-D — gọi từ js/group-class/attendance.js sau khi Save thành công (mục 15), KHÔNG phải
// từ HTML onclick, cùng lý do syncGroupClassOverviewEnrollmentCount ở trên.
window.refreshGroupClassOverviewAttendanceSummary = refreshGroupClassOverviewAttendanceSummary;
// STEP group-class-delete — gọi từ onclick="removeGroupClass(...)" trong renderGroupClassList().
window.removeGroupClass = removeGroupClass;
