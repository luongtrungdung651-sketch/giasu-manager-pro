// ============================================================================
// js/group-class/enrollment.js  —  STEP 11F-B/11F-C: GROUP CLASS ENROLLMENT
//                    (EXISTING STUDENT + NEW STUDENT + AUTO ENROLL + LEAVE CLASS)
// ============================================================================
// Đây là ES module thật (cùng convention js/group-class/group-class.js/js/students/
// students.js — xem comment trong index.html tại vị trí nạp module này). Module này tự expose
// các hàm cần thiết qua window ở cuối file để (a) onclick="..."/oninput="..." trong HTML gọi
// được, và (b) group-class.js (switchGroupClassTab) gọi lại qua window.loadEnrollmentsIfNeeded.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js/group-class.js/students.js định
// nghĩa (activeTutorId, activeGroupClassId, groupClassList, supabaseClient, escapeHtml, showToast,
// describeSupabaseError, formatDate, getLocalIsoDate, createStudentRecord). Module này KHÔNG
// import group-class.js (tránh circular dependency — group-class.js gọi ngược lại module này qua
// window.* trong switchGroupClassTab()) và KHÔNG import students.js (cùng convention: gọi
// createStudentRecord() như 1 global có sẵn trên window, giống hệt cách gọi showToast/
// describeSupabaseError — KHÔNG tạo static import giữa 2 module ngang hàng). Cùng lý do
// defer/module với các module khác: module bị hoãn, chạy SAU khi script chính đã chạy xong, và
// students.js LUÔN load TRƯỚC enrollment.js (xem thứ tự <script type="module"> trong index.html)
// nên tại thời điểm các hàm dưới đây THỰC SỰ được gọi (người dùng mở tab "Học viên"/bấm nút), mọi
// global trên — kể cả window.createStudentRecord — đã tồn tại.
//
// PHẠM VI STEP 11F-B (Case A — KHÔNG ĐỔI Ở STEP 11F-C):
//   1. Hiển thị danh sách học viên ACTIVE trong Group Class (tối đa 5).
//   2. Thêm MỘT Student ĐÃ TỒN TẠI vào Group Class (search + select + class_rate + insert).
//   3. Rời lớp (UPDATE status='left', KHÔNG DELETE).
//
// PHẠM VI STEP 11F-C (Case B — MỚI):
//   4. "+ Tạo học viên mới" từ modal Enrollment -> createStudentRecord() (students.js, INSERT
//      CHỈ students, KHÔNG student_schedules) -> INSERT group_class_enrollments (class_rate
//      riêng, KHÔNG dùng students.rate). Xem submitNewStudentEnrollment() bên dưới.
// ============================================================================

// ----------------------------------------------------------------------
// STATE (chỉ dùng trong module này — cùng convention gcSearchState/editingGroupClassId của
// group-class.js: state riêng của 1 module KHÔNG cần đưa vào core/state.js).
// ----------------------------------------------------------------------

// Cache danh sách enrollment ACTIVE của lớp đang mở — CONTEXT-AWARE theo activeGroupClassId
// (KHÔNG dùng boolean kiểu "enrollmentsLoaded = true", cùng lý do groupClassListLoadedForTutorId
// đã sửa ở STEP 11E-FIX: boolean trần sẽ tái tạo bug cache sai lớp khi chuyển Group Class A -> B,
// hoặc Admin chuyển Tutor A -> B).
var gcEnrollmentListCache = [];
var gcEnrollmentListLoadedForClassId = null;

// Cache danh sách Student của activeTutorId dùng để search trong modal "Thêm học viên" — nạp lại
// MỖI LẦN mở modal (không tái sử dụng cache cũ giữa các lần mở, tránh hiển thị Student vừa được
// tạo/xoá ở nơi khác nhưng cache modal chưa biết) — xem mục XI của đề bài STEP 11F-B.
var gcEligibleStudentsCache = [];

// Guard chống double-submit — cùng pattern addClassInFlight/saveEditClassInFlight (students.js),
// addGroupClassInFlight/saveEditGroupClassInFlight (group-class.js).
var addEnrollmentInFlight = false;
var leaveEnrollmentInFlight = false;

// State modal "Thêm học viên"
var enrollmentSearchQuery = '';
var selectedEnrollmentStudentId = null;
var selectedEnrollmentStudentName = null;

// ----------------------------------------------------------------------
// STATE — CASE B: "+ Tạo học viên mới" (STEP 11F-C, mục XIX)
// ----------------------------------------------------------------------
// gcNewStudentMode: đang ở section "New Student" (true) hay "Existing Student" (false, mặc định).
// KHÔNG dùng boolean rời rạc kiểu "newStudentCreated = true" — 2 biến dưới đây (id/name) vừa là
// cờ "đã tạo Student hay chưa" (id !== null) vừa mang chính dữ liệu cần cho retry (mục VIII/XIX):
// nếu Student đã INSERT thành công nhưng Enrollment INSERT fail, giữ lại student_id ở đây để lần
// bấm "Thử thêm vào lớp" kế tiếp dùng LẠI đúng student_id này, KHÔNG tạo duplicate Student.
var gcNewStudentMode = false;
var gcNewStudentCreatedId = null;
var gcNewStudentCreatedName = null;

// Guard chống double-submit riêng cho flow "Tạo học viên mới" — cùng pattern addEnrollmentInFlight
// ở trên, nhưng tách riêng vì flow này gồm 2 bước (INSERT students rồi INSERT enrollment) nên
// không dùng chung cờ với submitEnrollment() (Case A chỉ có 1 bước).
var newStudentEnrollmentInFlight = false;

// ----------------------------------------------------------------------
// LOAD (context-aware theo activeGroupClassId) + RENDER LIST TAB "HỌC VIÊN"
// ----------------------------------------------------------------------
// Được gọi từ switchGroupClassTab('students') (group-class.js) mỗi lần vào tab. Chỉ tái dùng
// cache khi cache đó THỰC SỰ thuộc về activeGroupClassId hiện tại — nếu vừa chuyển Group Class A
// -> B (activeGroupClassId đổi), điều kiện tự động false và bắt buộc query lại Supabase cho đúng
// lớp mới, KHÔNG bao giờ render nhầm cache của lớp trước đó (test F trong đề bài).
async function loadEnrollmentsIfNeeded() {
    if (gcEnrollmentListLoadedForClassId === activeGroupClassId) {
        renderEnrollmentList();
        return;
    }
    await loadEnrollments();
}

