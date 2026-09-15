var LD_JOURNAL_MARKERS = {
    content: '[NỘI DUNG]',
    feedback: '[NHẬN XÉT]',
    homework: '[BÀI TẬP VỀ NHÀ]'
};

function parseLessonJournal(notes) {
    var text = notes || '';

    var hasMarker =
        text.indexOf(LD_JOURNAL_MARKERS.content) !== -1 ||
        text.indexOf(LD_JOURNAL_MARKERS.feedback) !== -1 ||
        text.indexOf(LD_JOURNAL_MARKERS.homework) !== -1;

    if (!hasMarker) {
        return {
            content: text.trim(),
            feedback: '',
            homework: ''
        };
    }

    function extract(marker) {
        var idx = text.indexOf(marker);
        if (idx === -1) return '';

        var start = idx + marker.length;
        var rest = text.slice(start);

        var nextIdx = -1;

        [
            LD_JOURNAL_MARKERS.content,
            LD_JOURNAL_MARKERS.feedback,
            LD_JOURNAL_MARKERS.homework
        ].forEach(function(m) {
            if (m === marker) return;

            var i = rest.indexOf(m);
            if (i !== -1 && (nextIdx === -1 || i < nextIdx)) {
                nextIdx = i;
            }
        });

        var section = nextIdx === -1
            ? rest
            : rest.slice(0, nextIdx);

        return section.trim();
    }

    return {
        content: extract(LD_JOURNAL_MARKERS.content),
        feedback: extract(LD_JOURNAL_MARKERS.feedback),
        homework: extract(LD_JOURNAL_MARKERS.homework)
    };
}
window.parseLessonJournal = parseLessonJournal;

// ============================================================================
// js/lessons/lessons.js  —  STEP 7D: LESSONS MODULE
// ============================================================================
// Tách nguyên vẹn phần logic THUẦN LESSONS (public.lessons — BUỔI HỌC THỰC TẾ):
// CRUD (load/create/update/delete/find), flow đổi trạng thái DUY NHẤT
// (setLessonStatusForDate/removeLessonForDate), và Lesson Detail Modal (mở/đóng/render).
// Tính năng "Nhật ký buổi học" (Lesson Journal) từng có ở đây đã bị GỠ BỎ hoàn toàn —
// xem khối comment ngay trước openLessonDetailModal() bên dưới.
//
// KHÔNG đổi behavior. KHÔNG đổi database/Supabase call. KHÔNG đổi CSS/UI.
//
// AUDIT — những gì CHỦ Ý KHÔNG di chuyển sang đây (giữ nguyên trong index.html)
// vì là shared/cross-feature, đang được module khác dùng chung:
//   - lessonsCacheByStudent / paymentsCacheByStudent / lessonStatusMeta /
//     lessonStatusIcon: state dùng chung giữa Calendar (renderAttendanceGrid),
//     Today's Work, Student Profile 2.0 và Lessons.
//   - describeSupabaseError: helper lỗi Supabase dùng chung toàn app (Students,
//     Calendar, Finance, Payments, Admin...), không phải riêng Lessons.
//   - loadTutorClassList / fetchLessonsMapForStudents: thuộc luồng tải dữ liệu
//     Students + Finance Dashboard (tải NHIỀU học sinh cùng lúc).
//   - rebuildAttendanceBridgeFromLessons / refreshMonthMoneyDisplay /
//     renderAlltimeTeachingStats: tính toán hiển thị học phí/thống kê trên
//     Student Profile, được gọi trực tiếp từ lưới điểm danh của Calendar và từ
//     luồng sửa thông tin học sinh — không phải logic CRUD/detail của Lessons.
//   - getBillingLessonsInMonth / getSessionsInMonth: thuộc Finance Core V1.
//   - getLessonItemsForDate / renderNextLessonCard / computeNextLesson: thuộc
//     Today's Work / "Buổi tiếp theo" (dùng chung với trang Lịch dạy).
//   - renderAttendanceGrid / loadMonthAttendanceAndFee / closeAllLessonStatusMenus:
//     thuộc lưới điểm danh của trang Lịch dạy (Calendar) — TUYỆT ĐỐI KHÔNG đụng
//     tới Calendar theo yêu cầu STEP 7D.
//   - addLessonItem / toggleLessonDone / deleteLessonItem: đây là checklist
//     "student.lessons" CŨ (khác hoàn toàn public.lessons/buổi học), gắn chặt
//     với renderProfileDetails và phần quản lý file trong hồ sơ học sinh — CHỦ Ý
//     không coi là "Lessons" của STEP 7D để tránh nhầm lẫn hai khái niệm trùng tên.
//   - Toàn bộ "STUDENT PROFILE 2.0" (renderStudentHero/KPIs/tabs...) và Reports/
//     Analytics: các module này ĐỌC dữ liệu lessons để hiển thị nhưng là logic sở
//     hữu bởi Student Profile / Reports, không phải Lessons.
//
// Đây là ES module thật (export/import), giống pattern của js/core/*.js (STEP 7B)
// và js/students/students.js (STEP 7C): file này tự expose các hàm cần thiết qua
// window ở cuối file để (a) các onclick="..." trong HTML tiếp tục gọi được, và
// (b) script chính (classic script) tiếp tục gọi các hàm này như global bình
// thường, đúng như trước khi tách.
//
// DEPENDENCY: module này ĐỌC các global do script chính định nghĩa (supabaseClient,
// classList, lessonsCacheByStudent, lessonStatusMeta, describeSupabaseError,
// findScheduleRowForDay, refreshAdminDashboardStats,
// refreshFinanceDashboardIfOpen, refreshReportsPageIfOpen, renderTodaysWork,
// refreshStudentProfileExtras, rebuildAttendanceBridgeFromLessons,
// refreshMonthMoneyDisplay, showToast, getActiveProfileStudent), và gọi
// notifyLessonsDataChanged(student) (js/core/state.js, STEP 8C) để báo cho Calendar biết
// dữ liệu lessons vừa đổi — module này KHÔNG còn gọi thẳng renderAttendanceGrid() (hàm
// thuộc js/calendar/calendar.js) nữa, xem STEP 8C mục "phá circular dependency Calendar ↔
// Lessons" trong js/core/state.js. Module này
// KHÔNG import những thứ đó (core KHÔNG được phụ thuộc Lessons, và các hàm này
// không phải core) — vì module chạy SAU khi script chính (classic <script>) đã
// chạy xong, nên tại thời điểm các hàm bên dưới THỰC SỰ được gọi (do người dùng
// bấm nút, không phải lúc module vừa load), toàn bộ các global trên chắc chắn
// đã tồn tại trên window. Không tạo Supabase client thứ hai — dùng lại
// window.supabaseClient đã có từ js/core/supabase.js (STEP 7B).
// ============================================================================

