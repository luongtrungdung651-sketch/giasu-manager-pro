// ============================================================================
// js/core/state.js  —  STEP 8B: CENTRALIZE SHARED APPLICATION STATE
// ============================================================================
// Đây là single source of truth cho SHARED STATE dùng chung nhiều feature
// (Auth, Students, Lessons, Calendar, Finance, Reports, Admin). KHÔNG chứa
// state cục bộ của riêng một trang/module — xem báo cáo STEP 8B mục B/C để
// biết danh sách state CHỦ Ý KHÔNG di chuyển vào đây và lý do.
//
// ĐÂY LÀ CLASSIC SCRIPT (KHÔNG PHẢI type="module") — KHÁC VỚI toast.js/
// utils.js/supabase.js/students.js/lessons.js/calendar.js. Lý do bắt buộc:
// các module type="module" bị TRÌ HOÃN (defer) và chỉ chạy SAU KHI toàn bộ
// tài liệu (kể cả classic <script> chính bên dưới) đã parse xong — đúng thiết
// kế từ STEP 7B (xem comment trong index.html). Nếu state.js cũng là module,
// nó sẽ chạy SAU script chính, trong khi script chính lại có dòng gán đồng bộ
// ngay khi parse (currentSelectedMonth = ... ở index.html) — nếu state.js
// chạy sau và gán lại giá trị khởi tạo, nó sẽ GHI ĐÈ mất giá trị đó → đổi
// behavior (điều TUYỆT ĐỐI không được phép ở bước này). Do đó state.js PHẢI
// là classic script và PHẢI được nạp TRƯỚC thẻ <script> chính trong index.html
// để đảm bảo mọi giá trị khởi tạo dưới đây có mặt trước khi bất kỳ dòng nào
// của script chính hoặc của các module khác chạy tới.
//
// DEPENDENCY (đúng mục 8 của STEP 8B): state.js là tầng THẤP NHẤT — KHÔNG
// import/đọc bất kỳ thứ gì từ Students/Lessons/Calendar/Finance/Reports.
// Ngược lại, script chính và các feature module ĐỌC/GHI các state dưới đây
// qua window.* như trước khi tách (không có phụ thuộc ngược).
//
// KHÔNG đổi giá trị khởi tạo, KHÔNG đổi thời điểm gán so với bản gốc — đây
// CHỈ là di chuyển VỊ TRÍ khai báo, giữ nguyên 100% behavior.
// ============================================================================

// ----------------------------------------------------------------------
// A. SESSION / AUTH — "đang đăng nhập là ai" — dùng chung TOÀN BỘ app.
// Nguyên bản: khai báo tại index.html trong khối "===== AUTH SYSTEM =====".
// ----------------------------------------------------------------------
window.currentUser = null;
window.currentTutor = null;               // Hồ sơ Tutor lấy từ Supabase khi đăng nhập qua Supabase Auth
window.currentTutorAuthEmail = null;      // Email đăng nhập Supabase Auth của phiên Tutor hiện tại — chỉ để HIỂN THỊ trong Settings, không dùng để re-auth ở đâu khác ngoài saveSupabasePassword() (hàm đó tự lấy lại từ session, không phụ thuộc biến này)
window.isSupabaseTutorSession = false;    // true khi phiên hiện tại là Tutor đăng nhập qua Supabase Auth
window.currentAdminProfile = null;        // Hồ sơ Admin (bảng profiles) khi đăng nhập qua Supabase Auth
window.isSupabaseAdminSession = false;    // true khi phiên hiện tại là Admin đăng nhập qua Supabase Auth (có JWT thật)
// activeTutorId: tutor_id (Supabase) mà classList hiện tại thuộc về, dùng bởi addNewClass/removeClass/saveEditClass
// để biết ghi/sửa/xóa đúng Tutor nào lên Supabase. Được set khi Tutor tự đăng nhập (= chính họ)
// HOẶC khi Admin mở "Xem chi tiết" một Tutor (= Tutor đang được Admin quản lý). null khi dùng tài khoản local.
window.activeTutorId = null;
// isAdminManagingTutor: true khi trang Tutor Dashboard (main-page-view) đang được MỞ BỞI ADMIN để quản lý
// hộ một Tutor (không phải Tutor tự đăng nhập). Dùng để hiện banner "đang quản lý hộ" + nút quay lại Admin,
// và để phân biệt quyền khi cần (ghi cùng logic, chỉ khác context hiển thị).
window.isAdminManagingTutor = false;
window.adminManagedTutorInfo = null;      // { id, display_name, email } của Tutor đang được Admin quản lý

// ----------------------------------------------------------------------
// B. SELECTION — "đang chọn gì" — dùng chung giữa Students/Lessons/Calendar/
// Finance/Student Profile 2.0 (đều cần biết đang xem học sinh nào / tháng nào).
// Nguyên bản: khai báo tại index.html ngay trước khối Weekly Availability.
// ----------------------------------------------------------------------
window.activeProfileClassId = null;  // = "học sinh đang chọn" (Student Profile đang mở)
window.currentSelectedMonth = "";    // Định dạng "YYYY-MM" — script chính gán lại giá trị THÁNG HIỆN TẠI ngay sau khi state.js chạy xong (giữ nguyên vị trí/hành vi gán gốc, chỉ chuyển khai báo)