async function loadEnrollments() {
    var container = document.getElementById('gc-enrollment-list');
    if (!activeGroupClassId) return;

    if (container) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px; font-size:14px;">⏳ Đang tải học viên...</div>';
    }

    try {
        // Query trực tiếp group_class_enrollments + embed students(name, subject) qua FK
        // (mục VII đề bài). group_class_id = activeGroupClassId đã tự động chỉ trả về đúng lớp
        // thuộc activeTutorId đang active (Group Class List STEP 11E đã filter theo tutor_id khi
        // dựng groupClassList, activeGroupClassId luôn lấy từ 1 phần tử trong groupClassList đó
        // — không cần lọc lại tutor_id ở đây, tương tự cách group-class.js không lọc lại theo
        // tutor cho 1 group_class_id cụ thể khi mở Detail).
        // STEP 11H-D: thêm parent_name/parent_phone vào embed students(...) — 2 cột CÓ SẴN trên
        // public.students (đã dùng ở Search+Filter/modal "Tạo học viên mới"), KHÔNG phải cột mới —
        // chỉ để hiển thị thêm dòng "Phụ huynh" trên card (Phần 2 đề bài).
        var result = await supabaseClient
            .from('group_class_enrollments')
            .select('id, student_id, class_rate, status, joined_at, left_at, students(name, subject, parent_name, parent_phone)')
            .eq('group_class_id', activeGroupClassId)
            .eq('status', 'active')
            .order('joined_at', { ascending: true });

        if (result.error) {
            console.error('[ENROLLMENT] Tải danh sách học viên FAILED:', result.error);
            if (container) {
                container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Không tải được danh sách học viên.<br>' + escapeHtml(describeSupabaseError(result.error)) + '</div>';
            }
            return;
        }

        gcEnrollmentListCache = result.data || [];
        gcEnrollmentListLoadedForClassId = activeGroupClassId;
        renderEnrollmentList();
    } catch (err) {
        console.error('[ENROLLMENT] Tải danh sách học viên EXCEPTION:', err);
        if (container) {
            container.innerHTML = '<div style="color:#ef4444; text-align:center; padding:30px; font-size:14px;">⚠️ Lỗi không xác định khi tải danh sách học viên.</div>';
        }
    }
}