// ----------------------------------------------------------------------
// SOURCE OF TRUTH state của riêng Lesson Detail Modal (chỉ dùng trong module
// này, không có bản sao nào khác trong toàn bộ project trước khi tách).
// ----------------------------------------------------------------------
// Buổi học đang mở trong lesson-detail modal (nếu có) — chỉ lưu tọa độ (student/
// ngày), KHÔNG lưu lesson object trực tiếp, để mọi lần render lại modal đều đọc
// lại từ lessonsCacheByStudent (tránh lệch với Supabase).
var currentLessonDetail = { studentId: null, isoDate: null, dayName: null };

// ================================================================
// ===== MODULE public.lessons (BUỔI HỌC / ĐIỂM DANH THỰC TẾ) =====
// ================================================================
// Nguồn dữ liệu CHÍNH: bảng public.lessons trên Supabase.
// student_schedules = lịch học ĐỊNH KỲ (cố định theo ngày trong tuần) — KHÔNG đổi ở đây.
// lessons           = từng BUỔI HỌC THỰC TẾ (ngày cụ thể, có status/notes riêng).
// Dùng chung cho CẢ Tutor và Admin (Admin quản lý hộ Tutor qua RLS hiện tại, không cần
// function riêng "adminLessons"). Mọi operation đều kiểm tra error, KHÔNG cập nhật UI giả
// khi có lỗi, và KHÔNG nuốt lỗi bằng catch rỗng.

// Nạp toàn bộ buổi học của MỘT học sinh từ Supabase, sắp xếp theo ngày.
// Đây là hàm DUY NHẤT đọc bảng lessons theo student_id — dùng chung cho Tutor và Admin.
async function loadStudentLessons(studentId) {
    if (!studentId) return { data: [], error: null };
    try {
        const { data, error } = await supabaseClient
            .from('lessons')
            .select('*')
            .eq('student_id', studentId)
            .order('scheduled_date', { ascending: true });
        console.log('[LOAD SUPABASE] loadStudentLessons(' + studentId + '):', data, error);
        if (error) {
            console.error('loadStudentLessons lỗi:', error);
            return { data: null, error: error };
        }
        lessonsCacheByStudent[studentId] = data || [];
        return { data: data || [], error: null };
    } catch (err) {
        console.error('loadStudentLessons exception:', err);
        return { data: null, error: err };
    }
}