// STEP 11E — GROUP CLASS: state tối thiểu cần cho Group Class List + Detail shell (chỉ Tổng
// quan). KHÔNG thêm groupClassEnrollmentsCacheByClass/groupSessionsCacheByClass/
// attendanceCacheBySession ở đây — những cache đó thuộc STEP sau (Enrollment/Session/
// Attendance UI), STEP 11E chưa cần vì tab Học viên/Buổi học/Điểm danh chỉ là placeholder.
window.activeGroupClassId = null;    // = "lớp nhóm đang chọn" (Group Class Detail đang mở)
window.gcCurrentTab = 'overview';    // tab đang chọn trong Group Class Detail (mặc định 'overview')
window.groupClassList = [];          // cache danh sách group_classes của tutor hiện tại (Supabase là SOURCE OF TRUTH, cache chỉ để render UI nhanh — cùng convention classList)

// ----------------------------------------------------------------------
// C. SHARED CACHE — dùng chung giữa Students/Lessons/Calendar/Finance/Admin/
// Reports/Student Profile 2.0. Supabase luôn là SOURCE OF TRUTH, các cache
// này chỉ để render UI nhanh — KHÔNG đổi cấu trúc/business logic (STEP 8B mục 4).
// ----------------------------------------------------------------------
window.classList = JSON.parse(localStorage.getItem('v13_class_list')) || [];
// ===== CACHE LESSONS (public.lessons) THEO student_id =====
// Nguồn dữ liệu CHÍNH của lessons là Supabase. Object này chỉ là cache trong bộ nhớ
// để render UI nhanh, luôn được nạp lại từ Supabase qua loadStudentLessons().
window.lessonsCacheByStudent = {};
window.paymentsCacheByStudent = {}; // Cache trong bộ nhớ của public.payments theo student_id — Supabase là SOURCE OF TRUTH, cache chỉ để render UI nhanh.

// ----------------------------------------------------------------------
// D. ACCESS API (OPTIONAL, TƯỜNG MINH) — getState/setState/updateState
// ----------------------------------------------------------------------
// Đây KHÔNG phải bản sao (duplicate) của state — chỉ là hàm đọc/ghi thẳng lên
// cùng một window[key] ở trên. Code cũ (biến trần currentUser, classList, ...)
// tiếp tục hoạt động y hệt trước đây, KHÔNG bắt buộc phải đổi sang gọi qua API
// này (đúng mục 6: "KHÔNG tạo abstraction phức tạp nếu code hiện tại không
// cần"). API này chỉ để feature module MỚI (nếu có ở các step sau) có thể đọc/
// ghi shared state một cách tường minh, không cần biết tên biến global.
window.getState = function(key) {
    return window[key];
};
window.setState = function(key, value) {
    window[key] = value;
    return value;
};
window.updateState = function(key, updaterFn) {
    window[key] = updaterFn(window[key]);
    return window[key];
};

// ----------------------------------------------------------------------
// E. LESSONS-DATA-CHANGED HOOK (STEP 8C) — phá circular dependency Calendar ↔ Lessons
// ----------------------------------------------------------------------
// TRƯỚC STEP 8C: js/lessons/lessons.js gọi THẲNG window.renderAttendanceGrid(student)
// (hàm thuộc js/calendar/calendar.js) ngay sau khi mutate lessons (đổi status/xoá buổi),
// tạo vòng gọi thực sự:
//   Calendar (click ô điểm danh) → Lessons.setLessonStatusForDate()/removeLessonForDate()
//   → Lessons gọi lại Calendar.renderAttendanceGrid() để refresh lưới điểm danh.
// STEP 8C thay cạnh "Lessons → Calendar" bằng cơ chế NOTIFY một chiều qua tầng core:
// Lessons chỉ gọi notifyLessonsDataChanged(student) — KHÔNG còn biết đến sự tồn tại của
// renderAttendanceGrid/Calendar. Calendar tự đăng ký lắng nghe bằng onLessonsDataChanged(fn)
// ở cuối js/calendar/calendar.js. state.js (core) KHÔNG import/biết gì về Lessons hay
// Calendar — chỉ giữ một danh sách listener chung, đúng hướng dependency "core ở tầng
// thấp nhất, feature module phụ thuộc core, core không phụ thuộc feature module".
// Cạnh còn lại "Calendar → Lessons" (Calendar gọi loadStudentLessons/findLessonForDate/
// setLessonStatusForDate/removeLessonForDate/openLessonDetailModal để
// đọc/mutate dữ liệu buổi học) CHỦ Ý giữ nguyên — đây là phụ thuộc MỘT CHIỀU bình thường
// (Calendar dùng lại business logic của Lessons), không phải vòng lặp, và không thể loại
// bỏ mà không redesign data ownership (ngoài phạm vi STEP 8C — xem mục F báo cáo).
var _lessonsDataChangedListeners = [];
window.onLessonsDataChanged = function(fn) {
    if (typeof fn === 'function') _lessonsDataChangedListeners.push(fn);
};
window.notifyLessonsDataChanged = function(student) {
    _lessonsDataChangedListeners.forEach(function(fn) {
        try { fn(student); } catch (e) { console.error('[notifyLessonsDataChanged] listener error:', e); }
    });
};