function renderEnrollmentList() {
    var container = document.getElementById('gc-enrollment-list');

    // STEP 11F-B-FIX (mục II/III/V): điểm HỘI TỤ duy nhất mỗi khi gcEnrollmentListCache thay đổi
    // hoặc được render lại từ cache (loadEnrollments() sau load/enroll/leave, HOẶC
    // loadEnrollmentsIfNeeded() nhánh cache-hit) — nên đây là nơi ĐÚNG để đồng bộ Sĩ số Overview,
    // KHÔNG cần thêm lời gọi rải rác ở submitEnrollment()/submitNewStudentEnrollment()/
    // leaveEnrollment() (cả 3 hàm đó đều tự gọi loadEnrollments() sau khi thành công, nên đều tự
    // động chạy qua đây). Đồng bộ này chạy trước cả early-return "!container" bên dưới — Overview
    // không phụ thuộc panel "Học viên" có tồn tại trong DOM hay không.
    syncOverviewEnrollmentCount();

    if (!container) return;

    if (gcEnrollmentListCache.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:30px; font-size:14px;">Chưa có học viên trong lớp.</div>';
        updateAddEnrollmentButtonState();
        return;
    }

    container.innerHTML = '';
    gcEnrollmentListCache.forEach(function(en) {
        var student = en.students || {};
        var idJs = "'" + String(en.id).replace(/'/g, "\\'") + "'";
        var nameJs = "'" + String(student.name || '').replace(/'/g, "\\'") + "'";
        var rateVnd = (Number(en.class_rate) || 0) * 1000;

        // STEP 11H-D: dòng "Phụ huynh" chỉ hiện khi students.parent_name CÓ dữ liệu (KHÔNG hiện
        // dòng rỗng "Phụ huynh: —" — field vốn tùy chọn ở modal tạo/enroll học viên). Nút "Xem chi
        // tiết" mở Group Class Student Detail (js/group-class/student-detail.js) — TRUYỀN
        // student_id (en.student_id), KHÔNG phải enrollment id, vì Detail tự query lại đúng
        // enrollment theo (activeGroupClassId, student_id).
        var studentIdJs = "'" + String(en.student_id).replace(/'/g, "\\'") + "'";
        var parentLine = student.parent_name
            ? ('<div style="color:var(--text-sub); font-size:12px; margin-top:2px;">Phụ huynh: ' + escapeHtml(student.parent_name) + (student.parent_phone ? (' · ' + escapeHtml(student.parent_phone)) : '') + '</div>')
            : '';

        var card = document.createElement('div');
        card.className = 'sp-card-mini';
        card.style.marginBottom = '10px';
        card.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">' +
                '<div>' +
                    '<div style="font-weight:700; color:var(--text-main); font-size:14px;">' + escapeHtml(student.name || 'Không tên') + '</div>' +
                    (student.subject ? '<div style="color:var(--text-sub); font-size:12.5px; margin-top:2px;">' + escapeHtml(student.subject) + '</div>' : '') +
                    parentLine +
                    '<div style="color:var(--text-sub); font-size:12px; margin-top:4px;">Học phí lớp: <strong style="color:var(--text-main);">' + rateVnd.toLocaleString('vi-VN') + ' đ/buổi</strong> · Vào lớp: ' + formatDate(en.joined_at) + '</div>' +
                '</div>' +
                '<div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">' +
                    '<button class="btn-secondary" style="padding:6px 12px; font-size:11.5px;" onclick="openGroupClassStudentDetail(' + studentIdJs + ')">Xem chi tiết</button>' +
                    '<button class="btn-secondary" style="padding:6px 12px; font-size:11.5px;" onclick="leaveEnrollment(' + idJs + ', ' + nameJs + ', this)">Rời lớp</button>' +
                '</div>' +
            '</div>';
        container.appendChild(card);
    });

    updateAddEnrollmentButtonState();
}

// Gọi group-class.js (Overview + KPI card "Sĩ số") qua window.* — KHÔNG import group-class.js
// (cùng lý do tránh circular dependency đã ghi ở đầu file: group-class.js gọi ngược lại module
// này qua window.loadEnrollmentsIfNeeded). group-class.js có thể chưa định nghĩa hàm này (ví dụ
// Group Class Detail hiện KHÔNG mở) — typeof-check để không throw trong trường hợp đó, cùng
// convention typeof-check của switchGroupClassTab() khi gọi ngược lại enrollment.js.
function syncOverviewEnrollmentCount() {
    if (typeof window.syncGroupClassOverviewEnrollmentCount === 'function') {
        window.syncGroupClassOverviewEnrollmentCount(activeGroupClassId, gcEnrollmentListCache.length);
    }
}

// Toggle nút "+ Thêm học viên" theo mục IX/XIII: enabled khi active count < 5, disabled + đổi
// label khi >= 5. Dùng cache hiện tại (gcEnrollmentListCache) để hiển thị NGAY, KHÔNG chờ round-
// trip Supabase — nhưng đây CHỈ là UX, mục XIII vẫn bắt buộc recheck fresh trước khi thực sự mở
// modal/submit (xem getActiveEnrollmentCount()).
function updateAddEnrollmentButtonState() {
    var btn = document.getElementById('gc-add-enrollment-btn');
    if (!btn) return;
    if (gcEnrollmentListCache.length >= 5) {
        btn.disabled = true;
        btn.innerText = 'Lớp đã đủ 5 học viên';
    } else {
        btn.disabled = false;
        btn.innerText = '+ Thêm học viên';
    }
}

// Đếm active enrollment TRỰC TIẾP từ Supabase (KHÔNG chỉ tin cache) — dùng trước khi mở modal
// VÀ trước khi submit (mục XIII: race condition giữa nhiều tab). Trả về null nếu không xác định
// được (lỗi mạng/Supabase) để caller tự quyết định (không âm thầm coi null là 0).
//
// STEP 11F-B-FIX: cũng được group-class.js gọi (qua window.getActiveEnrollmentCount, xem cuối
// file) làm fallback LIVE khi Overview mở mà cache CHƯA có sẵn (getCachedActiveEnrollmentCount()
// trả về null) — TÁI SỬ DỤNG nguyên hàm này, KHÔNG viết thêm 1 hàm đếm riêng cho Overview.
async function getActiveEnrollmentCount() {
    if (!activeGroupClassId) return null;
    try {
        var result = await supabaseClient
            .from('group_class_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('group_class_id', activeGroupClassId)
            .eq('status', 'active');
        if (result.error) {
            console.error('[ENROLLMENT] Đếm active enrollment FAILED:', result.error);
            return null;
        }
        return typeof result.count === 'number' ? result.count : (result.data || []).length;
    } catch (err) {
        console.error('[ENROLLMENT] Đếm active enrollment EXCEPTION:', err);
        return null;
    }
}

// STEP 11F-B-FIX (mục III/IV): ĐỌC-CHỈ, KHÔNG side-effect — group-class.js (Overview) gọi hàm
// này TRƯỚC KHI quyết định có cần query Supabase hay không. Trả về count đã cache nếu cache đó
// THỰC SỰ thuộc về activeGroupClassId hiện tại (cùng điều kiện context-aware với
// loadEnrollmentsIfNeeded() ở trên — không bao giờ trả về số liệu của lớp trước đó); trả về null
// nếu cache chưa sẵn sàng cho lớp này, để caller tự quyết định fallback (query live).
function getCachedActiveEnrollmentCount() {
    if (gcEnrollmentListLoadedForClassId === activeGroupClassId) {
        return gcEnrollmentListCache.length;
    }
    return null;
}

// ----------------------------------------------------------------------
// MODAL "THÊM HỌC VIÊN VÀO LỚP" (Existing Student CHỈ — xem "DO NOT IMPLEMENT CASE B" đầu file)
// ----------------------------------------------------------------------
async function openAddEnrollmentModal() {
    if (!activeGroupClassId) return;

    // Mục XIII: recheck trước khi MỞ modal, không chỉ tin nút UI (nút có thể đã stale nếu tab
    // khác vừa thêm học viên thứ 5 trong lúc tab này chưa refresh).
    var count = await getActiveEnrollmentCount();
    if (count === null) {
        showToast('⚠️', 'Không kiểm tra được sĩ số lớp', 'Vui lòng thử lại.');
        return;
    }
    if (count >= 5) {
        showToast('⚠️', 'Lớp đã đủ 5 học viên', '');
        await loadEnrollments(); // đồng bộ lại UI (nút/list) theo đúng số liệu mới nhất
        return;
    }

    selectedEnrollmentStudentId = null;
    selectedEnrollmentStudentName = null;
    enrollmentSearchQuery = '';

    // Mục XIX (STEP 11F-C): mỗi lần MỞ modal luôn bắt đầu lại từ Case A (Existing Student) —
    // KHÔNG được giữ lại "New Student" mode/state từ lần mở trước (resetNewStudentSectionState()
    // cũng được gọi lại ở closeAddEnrollmentModal(), gọi thêm ở đây để an toàn cho mọi đường mở
    // modal, không phụ thuộc việc lần đóng trước có chạy đúng đường closeAddEnrollmentModal() hay
    // không).
    resetNewStudentSectionState();

    var gc = (groupClassList || []).find(function(x) { return x.id === activeGroupClassId; });
    var nameEl = document.getElementById('ae-group-class-name');
    if (nameEl) nameEl.innerText = gc ? gc.name : '';

    var searchInput = document.getElementById('ae-student-search-input');
    if (searchInput) searchInput.value = '';
    var rateInput = document.getElementById('ae-class-rate');
    if (rateInput) rateInput.value = '';

    var selectedBox = document.getElementById('ae-selected-student-box');
    if (selectedBox) selectedBox.style.display = 'none';

    var errBox = document.getElementById('add-enrollment-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    var confirmBtn = document.getElementById('confirm-add-enrollment-btn');
    if (confirmBtn) confirmBtn.disabled = true;

    var modal = document.getElementById('add-enrollment-modal');
    if (modal) modal.classList.add('open');

    var listBox = document.getElementById('ae-student-search-results');
    if (listBox) listBox.innerHTML = '<div style="color:var(--text-sub); font-size:12.5px; padding:8px 0;">⏳ Đang tải danh sách học sinh...</div>';

    await loadEligibleStudentsForSearch();
    renderEnrollmentStudentSearchResults();
}

function closeAddEnrollmentModal() {
    var modal = document.getElementById('add-enrollment-modal');
    if (modal) modal.classList.remove('open');
    selectedEnrollmentStudentId = null;
    selectedEnrollmentStudentName = null;

    // Mục XV: Hủy (hoặc đóng modal sau khi enroll thành công) CHỈ đóng UI/dọn state phía client —
    // KHÔNG bao giờ tự động DELETE Student vừa tạo (nếu flow "New Student" đang dở dang, Student
    // đó vẫn tồn tại nguyên vẹn trong DB, độc lập với Enrollment).
    resetNewStudentSectionState();
}

// Dọn toàn bộ UI + state của section "New Student" (Case B) về trạng thái ban đầu — dùng chung
// bởi cả openAddEnrollmentModal() (mở lại từ đầu) và closeAddEnrollmentModal() (Hủy/đóng sau
// thành công). KHÔNG bao giờ gọi DELETE students ở đây (mục XV).
function resetNewStudentSectionState() {
    gcNewStudentMode = false;
    gcNewStudentCreatedId = null;
    gcNewStudentCreatedName = null;

    var existingSection = document.getElementById('ae-existing-student-section');
    var newSection = document.getElementById('ae-new-student-section');
    if (existingSection) existingSection.style.display = 'block';
    if (newSection) newSection.style.display = 'none';

    var confirmExistingBtn = document.getElementById('confirm-add-enrollment-btn');
    var confirmNewBtn = document.getElementById('confirm-new-student-enrollment-btn');
    if (confirmExistingBtn) confirmExistingBtn.style.display = 'inline-block';
    if (confirmNewBtn) { confirmNewBtn.style.display = 'none'; confirmNewBtn.innerText = 'Tạo và thêm vào lớp'; }

    var retryBanner = document.getElementById('ans-retry-banner');
    if (retryBanner) retryBanner.style.display = 'none';

    var nameInput = document.getElementById('ans-new-student-name');
    var parentNameInput = document.getElementById('ans-parent-name');
    var parentPhoneInput = document.getElementById('ans-parent-phone');
    var classRateInput = document.getElementById('ans-class-rate');
    var subjectDisplay = document.getElementById('ans-subject-readonly');
    if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
    if (parentNameInput) { parentNameInput.value = ''; parentNameInput.disabled = false; }
    if (parentPhoneInput) { parentPhoneInput.value = ''; parentPhoneInput.disabled = false; }
    if (classRateInput) classRateInput.value = '';
    if (subjectDisplay) subjectDisplay.innerText = '—';

    var backBtn = document.getElementById('ans-back-btn');
    if (backBtn) backBtn.disabled = false;
}

// Mục XI: nạp TOÀN BỘ Student của activeTutorId TỰ MÌNH (KHÔNG phụ thuộc việc user đã mở trang
// Students trước đó — query thẳng Supabase mỗi lần mở modal, không tái dùng classList của
// Students module). Chỉ lấy field tối thiểu cần thiết (id, name, subject, status).
async function loadEligibleStudentsForSearch() {
    gcEligibleStudentsCache = [];
    if (!activeTutorId) return;

    try {
        var result = await supabaseClient
            .from('students')
            .select('id, name, subject, status')
            .eq('tutor_id', activeTutorId)
            .order('name', { ascending: true });

        if (result.error) {
            console.error('[ENROLLMENT] Tải danh sách học sinh để tìm kiếm FAILED:', result.error);
            var listBox = document.getElementById('ae-student-search-results');
            if (listBox) {
                listBox.innerHTML = '<div style="color:#ef4444; font-size:12.5px; padding:8px 0;">⚠️ Không tải được danh sách học sinh.<br>' + escapeHtml(describeSupabaseError(result.error)) + '</div>';
            }
            return;
        }

        gcEligibleStudentsCache = result.data || [];
    } catch (err) {
        console.error('[ENROLLMENT] Tải danh sách học sinh để tìm kiếm EXCEPTION:', err);
        var listBox2 = document.getElementById('ae-student-search-results');
        if (listBox2) {
            listBox2.innerHTML = '<div style="color:#ef4444; font-size:12.5px; padding:8px 0;">⚠️ Lỗi không xác định khi tải danh sách học sinh.</div>';
        }
    }
}

function onEnrollmentStudentSearchInput(value) {
    enrollmentSearchQuery = value;
    renderEnrollmentStudentSearchResults();
}

// Mục XII: loại bỏ khỏi kết quả tìm kiếm những Student đã active trong Group Class hiện tại
// (UX optimization — DB unique index (group_class_id, student_id) WHERE status='active' vẫn là
// source of truth thật sự, xem submitEnrollment()).
function renderEnrollmentStudentSearchResults() {
    var listBox = document.getElementById('ae-student-search-results');
    if (!listBox) return;

    var activeStudentIds = gcEnrollmentListCache.map(function(en) { return en.student_id; });
    var q = (enrollmentSearchQuery || '').trim().toLowerCase();

    var visible = gcEligibleStudentsCache.filter(function(s) {
        if (activeStudentIds.indexOf(s.id) !== -1) return false;
        if (q) {
            var hay = [s.name, s.subject].filter(Boolean).join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        return true;
    });

    if (visible.length === 0) {
        listBox.innerHTML = '<div style="color:#9ca3af; font-size:12.5px; padding:8px 0;">Không tìm thấy học sinh phù hợp.</div>';
        return;
    }

    listBox.innerHTML = '';
    visible.forEach(function(s) {
        var isSelected = selectedEnrollmentStudentId === s.id;
        var row = document.createElement('div');
        row.style.cssText = 'padding:8px 10px; border-radius:8px; cursor:pointer; font-size:13.5px; display:flex; align-items:center; gap:6px;' +
            (isSelected ? ' background:var(--accent-dim); color:var(--accent); font-weight:700;' : ' color:var(--text-main);');
        row.innerHTML = '<span>' + (isSelected ? '●' : '○') + '</span><span>' + escapeHtml(s.name || 'Không tên') +
            (s.subject ? ' <span style="color:var(--text-sub); font-weight:400;">— ' + escapeHtml(s.subject) + '</span>' : '') + '</span>';
        row.onclick = function() { selectEnrollmentStudent(s.id, s.name); };
        listBox.appendChild(row);
    });
}

function selectEnrollmentStudent(id, name) {
    selectedEnrollmentStudentId = id;
    selectedEnrollmentStudentName = name;
    renderEnrollmentStudentSearchResults(); // vẽ lại để highlight đúng 1 dòng vừa chọn

    var selectedBox = document.getElementById('ae-selected-student-box');
    var selectedNameEl = document.getElementById('ae-selected-student-name');
    if (selectedNameEl) selectedNameEl.innerText = name || 'Không tên';
    if (selectedBox) selectedBox.style.display = 'block';

    var confirmBtn = document.getElementById('confirm-add-enrollment-btn');
    if (confirmBtn) confirmBtn.disabled = false;

    var errBox = document.getElementById('add-enrollment-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
}

// ----------------------------------------------------------------------
// SUBMIT — INSERT group_class_enrollments (mục XV/XVI/XVII)
// ----------------------------------------------------------------------
async function submitEnrollment() {
    var errBox = document.getElementById('add-enrollment-error');
    function showModalError(msg) {
        if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
        else { alert(msg); }
    }
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    if (!activeGroupClassId) return;
    if (!selectedEnrollmentStudentId) { showModalError('Vui lòng chọn học viên.'); return; }

    var rateInput = document.getElementById('ae-class-rate');
    var rateRaw = rateInput ? rateInput.value.trim() : '';
    if (rateRaw === '') { showModalError('Vui lòng nhập học phí lớp nhóm.'); return; }
    var classRate = Number(rateRaw);
    if (isNaN(classRate) || classRate < 0) { showModalError('Học phí lớp nhóm không hợp lệ.'); return; }

    // Mục XVII: guard chống double-submit.
    if (addEnrollmentInFlight) return;
    addEnrollmentInFlight = true;
    var confirmBtn = document.getElementById('confirm-add-enrollment-btn');
    var confirmBtnOrigText = confirmBtn ? confirmBtn.innerText : null;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = 'Đang lưu...'; }

    try {
        // Mục XIII: recheck active count NGAY TRƯỚC KHI insert (không chỉ tin state lúc mở modal
        // — có thể tab khác vừa thêm học viên thứ 5 trong lúc modal này đang mở).
        var count = await getActiveEnrollmentCount();
        if (count === null) { showModalError('⚠️ Không kiểm tra được sĩ số lớp, vui lòng thử lại.'); return; }
        if (count >= 5) {
            showModalError('Lớp đã đủ 5 học viên.');
            await loadEnrollments();
            return;
        }

        // KHÔNG gửi joined_at (DB default CURRENT_DATE), KHÔNG gửi tutor_id (enrollment không có
        // cột này — ownership qua group_class_id -> group_classes -> tutor, mục XV).
        var insertResult = await supabaseClient
            .from('group_class_enrollments')
            .insert({
                group_class_id: activeGroupClassId,
                student_id: selectedEnrollmentStudentId,
                class_rate: classRate,
                status: 'active'
            })
            .select()
            .single();

        if (insertResult.error || !insertResult.data) {
            console.error('[ENROLLMENT] Thêm học viên vào lớp FAILED:', insertResult.error);
            var errMsg;
            // Mục XVI: 23505 (UNIQUE active enrollment) -> thông báo thân thiện riêng. describeSupabaseError()
            // (index.html) CHƯA có nhánh 23505 — CHỦ Ý xử lý cục bộ ở đây thay vì sửa hàm dùng
            // chung đó (tránh ảnh hưởng lan rộng tới các nơi khác đang gọi describeSupabaseError,
            // đúng mục XVI "không refactor utility toàn bộ" — đây còn bảo thủ hơn cả việc thêm 1
            // nhánh vào đó).
            if (insertResult.error && insertResult.error.code === '23505') {
                errMsg = 'Học viên này đã có mặt trong lớp.';
            } else {
                errMsg = insertResult.error ? describeSupabaseError(insertResult.error) : 'không nhận được dữ liệu trả về';
            }
            showModalError('⚠️ Không thể thêm học viên: ' + errMsg);
            return; // KHÔNG đóng modal, KHÔNG hiển thị success (mục XVI)
        }

        showToast('✅', 'Đã thêm học viên vào lớp', selectedEnrollmentStudentName || '');
        closeAddEnrollmentModal();
        await loadEnrollments(); // refresh danh sách + nút "+ Thêm học viên" (mục XVII/XIX)
    } catch (err) {
        console.error('[ENROLLMENT] Thêm học viên vào lớp EXCEPTION:', err);
        showModalError('⚠️ Lỗi không xác định khi thêm học viên.');
    } finally {
        addEnrollmentInFlight = false;
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = confirmBtnOrigText; }
    }
}

// ----------------------------------------------------------------------
// CASE B — "+ TẠO HỌC VIÊN MỚI" (STEP 11F-C, mục III/IV; form đơn giản hoá ở STEP 11F-C-FIX-2)
// ----------------------------------------------------------------------
// Chuyển modal từ Case A (Existing Student) sang Case B (New Student). Chỉ có thể bấm nút này
// từ section Existing Student -> LUÔN LUÔN là khởi đầu MỘT flow "New Student" MỚI, nên reset
// sạch state cũ (không có flow "New Student" dang dở nào tồn tại trước khi hàm này chạy).
function openCreateNewStudentForEnrollment() {
    gcNewStudentMode = true;
    gcNewStudentCreatedId = null;
    gcNewStudentCreatedName = null;

    var existingSection = document.getElementById('ae-existing-student-section');
    var newSection = document.getElementById('ae-new-student-section');
    if (existingSection) existingSection.style.display = 'none';
    if (newSection) newSection.style.display = 'block';

    var retryBanner = document.getElementById('ans-retry-banner');
    if (retryBanner) retryBanner.style.display = 'none';

    // STEP 11F-C-FIX-2 (mục II/VII): Môn học KHÔNG hỏi user — hiển thị READONLY từ
    // group_classes.subject của đúng activeGroupClassId (groupClassList đã có sẵn trong bộ nhớ,
    // KHÔNG query lại Supabase chỉ để lấy 1 giá trị đã có).
    var subjectDisplay = document.getElementById('ans-subject-readonly');
    if (subjectDisplay) {
        var gc = (groupClassList || []).find(function(x) { return x.id === activeGroupClassId; });
        subjectDisplay.innerText = (gc && gc.subject) ? gc.subject : '—';
    }

    var nameInput = document.getElementById('ans-new-student-name');
    var parentNameInput = document.getElementById('ans-parent-name');
    var parentPhoneInput = document.getElementById('ans-parent-phone');
    var classRateInput = document.getElementById('ans-class-rate');
    if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
    if (parentNameInput) { parentNameInput.value = ''; parentNameInput.disabled = false; }
    if (parentPhoneInput) { parentPhoneInput.value = ''; parentPhoneInput.disabled = false; }
    if (classRateInput) classRateInput.value = '';

    var backBtn = document.getElementById('ans-back-btn');
    if (backBtn) backBtn.disabled = false;

    var confirmExistingBtn = document.getElementById('confirm-add-enrollment-btn');
    var confirmNewBtn = document.getElementById('confirm-new-student-enrollment-btn');
    if (confirmExistingBtn) confirmExistingBtn.style.display = 'none';
    if (confirmNewBtn) { confirmNewBtn.style.display = 'inline-block'; confirmNewBtn.innerText = 'Tạo và thêm vào lớp'; }

    var errBox = document.getElementById('add-enrollment-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
}

// Quay lại section Existing Student. Mục XV: nếu Student đã được tạo (gcNewStudentCreatedId !==
// null, Enrollment đang chờ retry), KHÔNG cho quay lại — tránh việc user bỏ dở retry rồi vô tình
// tạo thêm 1 Student khác trong khi Student cũ vẫn "mồ côi" (đã có trong DB nhưng chưa enroll và
// UI không còn state để retry nó nữa). Nút back đã bị disable ở showNewStudentRetryState() nên
// nhánh này chỉ là lớp bảo vệ thứ 2 (phòng khi disabled bị gỡ bởi thao tác khác).
function backToExistingStudentSearch() {
    if (gcNewStudentCreatedId !== null) return;
    gcNewStudentMode = false;

    var existingSection = document.getElementById('ae-existing-student-section');
    var newSection = document.getElementById('ae-new-student-section');
    if (existingSection) existingSection.style.display = 'block';
    if (newSection) newSection.style.display = 'none';

    var confirmExistingBtn = document.getElementById('confirm-add-enrollment-btn');
    var confirmNewBtn = document.getElementById('confirm-new-student-enrollment-btn');
    if (confirmNewBtn) confirmNewBtn.style.display = 'none';
    if (confirmExistingBtn) confirmExistingBtn.style.display = 'inline-block';

    var errBox = document.getElementById('add-enrollment-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
}

// Chuyển UI section "New Student" sang trạng thái "retry" (mục VIII): Student ĐÃ tồn tại trong DB
// (studentId lưu ở gcNewStudentCreatedId), chỉ Enrollment CHƯA thành công. Khoá Họ tên/Tên phụ
// huynh/SĐT phụ huynh (sửa input lúc này KHÔNG có tác dụng gì lên record đã INSERT — môn học vốn
// đã readonly từ trước), chỉ Học phí lớp nhóm còn sửa được cho lần thử tiếp theo. Khoá luôn nút
// "Quay lại" (mục XV).
function showNewStudentRetryState(studentName) {
    var retryBanner = document.getElementById('ans-retry-banner');
    var retryNameEl = document.getElementById('ans-retry-student-name');
    if (retryNameEl) retryNameEl.innerText = studentName || 'học viên';
    if (retryBanner) retryBanner.style.display = 'block';

    var nameInput = document.getElementById('ans-new-student-name');
    var parentNameInput = document.getElementById('ans-parent-name');
    var parentPhoneInput = document.getElementById('ans-parent-phone');
    if (nameInput) nameInput.disabled = true;
    if (parentNameInput) parentNameInput.disabled = true;
    if (parentPhoneInput) parentPhoneInput.disabled = true;

    var backBtn = document.getElementById('ans-back-btn');
    if (backBtn) backBtn.disabled = true;

    var confirmBtn = document.getElementById('confirm-new-student-enrollment-btn');
    if (confirmBtn) confirmBtn.innerText = 'Thử thêm vào lớp';
}

// STEP 11F-C-FIX (mục "CREATE STUDENT"): students.rate là NOT NULL/bắt buộc phải có giá trị để
// createStudentRecord() INSERT được, nhưng field "Học phí học viên" đã bị bỏ khỏi UI (trùng UX
// với "Học phí lớp nhóm"). Dùng LẠI đúng default hiện có của form Student 1-to-1
// (#student-rate value="150", index.html) làm giá trị nội bộ — KHÔNG hỏi user thêm lần nữa, KHÔNG
// hard-code một business rule mới, KHÔNG đổi schema/constraint.
var NEW_STUDENT_DEFAULT_RATE = 150;

// ----------------------------------------------------------------------
// SUBMIT — CASE B: TẠO STUDENT MỚI + AUTO ENROLL (mục V/VI/VIII/IX/X/XI/XVII)
// ----------------------------------------------------------------------
// isRetry (gcNewStudentCreatedId !== null): Student ĐÃ được INSERT thành công ở lần bấm trước
// nhưng Enrollment INSERT lần đó fail -> hàm này SKIP bước tạo Student, dùng LẠI đúng student_id
// cũ, CHỈ thử lại INSERT group_class_enrollments (mục VIII: "Không tạo duplicate Student").
async function submitNewStudentEnrollment() {
    var errBox = document.getElementById('add-enrollment-error');
    function showModalError(msg) {
        if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
        else { alert(msg); }
    }
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    if (!activeGroupClassId) return;

    var isRetry = gcNewStudentCreatedId !== null;

    var nameInput = document.getElementById('ans-new-student-name');
    var parentNameInput = document.getElementById('ans-parent-name');
    var parentPhoneInput = document.getElementById('ans-parent-phone');
    var classRateInput = document.getElementById('ans-class-rate');

    // Học phí lớp nhóm luôn bắt buộc, kể cả khi retry (mục IX: class_rate riêng, có thể sửa lại
    // cho lần thử tiếp theo).
    var classRateRaw = classRateInput ? classRateInput.value.trim() : '';
    if (classRateRaw === '') { showModalError('Vui lòng nhập học phí lớp nhóm.'); return; }
    var classRate = Number(classRateRaw);
    if (isNaN(classRate) || classRate < 0) { showModalError('Học phí lớp nhóm không hợp lệ.'); return; }

    // Mục II/VII (STEP 11F-C-FIX-2): Môn học KHÔNG hỏi user — LUÔN lấy từ group_classes.subject
    // của activeGroupClassId (groupClassList đã có sẵn trong bộ nhớ). Validate lại ở đây (không
    // chỉ tin dòng readonly hiển thị) để tránh insert students.subject rỗng nếu vì lý do nào đó
    // Group Class không có subject.
    var gc = (groupClassList || []).find(function(x) { return x.id === activeGroupClassId; });
    var subject = gc && gc.subject ? gc.subject : '';
    if (!subject) { showModalError('⚠️ Không xác định được môn học của lớp — vui lòng thử lại.'); return; }

    // Mục IV: Tên phụ huynh/SĐT phụ huynh là TÙY CHỌN (cùng cách xử lý parent_phone hiện có ở
    // saveStudentInfoCard(), index.html — không bắt buộc, map thẳng vào students.parent_name/
    // students.parent_phone, KHÔNG tạo model phụ huynh riêng — mục VIII).
    var parentName = parentNameInput ? parentNameInput.value.trim() : '';
    var parentPhone = parentPhoneInput ? parentPhoneInput.value.trim() : '';

    // Mục III: chỉ validate Họ tên khi CHƯA tạo Student (retry thì bỏ qua toàn bộ — input đã bị
    // khoá và không còn ý nghĩa). Không còn field "Học phí học viên" để validate (STEP 11F-C-FIX)
    // — rate dùng NEW_STUDENT_DEFAULT_RATE ở bước gọi createStudentRecord() bên dưới.
    var name, rate;
    if (!isRetry) {
        name = nameInput ? nameInput.value.trim() : '';
        if (!name) { showModalError('Vui lòng nhập họ và tên học sinh.'); return; }
        rate = NEW_STUDENT_DEFAULT_RATE;
    }

    // Mục X: guard chống double-submit — chung cho cả 2 bước (tạo Student + enroll).
    if (newStudentEnrollmentInFlight) return;
    newStudentEnrollmentInFlight = true;
    var confirmBtn = document.getElementById('confirm-new-student-enrollment-btn');
    var confirmBtnOrigText = confirmBtn ? confirmBtn.innerText : null;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = isRetry ? 'Đang thử lại...' : 'Đang lưu...'; }
    var backBtn = document.getElementById('ans-back-btn');
    if (backBtn) backBtn.disabled = true;

    try {
        // Mục V/XI: recheck active count NGAY TRƯỚC KHI tạo Student (fresh) HOẶC trước khi enroll
        // (retry) — không chỉ tin state lúc mở modal/section trước đó. Nếu >= 5: KHÔNG tạo
        // Student, KHÔNG insert enrollment (mục V — áp dụng cho cả fresh lẫn retry, vì check này
        // luôn nằm TRƯỚC bước tạo Student bên dưới).
        var count = await getActiveEnrollmentCount();
        if (count === null) { showModalError('⚠️ Không kiểm tra được sĩ số lớp, vui lòng thử lại.'); return; }
        if (count >= 5) {
            showModalError('Lớp đã đủ 5 học viên.');
            await loadEnrollments();
            return;
        }

        var studentId = gcNewStudentCreatedId;
        var studentName = gcNewStudentCreatedName;

        if (!isRetry) {
            // Mục VI/VII: CHỈ dùng createStudentRecord() (js/students/students.js) — hàm đó CHỈ
            // INSERT students, KHÔNG đụng student_schedules (khác addNewClassActual() của flow
            // 1-to-1, không bị ảnh hưởng gì ở đây). subject lấy từ Group Class (KHÔNG hard-code,
            // KHÔNG lấy từ input tự do). parentName/parentPhone map thẳng tới students.parent_name/
            // students.parent_phone (2 cột có sẵn, STEP 11F-C-FIX-2 mục IV) — truyền '' (chuỗi
            // rỗng) khi user bỏ trống, createStudentRecord() tự chuyển '' thành null khi INSERT.
            var studentResult = await createStudentRecord(name, subject, rate, parentName, parentPhone);
            if (studentResult.error || !studentResult.data) {
                console.error('[ENROLLMENT] Tạo học viên mới FAILED:', studentResult.error);
                showModalError('⚠️ Không thể tạo học viên: ' + (studentResult.error ? describeSupabaseError(studentResult.error) : 'không nhận được dữ liệu trả về'));
                return; // Mục XVII: Student CHƯA tạo được -> KHÔNG enroll, giữ form để retry tạo lại
            }
            studentId = studentResult.data.id;
            studentName = studentResult.data.name != null ? studentResult.data.name : name;

            // Mục VIII/XIX: lưu lại student_id vừa tạo NGAY (trước khi thử enroll) — nếu bước
            // enroll bên dưới fail, state này vẫn còn để lần bấm sau retry đúng Student này,
            // KHÔNG tạo duplicate Student.
            gcNewStudentCreatedId = studentId;
            gcNewStudentCreatedName = studentName;
        }

        var insertResult = await supabaseClient
            .from('group_class_enrollments')
            .insert({
                group_class_id: activeGroupClassId,
                student_id: studentId,
                class_rate: classRate,
                status: 'active'
            })
            .select()
            .single();

        if (insertResult.error || !insertResult.data) {
            console.error('[ENROLLMENT] Thêm học viên mới vào lớp FAILED:', insertResult.error);
            var errMsg;
            if (insertResult.error && insertResult.error.code === '23505') {
                errMsg = 'Học viên này đã có mặt trong lớp.';
            } else {
                errMsg = insertResult.error ? describeSupabaseError(insertResult.error) : 'không nhận được dữ liệu trả về';
            }
            // Mục VIII: Student ĐÃ tạo (fresh vừa xong hoặc từ lần thử trước) nhưng Enrollment
            // fail — KHÔNG được nói toàn bộ flow thành công, giữ Student trong UI, chuyển modal
            // sang trạng thái retry (KHÔNG đóng modal, KHÔNG tạo Student lần nữa ở lần bấm sau).
            showNewStudentRetryState(studentName);
            showModalError('⚠️ Đã tạo học viên nhưng chưa thể thêm vào lớp: ' + errMsg);
            return;
        }

        showToast('✅', 'Đã thêm học viên vào lớp', studentName || '');
        closeAddEnrollmentModal(); // mục XIV: đóng modal + reset state (resetNewStudentSectionState())
        await loadEnrollments(); // mục XIV: refresh danh sách + sĩ số
    } catch (err) {
        console.error('[ENROLLMENT] Tạo học viên mới + thêm vào lớp EXCEPTION:', err);
        if (gcNewStudentCreatedId !== null) {
            // Student có thể đã tạo thành công trước khi exception xảy ra (ví dụ lỗi mạng ngay
            // lúc insert enrollment) — vẫn phải giữ state retry, KHÔNG được coi như chưa có gì.
            showNewStudentRetryState(gcNewStudentCreatedName);
            showModalError('⚠️ Đã tạo học viên nhưng chưa thể thêm vào lớp (lỗi không xác định). Vui lòng thử lại.');
        } else {
            showModalError('⚠️ Lỗi không xác định khi tạo học viên.');
        }
    } finally {
        newStudentEnrollmentInFlight = false;
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = confirmBtnOrigText; }
        // Nếu Student đã tạo (đang chờ retry), nút "Quay lại" phải TIẾP TỤC bị khoá sau khi
        // request kết thúc (mục XV) — chỉ mở lại khi gcNewStudentCreatedId thật sự null.
        if (backBtn) backBtn.disabled = (gcNewStudentCreatedId !== null);
    }
}

// ----------------------------------------------------------------------
// RỜI LỚP — UPDATE status='left' (mục XVIII/XIX, KHÔNG DELETE)
// ----------------------------------------------------------------------
async function leaveEnrollment(enrollmentId, studentName, btnEl) {
    // Mục XIX: guard chống double-submit — confirm() chặn được double-click TRONG lúc dialog
    // đang mở, nhưng không chặn click thứ 2 SAU khi đã bấm OK trong lúc UPDATE đang await (cùng
    // lý do removeClassInFlight ở students.js).
    if (leaveEnrollmentInFlight) return;
    if (!confirm('Xác nhận cho ' + (studentName || 'học viên này') + ' rời lớp?')) return;

    leaveEnrollmentInFlight = true;
    var origText = btnEl ? btnEl.innerText : null;
    if (btnEl) { btnEl.disabled = true; btnEl.innerText = 'Đang cập nhật...'; }

    try {
        // Mục XX: left_at dùng ngày hiện tại theo utility date sẵn có của project
        // (getLocalIsoDate, js/core/utils.js) — KHÔNG tự tạo cách xử lý timezone mới.
        var updResult = await supabaseClient
            .from('group_class_enrollments')
            .update({ status: 'left', left_at: getLocalIsoDate(new Date()) })
            .eq('id', enrollmentId)
            .select()
            .single();

        if (updResult.error || !updResult.data) {
            console.error('[ENROLLMENT] Rời lớp FAILED:', updResult.error);
            showToast('⚠️', 'Không thể cập nhật', updResult.error ? describeSupabaseError(updResult.error) : 'không nhận được dữ liệu trả về');
            return;
        }

        showToast('✅', 'Đã cập nhật', (studentName || 'Học viên') + ' đã rời lớp');
        // Mục XIX: refresh enrollment list — Student không còn nằm trong ACTIVE list, slot được
        // giải phóng (Student vẫn tồn tại nguyên vẹn trong students, có thể enroll lại — mục E
        // test trong đề bài).
        await loadEnrollments();
    } catch (err) {
        console.error('[ENROLLMENT] Rời lớp EXCEPTION:', err);
        showToast('⚠️', 'Lỗi không xác định', 'Vui lòng thử lại.');
    } finally {
        leaveEnrollmentInFlight = false;
        // btnEl có thể đã bị gỡ khỏi DOM do loadEnrollments() vừa render lại toàn bộ container —
        // gán lại thuộc tính lên 1 node đã detach vô hại (không throw, không có tác dụng hiển thị).
        if (btnEl) { btnEl.disabled = false; btnEl.innerText = origText; }
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention group-class.js/students.js mục "HTML
// COMPATIBILITY") — chỉ export những entry point thực sự cần cho onclick/oninput trong HTML
// hoặc để group-class.js gọi lại (loadEnrollmentsIfNeeded).
// ============================================================================
export {
    loadEnrollmentsIfNeeded, loadEnrollments, renderEnrollmentList,
    openAddEnrollmentModal, closeAddEnrollmentModal,
    onEnrollmentStudentSearchInput, selectEnrollmentStudent,
    submitEnrollment, leaveEnrollment,
    openCreateNewStudentForEnrollment, backToExistingStudentSearch, submitNewStudentEnrollment,
    getActiveEnrollmentCount, getCachedActiveEnrollmentCount
};

window.loadEnrollmentsIfNeeded = loadEnrollmentsIfNeeded;
window.openAddEnrollmentModal = openAddEnrollmentModal;
window.closeAddEnrollmentModal = closeAddEnrollmentModal;
window.onEnrollmentStudentSearchInput = onEnrollmentStudentSearchInput;
window.selectEnrollmentStudent = selectEnrollmentStudent;
window.submitEnrollment = submitEnrollment;
window.leaveEnrollment = leaveEnrollment;
window.openCreateNewStudentForEnrollment = openCreateNewStudentForEnrollment;
window.backToExistingStudentSearch = backToExistingStudentSearch;
window.submitNewStudentEnrollment = submitNewStudentEnrollment;
// STEP 11F-B-FIX — gọi từ js/group-class/group-class.js (Overview "Sĩ số"), KHÔNG phải từ HTML.
window.getActiveEnrollmentCount = getActiveEnrollmentCount;
window.getCachedActiveEnrollmentCount = getCachedActiveEnrollmentCount;