// ----------------------------------------------------------------------
// STEP 7 — HELPER DÙNG CHUNG: xác định teaching_mode cho MỘT buổi học 1-to-1 SẮP ĐƯỢC TẠO, dựa
// trên students.online_rate/offline_rate của học sinh (KHÔNG liên quan Group Class). Dùng chung
// bởi 3 entry point (renderAttendanceGrid() - calendar.js, buildTodaysWorkCard() - app.js,
// renderLessonDetailModal() - lessons.js) để tránh copy-paste logic 4 case A/B/C/D ra 3 nơi.
//
// CHỈ gọi hàm này khi SẮP TẠO lesson mới (lesson chưa tồn tại cho ngày đó) — mục 7 đề bài: "Không
// được hỏi lại khi thao tác trên lesson đã tồn tại" — caller PHẢI tự kiểm tra existingLesson/
// item.lesson/lesson trước khi gọi (xem 3 entry point).
//
// Return:
//   'online'  — Case A (chỉ có online_rate) hoặc Case C, tutor chọn Online.
//   'offline' — Case B (chỉ có offline_rate) hoặc Case D (legacy, cả 2 null) hoặc Case C, tutor
//               chọn Offline.
//   null      — CHỈ xảy ra ở Case C khi tutor cancel/không chọn hợp lệ -> caller PHẢI hiểu là
//               "KHÔNG tạo lesson", không được tự suy luận mode khác.
//
// Case C dùng prompt() (native, không tạo modal/component mới, không đổi visual system — đúng
// mục 5 đề bài "KHÔNG redesign UI"/"KHÔNG tạo framework/component mới") vì confirm() chỉ có 2 lựa
// chọn Yes/No, không đủ diễn đạt rõ ràng 2 hình thức dạy.
function resolveStudentTeachingMode(student) {
    var hasOnline = student.online_rate != null;
    var hasOffline = student.offline_rate != null;

    if (hasOnline && hasOffline) {
        // Case C — bắt buộc hỏi tutor, KHÔNG tự suy luận/mặc định.
        var raw = prompt('Học sinh "' + (student.name || '') + '" có cả Online và Offline.\nChọn hình thức dạy cho buổi học này:\n1 = Online\n2 = Offline\n\n(Để trống hoặc bấm Cancel để không tạo buổi học này)');
        if (raw === null) return null; // tutor cancel
        raw = raw.trim();
        if (raw === '1') return 'online';
        if (raw === '2') return 'offline';
        return null; // input không hợp lệ -> KHÔNG đoán mò, coi như huỷ
    }
    if (hasOnline) return 'online';    // Case A — chỉ Online, không hỏi
    if (hasOffline) return 'offline';  // Case B — chỉ Offline, không hỏi
    return 'offline';                  // Case D — legacy (cả 2 null), giữ backward-compatible offline
}

// Tạo một buổi học mới trong public.lessons. Mặc định status = 'scheduled' nếu không truyền.
//
// STEP 4 — FIX LESSON INSERT AFTER PRICING MIGRATION:
// public.lessons.rate giờ là NOT NULL (CHECK > 0), public.lessons.teaching_mode là NOT NULL
// (default 'offline'). Trước STEP 4, hàm này không gửi 2 field này khi INSERT, khiến MỌI lesson
// mới bị Supabase từ chối vì vi phạm NOT NULL trên `rate`. Đây là FIX TẠM THỜI để khôi phục khả
// năng tạo lesson — CHƯA triển khai online_rate/offline_rate/lựa chọn Online-Offline (xem STEP 3B
// report, mục V/XI). rate được suy ra từ students.rate (legacy, đơn vị "nghìn đồng") của ĐÚNG học
// sinh đang tạo lesson, quy đổi sang VNĐ đầy đủ (×1000, cùng convention với mọi nơi khác trong app
// — xem js/core/billing.js). teaching_mode LUÔN gán tường minh 'offline' ở bước này (KHÔNG để
// database tự áp default ngầm — dù giá trị giống nhau, gán tường minh để về sau dễ audit/thay đổi).
// Học sinh được tra từ `classList` (global đã có sẵn trong danh sách dependency của module này ở
// đầu file) theo payload.student_id — KHÔNG đổi signature/caller của createLesson().
// STEP 7 — 1-TO-1 ONLINE/OFFLINE TEACHING MODE:
// payload.teaching_mode là input TÙY CHỌN, ĐÃ ĐƯỢC VALIDATE/CHỌN từ nơi gọi (xem
// resolveStudentTeachingMode() + 3 entry point: renderAttendanceGrid() (calendar.js),
// buildTodaysWorkCard() (app.js), renderLessonDetailModal() (lessons.js)). createLesson() KHÔNG
// tin mù quáng vào một "rate" tùy ý từ caller — rate LUÔN được chính hàm này tự tra lại từ
// studentForRate (classList) theo ĐÚNG teaching_mode, tránh mismatch giữa mode và rate.
// Nếu payload.teaching_mode === undefined (caller CŨ, chưa update): fallback y hệt hành vi
// STEP 4 trước đây — teaching_mode='offline', rate lấy từ students.rate (legacy) — KHÔNG đổi gì
// cho các caller chưa được cập nhật.
async function createLesson(payload) {
    try {
        var studentForRate = classList.find(function(c) { return c.id === payload.student_id; });

        var teachingMode = payload.teaching_mode;
        var sourceRate;
        if (teachingMode === undefined) {
            teachingMode = 'offline';
            sourceRate = studentForRate ? studentForRate.rate : undefined;
        } else if (teachingMode === 'online') {
            sourceRate = studentForRate ? studentForRate.online_rate : undefined;
        } else if (teachingMode === 'offline') {
            // Case D (legacy — online_rate/offline_rate cả 2 đều null): resolveStudentTeachingMode()
            // trả về 'offline' tường minh cho case này (mục D đề bài), nhưng offline_rate thực tế là
            // null -> PHẢI fallback về students.rate (giữ đúng "teaching_mode='offline', rate =
            // student.rate*1000" của Case D), KHÔNG được coi là lỗi thiếu rate.
            sourceRate = studentForRate
                ? (studentForRate.offline_rate != null ? studentForRate.offline_rate : studentForRate.rate)
                : undefined;
        } else {
            var badModeError = { message: 'Không thể tạo buổi học: teaching_mode không hợp lệ ("' + teachingMode + '"), chỉ chấp nhận "online" hoặc "offline".' };
            console.error('createLesson lỗi: teaching_mode không hợp lệ.', { student_id: payload.student_id, teaching_mode: teachingMode });
            return { data: null, error: badModeError };
        }

        var rateVnd = Number(sourceRate) * 1000;
        if (!studentForRate || isNaN(rateVnd) || rateVnd <= 0) {
            var rateError = { message: 'Không thể tạo buổi học: không tìm thấy học phí (' + teachingMode + ') hợp lệ của học sinh này.' };
            console.error('createLesson lỗi: rate không hợp lệ, không INSERT.', { student_id: payload.student_id, teaching_mode: teachingMode, student: studentForRate });
            return { data: null, error: rateError };
        }
        var row = {
            student_id: payload.student_id,
            scheduled_date: payload.scheduled_date,
            start_time: payload.start_time || null,
            duration: payload.duration != null ? payload.duration : null,
            status: payload.status || 'scheduled',
            notes: payload.notes || '',
            rate: rateVnd,
            teaching_mode: teachingMode
        };
        const { data, error } = await supabaseClient
            .from('lessons')
            .insert(row)
            .select()
            .maybeSingle();
        console.log('[INSERT] lessons row:', row, '-> data:', data, 'error:', error);
        if (error) {
            console.error('createLesson lỗi:', error);
            return { data: null, error: error };
        }
        if (data) {
            if (!lessonsCacheByStudent[payload.student_id]) lessonsCacheByStudent[payload.student_id] = [];
            lessonsCacheByStudent[payload.student_id].push(data);
        }
        return { data: data, error: null };
    } catch (err) {
        console.error('createLesson exception:', err);
        return { data: null, error: err };
    }
}

// Sửa một buổi học đã có, luôn UPDATE theo id (KHÔNG bao giờ theo student_id).
// Dùng maybeSingle() thay vì single(): nếu UPDATE đã thành công (không có error) nhưng vì lý do
// nào đó .select() không trả về đúng 1 dòng (ví dụ RLS trên SELECT khác với UPDATE), single() sẽ
// NÉM LỖI dù dữ liệu trên Supabase đã đổi đúng — khiến code hiểu nhầm là thất bại rồi render lại
// trạng thái CŨ (đây chính là kiểu lỗi khiến "Đã học" bị hiển thị lại thành "Chưa học"). Với
// maybeSingle(), ta phân biệt rõ: có error thật (update thất bại) vs. update thành công nhưng
// không lấy lại được row (data = null, error = null) — caller sẽ RELOAD lại từ Supabase để lấy
// đúng trạng thái thật, thay vì tự suy luận.
async function updateLesson(lessonId, fields, studentId) {
    try {
        const { data, error } = await supabaseClient
            .from('lessons')
            .update(fields)
            .eq('id', lessonId)
            .select()
            .maybeSingle();
        console.log('[UPDATE] lessons.id=' + lessonId, 'fields:', fields, '-> data:', data, 'error:', error);
        if (error) {
            console.error('updateLesson lỗi:', error);
            return { data: null, error: error };
        }
        if (data && studentId && lessonsCacheByStudent[studentId]) {
            var idx = lessonsCacheByStudent[studentId].findIndex(function(l) { return l.id === lessonId; });
            if (idx > -1) lessonsCacheByStudent[studentId][idx] = data;
        }
        return { data: data, error: null };
    } catch (err) {
        console.error('updateLesson exception:', err);
        return { data: null, error: err };
    }
}

// LƯU Ý: trước đây có thêm một hàm tiện ích updateLessonStatus(lessonId, status, studentId) gọi lại
// updateLesson() — đã GỠ BỎ vì không được gọi ở bất kỳ đâu (dead code) và có thể gây nhầm lẫn rằng
// có "hai đường" để đổi status. Từ nay CHỈ có updateLesson() ghi UPDATE vào public.lessons, và CHỈ
// setLessonStatusForDate() (bên dưới) được phép gọi nó để đổi status buổi học.

// Xóa một buổi học — LUÔN confirm trước khi xóa thật trên Supabase.
async function deleteLesson(lessonId, studentId) {
    if (!confirm('Bạn có chắc muốn xóa buổi học này? Hành động này không thể hoàn tác.')) {
        return { data: null, error: null, cancelled: true };
    }
    try {
        const { error } = await supabaseClient
            .from('lessons')
            .delete()
            .eq('id', lessonId);
        console.log('[DELETE] lessons.id=' + lessonId, '-> error:', error);
        if (error) {
            console.error('deleteLesson lỗi:', error);
            return { data: null, error: error };
        }
        if (studentId && lessonsCacheByStudent[studentId]) {
            lessonsCacheByStudent[studentId] = lessonsCacheByStudent[studentId].filter(function(l) { return l.id !== lessonId; });
        }
        return { data: true, error: null };
    } catch (err) {
        console.error('deleteLesson exception:', err);
        return { data: null, error: err };
    }
}

// Tìm buổi học (nếu đã tồn tại trên Supabase) khớp với một ngày cụ thể (yyyy-mm-dd) trong cache.
function findLessonForDate(studentId, isoDate) {
    var cache = lessonsCacheByStudent[studentId] || [];
    for (var i = 0; i < cache.length; i++) {
        if (cache[i].scheduled_date === isoDate) return cache[i];
    }
    return null;
}

// ================================================================================
// DUY NHẤT MỘT FLOW ĐƯỢC PHÉP ĐỔI STATUS BUỔI HỌC — mọi nút/menu trạng thái trong UI
// (Tutor lẫn Admin xem hộ) đều phải gọi qua hàm này, KHÔNG có hàm nào khác được tự ý
// đổi status ở nơi khác.
//
// FLOW:
//   click -> xác định lesson (theo id nếu đã có, hoặc theo student_id+scheduled_date nếu chưa có)
//   -> UPDATE/INSERT public.lessons kèm status cụ thể (KHÔNG toggle mù — status luôn được
//      truyền tường minh từ nơi gọi, xem mục "menu trạng thái" trong renderAttendanceGrid)
//   -> kiểm tra error: nếu lỗi, KHÔNG đổi gì trên UI, chỉ báo lỗi và render lại đúng dữ liệu cũ
//   -> nếu thành công: RELOAD LẠI TOÀN BỘ lessons của học sinh này từ Supabase (loadStudentLessons)
//      để cache luôn đúng 100% với Supabase — không tự suy luận/giữ lại status cũ trong bộ nhớ.
//   -> render lại UI HOÀN TOÀN từ cache vừa reload (lesson.status là nguồn duy nhất, không có
//      bất kỳ fallback nào từ student.attendance/sessions/localStorage).
// ================================================================================
// STEP 7: tham số MỚI, TÙY CHỌN `teachingMode` thêm vào CUỐI danh sách tham số — 3 caller hiện
// tại (calendar.js renderAttendanceGrid(), app.js buildTodaysWorkCard(), lessons.js
// renderLessonDetailModal()) đã được cập nhật để truyền tham số này khi TẠO lesson mới (xem
// resolveStudentTeachingMode()); nếu có caller nào khác chưa truyền, teachingMode sẽ là
// `undefined` và createLesson() tự fallback legacy offline như hành vi TRƯỚC STEP 7 — không phá
// backward compatibility. Nhánh existingLesson (lesson ĐÃ tồn tại) hoàn toàn KHÔNG dùng
// teachingMode — sửa status của lesson cũ KHÔNG được đổi teaching_mode/rate đã snapshot trước đó.
async function setLessonStatusForDate(student, isoDate, dayName, newStatus, existingLesson, teachingMode) {
    var opResult;
    if (existingLesson) {
        // Buổi học đã tồn tại -> LUÔN update theo lesson.id (không bao giờ theo ngày/index).
        opResult = await updateLesson(existingLesson.id, { status: newStatus }, student.id);
    } else {
        // Chưa có lesson cho ngày này -> tra lịch cố định (student_schedules) để lấy start_time/
        // duration hợp lệ (NOT NULL trong schema) trước khi INSERT với đúng status người dùng chọn.
        var schedResult = await findScheduleRowForDay(student.id, dayName);
        if (schedResult.error) {
            alert('⚠️ Không thể tra lịch học.\n' + describeSupabaseError(schedResult.error));
            notifyLessonsDataChanged(student); // STEP 8C: notify qua core, Calendar tự đăng ký refresh (không gọi thẳng renderAttendanceGrid)
            return;
        }
        if (!schedResult.data) {
            alert('Không tìm thấy lịch học cho ngày này.');
            notifyLessonsDataChanged(student); // STEP 8C: notify qua core, Calendar tự đăng ký refresh (không gọi thẳng renderAttendanceGrid)
            return;
        }
        opResult = await createLesson({
            student_id: student.id,
            scheduled_date: isoDate,
            start_time: schedResult.data.start_time,
            duration: schedResult.data.duration,
            status: newStatus,
            notes: '',
            teaching_mode: teachingMode // STEP 7: optional, forward xuống createLesson() — undefined => fallback legacy offline
        });
    }

    if (opResult.error) {
        // KHÔNG cập nhật UI giả khi Supabase báo lỗi — render lại đúng dữ liệu hiện có trong cache.
        alert('⚠️ Không thể cập nhật buổi học.\n' + describeSupabaseError(opResult.error));
        notifyLessonsDataChanged(student); // STEP 8C: notify qua core, Calendar tự đăng ký refresh (không gọi thẳng renderAttendanceGrid)
        return;
    }

    // Thành công (dù .select() có trả về đúng 1 row hay không) -> RELOAD lại từ Supabase để đảm bảo
    // 100% khớp DB thật, rồi mới render — đây là bước bắt buộc để tránh mọi trường hợp UI hiển thị
    // sai lệch so với public.lessons (mục "Supabase = SOURCE OF TRUTH duy nhất").
    var reload = await loadStudentLessons(student.id);
    if (reload.error) {
        alert('⚠️ Đã lưu buổi học nhưng không tải lại được dữ liệu mới nhất.\n' + describeSupabaseError(reload.error) + '\nVui lòng tải lại trang để xem đúng trạng thái.');
        notifyLessonsDataChanged(student); // STEP 8C: notify qua core, Calendar tự đăng ký refresh (không gọi thẳng renderAttendanceGrid)
        return;
    }

    rebuildAttendanceBridgeFromLessons(student);
    refreshMonthMoneyDisplay(student);
    notifyLessonsDataChanged(student); // STEP 8C: notify qua core, Calendar tự đăng ký refresh (không gọi thẳng renderAttendanceGrid)
    refreshAdminDashboardStats(); // Mục 11: cập nhật lại tổng tiền nếu Admin Dashboard đang mở
    refreshFinanceDashboardIfOpen(student); // cập nhật Finance Dashboard ngay nếu đang mở
    refreshReportsPageIfOpen(student); // cập nhật Reports ngay nếu đang mở
    renderTodaysWork(); // mục 14: đổi status xong phải refresh Today's Work ngay, không cần F5
    refreshStudentProfileExtras(student); // Student Profile 2.0
}

// Xóa buổi học cho một ngày cụ thể trong lưới điểm danh (Supabase-backed student).
async function removeLessonForDate(student, lessonId) {
    var result = await deleteLesson(lessonId, student.id);
    if (result.cancelled) return;
    if (result.error) {
        alert('⚠️ Không thể xóa buổi học.\n' + describeSupabaseError(result.error));
        return;
    }
    var reload = await loadStudentLessons(student.id); // đồng bộ lại từ Supabase cho chắc chắn
    if (reload.error) {
        alert('⚠️ Đã xóa nhưng không tải lại được dữ liệu mới nhất.\n' + describeSupabaseError(reload.error));
    }
    rebuildAttendanceBridgeFromLessons(student);
    refreshMonthMoneyDisplay(student);
    notifyLessonsDataChanged(student); // STEP 8C: notify qua core, Calendar tự đăng ký refresh (không gọi thẳng renderAttendanceGrid)
    refreshAdminDashboardStats(); // Mục 11: cập nhật lại tổng tiền nếu Admin Dashboard đang mở
    refreshFinanceDashboardIfOpen(student); // cập nhật Finance Dashboard ngay nếu đang mở
    refreshReportsPageIfOpen(student); // cập nhật Reports ngay nếu đang mở
    renderTodaysWork(); // mục 14: xóa lesson xong phải refresh Today's Work ngay, không cần F5
    refreshStudentProfileExtras(student); // Student Profile 2.0
}


// ================================================================================
// Tính năng "Nhật ký buổi học" (Lesson Journal) ĐÃ BỊ GỠ BỎ HOÀN TOÀN khỏi UI/flow —
// lessons.notes vẫn là cột dữ liệu bình thường của public.lessons (KHÔNG xoá cột, KHÔNG
// xoá dữ liệu cũ trên Supabase), chỉ không còn được app parse/hiển thị có cấu trúc nữa.
// Session Report (public.session_reports, xem js/reports/session-reports.js) là hệ thống
// ghi nhận buổi học duy nhất hiện tại.
// ================================================================================

// Modal chi tiết MỘT buổi học, dùng CHUNG cho Tutor và Admin (Admin quản lý hộ Tutor chạy
// trên cùng main-page-view/profile-page-view nên tự động dùng lại modal này, KHÔNG có bản
// AdminLessonDetail riêng). Modal KHÔNG tự giữ trạng thái buổi học — mỗi lần mở/refresh đều
// đọc lại từ lessonsCacheByStudent (đã đồng bộ với public.lessons qua loadStudentLessons).
// Đổi trạng thái trong modal TÁI SỬ DỤNG setLessonStatusForDate() — không có đường đổi status
// nào khác.
// ================================================================================
// ===== MODULE QUẢN LÝ BUỔI HỌC — LESSON DETAIL MODAL =====

function openLessonDetailModal(student, isoDate, dayName) {
    currentLessonDetail = { studentId: student.id, isoDate: isoDate, dayName: dayName };
    renderLessonDetailModal();
    document.getElementById('lesson-detail-modal').classList.add('open');
}

function closeLessonDetailModal() {
    document.getElementById('lesson-detail-modal').classList.remove('open');
    currentLessonDetail = { studentId: null, isoDate: null, dayName: null };
}

// Vẽ lại TOÀN BỘ nội dung modal từ cache hiện tại — gọi lại hàm này sau mỗi lần đổi status/
// lưu notes thành công để modal luôn khớp với dữ liệu vừa reload từ Supabase.
function renderLessonDetailModal() {
    var student = classList.find(function(c) { return c.id === currentLessonDetail.studentId; });
    if (!student) return;
    var lesson = findLessonForDate(student.id, currentLessonDetail.isoDate);
    var status = lesson ? lesson.status : 'scheduled';

    var dateParts = currentLessonDetail.isoDate.split('-');
    var displayDate = (currentLessonDetail.dayName ? currentLessonDetail.dayName + ' - ' : '') + dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
    document.getElementById('ld-date').innerText = displayDate;
    document.getElementById('ld-time').innerText = (lesson && lesson.start_time) ? lesson.start_time : '—';
    document.getElementById('ld-duration').innerText = (lesson && lesson.duration != null) ? lesson.duration + ' giờ' : '—';
    document.getElementById('ld-student').innerText = student.name || '—';
    document.getElementById('ld-subject').innerText = student.subject || '—';

    // STEP 9F: nếu lesson đã tồn tại (real lesson, .rate là snapshot VNĐ đầy đủ tại thời điểm tạo,
    // đã tự chọn đúng online_rate/offline_rate — xem createLesson()) thì PHẢI hiển thị đúng
    // lesson.rate, KHÔNG dùng lại student.rate hiện tại (đặc biệt quan trọng vì #ld-money chỉ hiện
    // khi status === 'completed', tức LUÔN có lesson thật — xem dòng "status" ở trên). Nếu lesson
    // CHƯA tồn tại (chỉ là dự kiến từ lịch cố định, chưa từng tạo), chưa có snapshot nào để đọc ->
    // giữ nguyên ước tính bằng student.rate hiện tại như trước.
    var rateVnd = lesson ? (Number(lesson.rate) || 0) : (Number(student.rate) || 0) * 1000;
    document.getElementById('ld-fee').innerText = rateVnd > 0 ? rateVnd.toLocaleString('vi-VN') + 'đ' : '—';

    var moneyRow = document.getElementById('ld-money-row');
    if (status === 'completed') {
        moneyRow.style.display = 'block';
        document.getElementById('ld-money').innerText = rateVnd > 0 ? rateVnd.toLocaleString('vi-VN') + 'đ' : '⚠️ Thiếu học phí (rate = 0)';
    } else {
        moneyRow.style.display = 'none';
    }

    // Nút trạng thái — mục 4/5/6: luôn UPDATE Supabase qua setLessonStatusForDate, không toggle mù.
    var btnBox = document.getElementById('ld-status-buttons');
    btnBox.innerHTML = '';
    [
        { key: 'scheduled', icon: '🕒' },
        { key: 'completed', icon: '✓' },
        { key: 'cancelled', icon: '✕' }
    ].forEach(function(s) {
        var active = status === s.key;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.innerText = s.icon + ' ' + lessonStatusMeta[s.key].label;
        btn.style.cssText = 'padding:8px 14px; font-size:12.5px; font-weight:700; border-radius:8px; cursor:pointer; font-family:\'Inter\',sans-serif; border:1.5px solid ' + (active ? '#00cca3' : 'var(--border-color)') + '; background:' + (active ? 'rgba(0,204,163,0.12)' : 'var(--bg-card-sub)') + '; color:' + (active ? '#00cca3' : 'var(--text-main)') + ';';
        btn.disabled = active;
        btn.onclick = async function() {
            // STEP 7 — entry point C: nếu buổi học NÀY CHƯA tồn tại (lesson == null) thì hành động
            // này sắp TẠO lesson mới (qua setLessonStatusForDate() -> createLesson()) -> phải xác
            // định teaching_mode TRƯỚC. Lesson ĐÃ tồn tại thì KHÔNG hỏi mode (mục 7 đề bài — không
            // hỏi lại/không đổi rate của lesson cũ khi chỉ đổi status).
            var teachingMode;
            if (!lesson) {
                teachingMode = resolveStudentTeachingMode(student);
                if (teachingMode === null) return; // Case C, tutor cancel -> KHÔNG tạo lesson
            }
            btnBox.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
            await setLessonStatusForDate(student, currentLessonDetail.isoDate, currentLessonDetail.dayName, s.key, lesson, teachingMode);
            renderLessonDetailModal(); // đọc lại từ cache vừa reload trong setLessonStatusForDate
        };
        btnBox.appendChild(btn);
    });

}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (mục 7 — HTML COMPATIBILITY)
// Chỉ export những hàm được gọi trực tiếp từ onclick/onchange trong HTML hoặc
// từ script chính (classic script) như global — đúng pattern của
// js/students/students.js (STEP 7C).
// ============================================================================
export {
    loadStudentLessons, createLesson, updateLesson, deleteLesson, findLessonForDate,
    setLessonStatusForDate, removeLessonForDate, resolveStudentTeachingMode,
    openLessonDetailModal, closeLessonDetailModal, renderLessonDetailModal
};

window.loadStudentLessons = loadStudentLessons;
window.createLesson = createLesson;
window.updateLesson = updateLesson;
window.deleteLesson = deleteLesson;
window.findLessonForDate = findLessonForDate;
window.setLessonStatusForDate = setLessonStatusForDate;
window.removeLessonForDate = removeLessonForDate;
window.resolveStudentTeachingMode = resolveStudentTeachingMode; // STEP 7: dùng chung ở calendar.js/app.js
window.openLessonDetailModal = openLessonDetailModal;
window.closeLessonDetailModal = closeLessonDetailModal;
window.renderLessonDetailModal = renderLessonDetailModal;
