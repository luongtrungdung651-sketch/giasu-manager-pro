// ============================================================================
// js/calendar/calendar.js  —  STEP 7E: CALENDAR MODULE
// ============================================================================
// Tách nguyên vẹn phần logic CALENDAR THUẦN của trang "Lịch dạy" (sidebar Tutor):
// Month View, Week View (timeline theo giờ), navigation (tháng/tuần/hôm nay),
// chọn ngày, hiển thị lesson trên calendar, mobile view (Tháng/Tuần/Danh sách),
// và lưới điểm danh (renderAttendanceGrid/loadMonthAttendanceAndFee/
// closeAllLessonStatusMenus) — 3 hàm này đã được STEP 7D (js/lessons/lessons.js)
// CHỦ Ý để lại cho Calendar, xem audit trong lessons.js dòng ~27.
//
// KHÔNG đổi behavior. KHÔNG đổi database/Supabase call. KHÔNG đổi CSS/UI.
// KHÔNG redesign Month View/Week View/Timeline/Weekly Availability đang hoạt động.
//
// AUDIT — những gì CHỦ Ý KHÔNG di chuyển sang đây (giữ nguyên trong index.html)
// vì là shared/cross-feature hoặc thuộc module khác:
//   - getLessonItemsForDate / buildTodaysWorkCard / DAY_NUMBER_TO_NAME / defaultTimes:
//     thuộc Today's Work — Calendar DÙNG CHUNG, không sở hữu.
//   - classList / activeProfileClassId / currentSelectedMonth / lessonsCacheByStudent /
//     lessonStatusMeta: state dùng chung toàn app (Students/Lessons/Finance/Calendar).
//   - describeSupabaseError / saveData / getDayOfWeekNumber / computeScheduleEndTime:
//     helper dùng chung, KHÔNG riêng của Calendar (getDayOfWeekNumber chỉ đang được
//     Calendar gọi nhưng vẫn để nguyên tại chỗ cũ — không bắt buộc phải di chuyển).
//   - loadStudentLessons / findLessonForDate / setLessonStatusForDate /
//     removeLessonForDate / openLessonDetailModal / parseLessonJournal: thuộc
//     js/lessons/lessons.js (STEP 7D) — Calendar chỉ GỌI, không sở hữu.
//   - rebuildAttendanceBridgeFromLessons / refreshMonthMoneyDisplay / loadStudentPayments /
//     refreshStudentProfileExtras: thuộc Student Profile / Finance — Calendar chỉ gọi để
//     đồng bộ số liệu sau khi nạp lại lưới điểm danh, KHÔNG sở hữu logic tính toán.
//   - toggleMonthFeePaidStatus / handleFeeStatusBtnClick / refreshFeeStatusUI /
//     renderPaymentHistory / Modal ghi nhận thanh toán: thuộc luồng THANH TOÁN (Finance/
//     Payments) — nằm ngay sau renderAttendanceGrid trong file gốc nhưng KHÔNG phải logic
//     Calendar, CHỦ Ý không di chuyển (đúng yêu cầu "không sửa Finance").
//   - acCollectBusyIntervalsForDay / checkScheduleConflict / acShowConflictWarning /
//     acCloseConflictModal / acProceedDespiteConflict (SMART CONFLICT DETECTION V1) và
//     toàn bộ Weekly Availability (renderTimeSlots/getOccupiedClass/toggleDay/freeSchedule...):
//     đây là conflict-check/availability cho việc TẠO/SỬA LỊCH CỐ ĐỊNH (student_schedules)
//     ở trang Học sinh (Students), KHÔNG phải logic hiển thị của trang "Lịch dạy" (Calendar
//     theo tháng/tuần). Được audit rõ và CHỦ Ý để lại index.html — không phải Calendar thuần.
//   - renderTwMiniCalendar / goToCalendarDate / goToCalendarDateAsWeek / buildTimelineList:
//     thuộc trang "Hôm nay" (Today's Work) — các hàm này GỌI VÀO Calendar (đặt lại
//     tpCalYear/tpCalMonth/tpCalSelectedIso rồi switchTutorPage('calendar')) nhưng bản
//     thân chúng sở hữu bởi Today's Work, không phải Calendar.
//
// Đây là ES module thật (export/import), giống pattern của js/core/*.js (STEP 7B),
// js/students/students.js (STEP 7C) và js/lessons/lessons.js (STEP 7D): module này tự
// expose các hàm cần thiết qua window ở cuối file để (a) các onclick="..." trong HTML
// tiếp tục gọi được, và (b) script chính (classic script) tiếp tục gọi các hàm này như
// global bình thường, đúng như trước khi tách.
//
// DEPENDENCY: module này ĐỌC các global do script chính định nghĩa (classList,
// activeProfileClassId, currentSelectedMonth, lessonsCacheByStudent, lessonStatusMeta,
// defaultTimes, DAY_NUMBER_TO_NAME, getLessonItemsForDate, buildTodaysWorkCard,
// describeSupabaseError, saveData, getDayOfWeekNumber, computeScheduleEndTime,
// rebuildAttendanceBridgeFromLessons, refreshMonthMoneyDisplay, loadStudentPayments,
// refreshFeeStatusUI, renderPaymentHistory, refreshStudentProfileExtras) và từ
// js/lessons/lessons.js (loadStudentLessons, findLessonForDate, setLessonStatusForDate,
// removeLessonForDate, openLessonDetailModal, parseLessonJournal) cùng js/core/utils.js
// (escapeHtml, getLocalIsoDate, timeToFloat — đã expose qua window ở STEP 7B). Module này
// KHÔNG import những thứ đó — module chạy SAU khi script chính VÀ các module trước
// (core/students/lessons) đã chạy xong, nên tại thời điểm các hàm bên dưới THỰC SỰ được
// gọi (do người dùng bấm nút, không phải lúc module vừa load), toàn bộ global trên chắc
// chắn đã tồn tại trên window.
//
// STEP 8C — CIRCULAR DEPENDENCY ĐÃ PHÁ: TRƯỚC STEP 8C, js/lessons/lessons.js gọi THẲNG
// renderAttendanceGrid() (hàm trong file này) sau khi mutate lessons, tạo vòng gọi thật
// Calendar → Lessons → Calendar. Từ STEP 8C, Lessons chỉ gọi notifyLessonsDataChanged()
// (js/core/state.js), và Calendar tự đăng ký lắng nghe ở cuối file này (xem
// "STEP 8C — ĐĂNG KÝ LẮNG NGHE" phía dưới) — Lessons không còn giữ tên hàm
// renderAttendanceGrid trong code nữa. Cạnh còn lại là dependency MỘT CHIỀU: Calendar
// gọi các hàm business logic của Lessons (loadStudentLessons/findLessonForDate/
// setLessonStatusForDate/removeLessonForDate/openLessonDetailModal/parseLessonJournal) để
// đọc/mutate dữ liệu — index.html/Students/Lessons/Finance/Reports KHÔNG import Calendar,
// chỉ gọi hàm Calendar qua window (giống onclick="..." gọi hàm global). Không còn circular
// dependency giữa Calendar và Lessons.
// ============================================================================

// ===== TRANG "LỊCH DẠY" (calendar theo tháng, sidebar Tutor) =====
// Dùng lại đúng getLessonItemsForDate() (mục "Hôm nay") để build cả chấm-đếm-buổi trên mỗi
// ô ngày lẫn danh sách buổi học khi click vào 1 ngày — KHÔNG gọi thêm Supabase (chỉ đọc
// cache đã có sẵn), KHÔNG tạo bảng/logic mới.
// ================================================================================
window.tpCalYear = new Date().getFullYear();
window.tpCalMonth = new Date().getMonth(); // 0-based
window.tpCalSelectedIso = null;
// Bộ lọc trạng thái cho danh sách buổi của NGÀY đang chọn trên trang "Lịch dạy" — chỉ là ống
// kính hiển thị (giống todayFilterStatus của trang "Hôm nay"), không đụng dữ liệu Supabase.
var tpCalDayFilterStatus = 'all';

// ============================================================================
// STEP 11G-B2-A-FIX — PART C: HIỂN THỊ group_sessions (Group Class ĐÃ MATERIALIZED) TRÊN
// CALENDAR "LỊCH DẠY" (Month View + Week View).
// ============================================================================
// KIẾN TRÚC BẮT BUỘC (đề bài PART C, "CRITICAL ARCHITECTURE RULE"): Calendar đọc
// public.group_sessions (buổi học ĐÃ ĐƯỢC TẠO THẬT) — TUYỆT ĐỐI KHÔNG đọc
// public.group_class_schedules (RULE lặp lại) để tự suy ra sự kiện. KHÔNG generate bất kỳ
// group_sessions nào ở đây (đó là việc của 12-week generator — CHƯA làm ở step này).
//
// CỐ Ý TÁCH RIÊNG khỏi getLessonItemsForDate()/buildTodaysWorkCard() (mục "Hôm nay", dùng
// chung bởi Today's Work + Calendar cũ) — KHÔNG sửa 2 hàm đó, KHÔNG nhét Group Class vào
// classList/lessons (mục C9 đề bài: "Do not insert Group Classes into classList", "Do NOT
// automatically add Group Class sessions to unrelated student-only features"). Toàn bộ state/
// hàm dưới đây chỉ được ĐỌC bởi renderTpCalendar()/renderTpCalDayList()/renderTpWeekView()
// trong CHÍNH module này — Today's Work (index.html) không biết và không cần biết chúng tồn tại.
//
// SECURITY (mục C1): KHÔNG trust tutor_id từ client. Query group_sessions được lọc bằng
// group_class_id IN (danh sách id) lấy từ groupClassList — CHÍNH LÀ danh sách đã được
// loadGroupClassesIfNeeded() (js/group-class/group-class.js) tải với .eq('tutor_id',
// activeTutorId) + RLS group_classes — tức là dùng LẠI đúng kiến trúc ownership hiện có của
// Group Class, không tạo cơ chế lọc quyền mới. Nếu activeTutorId rỗng hoặc groupClassList rỗng
// (Tutor này chưa có Group Class nào) -> trả về mảng rỗng, KHÔNG query gì thêm.
//
// CACHE (mục C2/C10): 1 object DUY NHẤT { key, sessions } — key = tutorId + khoảng ngày đang
// hiển thị (tháng hoặc tuần). Đổi tháng/tuần/tutor (Admin chuyển sang quản lý Tutor khác) làm
// key đổi -> tự động query lại đúng khoảng mới, KHÔNG giữ toàn bộ lịch sử group_sessions trong
// bộ nhớ (mục C2: "Do NOT load all historical group_sessions indefinitely"). Đây là cache
// NHỎ NHẤT đủ dùng — KHÔNG dựng thêm 1 tầng state-management nào khác (mục C10).
var tpCalGroupSessionCache = { key: null, sessions: [] };

function tpCalGroupSessionCacheKey(startIso, endIso) {
    return (activeTutorId || 'none') + '|' + startIso + '|' + endIso;
}

// Tải group_sessions cho đúng khoảng ngày đang hiển thị. KHÔNG await bên trong render đồng bộ
// (renderTpCalendar/renderTpWeekView vẫn là hàm sync, giữ nguyên signature/behavior cũ) — hàm
// này được gọi kiểu "fire and re-render" từ tpCalEnsure...Loaded() bên dưới.
async function tpCalLoadGroupSessionsForRange(startIso, endIso) {
    var key = tpCalGroupSessionCacheKey(startIso, endIso);

    // Mục C4: KHÔNG query lại metadata Group Class trùng lặp — tái dùng loadGroupClassesIfNeeded()
    // đã có (cache riêng theo activeTutorId, xem group-class.js) để lấy groupClassList vừa dùng
    // để lọc ownership vừa dùng để hiển thị tên/môn học (PART C4 "reuse groupClassList").
    if (typeof window.loadGroupClassesIfNeeded === 'function') {
        await window.loadGroupClassesIfNeeded();
    }

    if (!activeTutorId || !groupClassList || groupClassList.length === 0) {
        tpCalGroupSessionCache = { key: key, sessions: [] };
        return tpCalGroupSessionCache.sessions;
    }

    var classIds = groupClassList.map(function(gc) { return gc.id; });

    try {
        // group_class_id IN (<lớp thuộc activeTutorId>) — KHÔNG có tutor_id trên group_sessions,
        // ownership đến hoàn toàn từ tập classIds này (đã được scope đúng tutor ở bước trên) +
        // RLS server-side (group_sessions -> group_classes -> tutors), đúng 2 lớp bảo vệ.
        var result = await supabaseClient
            .from('group_sessions')
            .select('id, group_class_id, scheduled_date, start_time, duration, status, session_type, notes')
            .in('group_class_id', classIds)
            .gte('scheduled_date', startIso)
            .lte('scheduled_date', endIso);

        if (result.error) {
            console.error('[CALENDAR] Tải group_sessions FAILED:', result.error);
            // Fail-safe: không hiển thị group session nào thay vì crash — 1-1 lessons ở Calendar
            // vẫn phải tiếp tục hoạt động bình thường dù group_sessions lỗi tải.
            tpCalGroupSessionCache = { key: key, sessions: [] };
            return tpCalGroupSessionCache.sessions;
        }

        tpCalGroupSessionCache = { key: key, sessions: result.data || [] };
        return tpCalGroupSessionCache.sessions;
    } catch (err) {
        console.error('[CALENDAR] Tải group_sessions EXCEPTION:', err);
        tpCalGroupSessionCache = { key: key, sessions: [] };
        return tpCalGroupSessionCache.sessions;
    }
}

// Đảm bảo group_sessions của THÁNG (y, m) đang hiển thị đã được tải — cache-hit thì return ngay
// (không query), cache-miss thì tải rồi CHỈ render lại nếu người dùng vẫn đang đứng ở đúng
// Month View/đúng tháng đó lúc tải xong (tránh ghi đè 1 view khác họ đã chuyển sang trong lúc
// chờ mạng — mục C10).
function tpCalEnsureMonthGroupSessionsLoaded(y, m) {
    var startIso = getLocalIsoDate(new Date(y, m, 1));
    var endIso = getLocalIsoDate(new Date(y, m + 1, 0));
    var key = tpCalGroupSessionCacheKey(startIso, endIso);
    if (tpCalGroupSessionCache.key === key) return;

    tpCalLoadGroupSessionsForRange(startIso, endIso).then(function() {
        if (window.tpCalMainView === 'month' && window.tpCalYear === y && window.tpCalMonth === m) {
            renderTpCalendar();
        }
    });
}

// Tương tự cho TUẦN (Monday->Sunday) đang hiển thị ở Week View.
function tpCalEnsureWeekGroupSessionsLoaded(weekAnchorIsoAtCallTime) {
    var monday = tpWeekGetMonday(weekAnchorIsoAtCallTime);
    var startIso = getLocalIsoDate(monday);
    var endIso = getLocalIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
    var key = tpCalGroupSessionCacheKey(startIso, endIso);
    if (tpCalGroupSessionCache.key === key) return;

    tpCalLoadGroupSessionsForRange(startIso, endIso).then(function() {
        if (window.tpCalMainView === 'week' && tpWeekAnchorIso === weekAnchorIsoAtCallTime) {
            renderTpWeekView();
        }
    });
}

// Dựng danh sách item hiển thị cho 1 ngày từ CACHE group_sessions hiện có (đồng bộ, không gọi
// Supabase) — vai trò tương đương getLessonItemsForDate() nhưng dành RIÊNG cho group_sessions,
// giữ discriminator rõ ràng type:'group_session' (mục C3: "Do NOT fake them as students").
// Field `duration` giữ NGUYÊN đơn vị PHÚT như trong DB (group_sessions.duration) — KHÔNG đổi
// sang giờ ở đây, việc quy đổi (nếu cần cho tính toán chung với lesson 1-1 vốn tính bằng giờ)
// được làm riêng tại từng nơi sử dụng (renderTpWeekView) để tránh lẫn đơn vị.
function getGroupSessionItemsForDate(isoDate) {
    var gcList = groupClassList || [];
    return tpCalGroupSessionCache.sessions
        .filter(function(gs) { return gs.scheduled_date === isoDate; })
        .map(function(gs) {
            var gc = gcList.find(function(x) { return x.id === gs.group_class_id; });
            return {
                type: 'group_session',
                groupSession: gs,
                groupClass: gc || null,
                isoDate: gs.scheduled_date,
                dayName: null, // group_sessions không cần dayName (không dùng student_schedules.days)
                startTime: gs.start_time,
                duration: gs.duration, // PHÚT — xem ghi chú ở trên
                status: gs.status,
                sessionType: gs.session_type
            };
        })
        .sort(function(a, b) { return String(a.startTime || '').localeCompare(String(b.startTime || '')); });
}

// Card hiển thị 1 group_session trong danh sách buổi-của-ngày (renderTpCalDayList) — TÁI DÙNG
// class CSS .tw-card/.tw-card-main/.tw-card-side/.tw-status-pill đã có (đồng bộ hình dáng với
// buildTodaysWorkCard() của lesson 1-1) nhưng KHÔNG dùng chung hàm buildTodaysWorkCard() (hàm
// đó bắt buộc item.student — group session không có, ép dùng chung sẽ phải fake student, đúng
// điều đề bài cấm ở mục C3). Card này DISPLAY-ONLY (mục C5: "If no suitable Group Session detail
// modal currently exists: keep the event display-only... do not create a new complex modal") —
// KHÔNG gắn onclick, KHÔNG mở openLessonDetailModal (đó là modal của lesson 1-1, mục CRITICAL
// "Do not open the existing Lesson Detail modal for a Group Class session as if it were a 1-to-1
// lesson").
function buildGroupSessionDayCard(item) {
    var gc = item.groupClass;
    var STATUS_LABEL = { scheduled: 'Chưa học', completed: 'Đã hoàn thành', cancelled: 'Đã huỷ' };
    var STATUS_COLOR = { scheduled: 'var(--text-sub)', completed: '#10b981', cancelled: '#ef4444' };
    var durationHours = (Number(item.duration) || 0) / 60; // quy đổi PHÚT -> GIỜ chỉ để tính giờ kết thúc hiển thị
    var endTime = item.startTime ? computeScheduleEndTime(item.startTime, durationHours) : null;
    var timeText = item.startTime ? (item.startTime + (endTime ? ' – ' + endTime : '')) : '—';

    var card = document.createElement('div');
    card.className = 'tw-card tp-cal-group-card'
        + (item.status === 'completed' ? ' tw-card-done' : '')
        + (item.status === 'cancelled' ? ' tp-cal-group-card-cancelled' : '');

    card.innerHTML = '<div class="tw-card-main">'
        + '<div class="tw-card-time">🕐 ' + escapeHtml(timeText) + '</div>'
        + '<div class="tw-card-student">👥 ' + escapeHtml(gc ? gc.name : 'Lớp nhóm') + '</div>'
        + (gc && gc.subject ? '<div class="tw-card-subject">📘 ' + escapeHtml(gc.subject) + '</div>' : '')
        + '<div class="tw-card-duration">⏱️ ' + (item.duration != null ? Number(item.duration) + ' phút' : '—') + '</div>'
        + '<span class="tp-cal-group-badge">Nhóm' + (item.sessionType === 'makeup' ? ' · Bù' : '') + '</span>'
        + '</div>'
        + '<div class="tw-card-side">'
        + '<span class="tw-status-pill" style="color:' + (STATUS_COLOR[item.status] || STATUS_COLOR.scheduled) + '">' + (STATUS_LABEL[item.status] || STATUS_LABEL.scheduled) + '</span>'
        + '</div>';

    return card;
}

// ===== VIEW SWITCHER MỚI: Month View / Week View (mục "Calendar — thêm Week View") =====
// window.tpCalMainView là state MỚI, ĐỘC LẬP với tpCalMobileMode (toggle mobile-only cũ, agenda
// list — giữ nguyên 100%, không đổi). Mặc định 'month' để hành vi cũ không đổi khi mới mở
// trang (đúng yêu cầu "mặc định vẫn giữ Month View hiện tại").
window.tpCalMainView = 'month'; // 'month' | 'week'

// weekAnchorIso (optional, mới thêm cho Action Center — mục "TOMORROW PREVIEW"): khi truyền
// vào, set luôn tpWeekAnchorIso trước khi render, để có thể "focus" đúng tuần chứa 1 ngày cụ
// thể (VD: ngày mai) ngay cả khi Week View đang mở sẵn (không bị early-return bỏ qua). Không
// truyền gì thì hành vi giữ nguyên 100% như cũ.
function switchTpCalMainView(mode, weekAnchorIso) {
    if (weekAnchorIso) tpWeekAnchorIso = weekAnchorIso;
    if (window.tpCalMainView === mode && !weekAnchorIso) return;
    window.tpCalMainView = mode;
    document.querySelectorAll('#tp-cal-main-view-toggle button[data-tpcal-main-view]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tpcal-main-view') === mode);
    });
    var prevBtn = document.getElementById('tp-cal-prev-btn');
    var nextBtn = document.getElementById('tp-cal-next-btn');
    if (prevBtn) prevBtn.title = (mode === 'week') ? 'Tuần trước' : 'Tháng trước';
    if (nextBtn) nextBtn.title = (mode === 'week') ? 'Tuần sau' : 'Tháng sau';
    applyTpCalMainViewDisplay();
    if (mode === 'week') { renderTpWeekView(); } else { renderTpCalendar(); }
}

// Ẩn/hiện đúng khối UI theo window.tpCalMainView. Khi về 'month', gọi lại applyTpCalMobileModeDisplay()
// hiện có để khôi phục CHÍNH XÁC hành vi gốc (grid tháng trên desktop, hoặc tpCalMobileMode
// trên mobile) — không tự suy luận lại, tránh lệch với logic mobile-toggle đã có từ trước.
function applyTpCalMainViewDisplay() {
    var isWeek = (window.tpCalMainView === 'week');
    var weekWrap = document.getElementById('tp-cal-week-wrap');
    var statsRow = document.getElementById('tp-cal-stats-row');
    var daylistCard = document.getElementById('tp-cal-daylist-card');
    var mobileToggle = document.getElementById('tp-cal-view-toggle');
    var gridWrap = document.getElementById('tp-cal-grid-wrap');
    var agendaWrap = document.getElementById('tp-cal-agenda-wrap');

    if (weekWrap) weekWrap.style.display = isWeek ? '' : 'none';
    if (statsRow) statsRow.style.display = isWeek ? 'none' : '';
    if (daylistCard) daylistCard.style.display = isWeek ? 'none' : '';

    if (isWeek) {
        if (mobileToggle) mobileToggle.style.display = 'none';
        if (gridWrap) gridWrap.style.display = 'none';
        if (agendaWrap) agendaWrap.style.display = 'none';
    } else {
        if (mobileToggle) mobileToggle.style.display = ''; // để CSS @media gốc tự quyết định lại
        applyTpCalMobileModeDisplay(); // khôi phục đúng hành vi gốc (mobile-toggle cũ)
    }
}

// ===== WEEK VIEW: lưới 7 ngày (T2→CN) với time-axis theo giờ =====
// Tái sử dụng ĐÚNG getLessonItemsForDate() (student_schedules + lessons cache) — CÙNG nguồn
// dữ liệu với Month View, KHÔNG gọi thêm Supabase, KHÔNG tạo nguồn dữ liệu thứ hai (mục 10).
// Khung giờ hiển thị TÁI SỬ DỤNG đúng defaultTimes (06:00–22:00) đã dùng cho "Lịch rảnh hàng
// tuần" — KHÔNG hardcode riêng một khung giờ khác cho Week View (mục 2).
// TIMEZONE (mục 12): mọi Date ở đây được dựng từ (year,month,day) RỜI RẠC — giống hệt cách
// getLocalIsoDate()/renderTpCalMobileList() đã làm — TUYỆT ĐỐI không new Date(isoString) để
// tránh bug nhảy ngày do UTC parsing.
// getLocalIsoDate()/timeToFloat() giờ đến từ js/core/utils.js (ES module — LUÔN chạy sau khi
// parse xong toàn bộ HTML, theo spec), trong khi đây là code top-level chạy NGAY khi script
// chính (classic script) được parse — nên KHÔNG gán giá trị ngay tại đây nữa, chỉ khai báo
// biến (STEP 7B). Giá trị được gán ngay sau khi DOM sẵn sàng, ở dưới — trước khi user có thể
// tương tác với Week View, nên giữ đúng 100% giá trị/behavior gốc, chỉ đổi thời điểm gán.
var tpWeekAnchorIso, TP_WEEK_HOUR_START, TP_WEEK_HOUR_END;
document.addEventListener('DOMContentLoaded', function() {
    tpWeekAnchorIso = getLocalIsoDate(new Date()); // 1 ngày bất kỳ trong tuần đang xem
    TP_WEEK_HOUR_START = timeToFloat(defaultTimes[0]); // 6
    TP_WEEK_HOUR_END = timeToFloat(defaultTimes[defaultTimes.length - 1]); // 22
});
var TP_WEEK_PX_PER_HOUR = 56;

function tpWeekGetMonday(isoDate) {
    var parts = isoDate.split('-');
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, dnum = parseInt(parts[2], 10);
    var d = new Date(y, m, dnum); // dựng từ Y/M/D rời rạc — an toàn timezone
    var dow = d.getDay(); // 0 = Chủ Nhật
    var mondayOffset = (dow === 0) ? -6 : 1 - dow;
    return new Date(y, m, dnum + mondayOffset);
}

function tpWeekGoPrevWeek() {
    var monday = tpWeekGetMonday(tpWeekAnchorIso);
    tpWeekAnchorIso = getLocalIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7));
    renderTpWeekView();
}

function tpWeekGoNextWeek() {
    var monday = tpWeekGetMonday(tpWeekAnchorIso);
    tpWeekAnchorIso = getLocalIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7));
    renderTpWeekView();
}

function renderTpWeekView() {
    var headerRow = document.getElementById('tp-week-header-row');
    var colsBox = document.getElementById('tp-week-cols');
    var axisBox = document.getElementById('tp-week-axis-hours');
    if (!headerRow || !colsBox || !axisBox) return; // trang Calendar chưa có trong DOM

    var monday = tpWeekGetMonday(tpWeekAnchorIso);
    var days = [];
    for (var i = 0; i < 7; i++) {
        var dd = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        days.push({ date: dd, isoDate: getLocalIsoDate(dd), dayName: DAY_NUMBER_TO_NAME[dd.getDay()] });
    }
    var todayIso = getLocalIsoDate(new Date());
    var sunday = days[6].date;

    var titleEl = document.getElementById('tp-cal-title');
    if (titleEl) {
        titleEl.innerText = String(monday.getDate()).padStart(2, '0') + '/' + String(monday.getMonth() + 1).padStart(2, '0')
            + ' – ' + String(sunday.getDate()).padStart(2, '0') + '/' + String(sunday.getMonth() + 1).padStart(2, '0') + '/' + sunday.getFullYear();
    }

    var hourStart = TP_WEEK_HOUR_START, hourEnd = TP_WEEK_HOUR_END;
    var gridHeight = (hourEnd - hourStart) * TP_WEEK_PX_PER_HOUR;
    var STATUS_COLOR = { scheduled: '#38bdf8', completed: '#10b981', cancelled: '#ef4444', absent: '#f59e0b' };

    // STEP 11G-B2-A-FIX PART C6: đảm bảo group_sessions của TUẦN đang hiển thị đã/đang được tải.
    // Cache-hit -> đọc được ngay trong lần render này; cache-miss -> render lần này tạm thời
    // không có group session (an toàn, không chặn 1-1 lessons), rồi tự render lại 1 lần khi tải
    // xong (xem tpCalEnsureWeekGroupSessionsLoaded).
    tpCalEnsureWeekGroupSessionsLoaded(tpWeekAnchorIso);

    // ---- Time axis (nhãn theo giờ tròn — đường phụ 30 phút vẽ trong từng cột ngày) ----
    var axisHtml = '';
    for (var h = hourStart; h <= hourEnd; h++) {
        axisHtml += '<div class="tp-week-hour-label" style="height:' + TP_WEEK_PX_PER_HOUR + 'px;">' + String(h).padStart(2, '0') + ':00</div>';
    }
    axisBox.innerHTML = axisHtml;

    // ---- Header ngày ----
    var headerHtml = '';
    days.forEach(function(day) {
        var isToday = day.isoDate === todayIso;
        headerHtml += '<div class="tp-week-day-header' + (isToday ? ' tp-week-today-header' : '') + '">'
            + '<div class="tp-week-day-name">' + escapeHtml(day.dayName === 'Chủ Nhật' ? 'CN' : day.dayName.replace('Thứ ', 'T')) + '</div>'
            + '<div class="tp-week-day-date">' + String(day.date.getDate()).padStart(2, '0') + '/' + String(day.date.getMonth() + 1).padStart(2, '0') + '</div>'
            + '</div>';
    });
    headerRow.innerHTML = headerHtml;

    // ---- Cột ngày: gridlines + current-time-line dựng bằng chuỗi HTML; event dựng bằng
    // createElement (mục 9: cần gắn thẳng closure tới item.student, tránh tra cứu lại theo id
    // có thể lệch kiểu string/number). ----
    colsBox.innerHTML = '';
    days.forEach(function(day) {
        var col = document.createElement('div');
        col.className = 'tp-week-day-col';
        col.style.height = gridHeight + 'px';

        var linesHtml = '';
        for (var gh = hourStart; gh < hourEnd; gh++) {
            linesHtml += '<div class="tp-week-hourline" style="top:' + ((gh - hourStart) * TP_WEEK_PX_PER_HOUR) + 'px;"></div>';
            linesHtml += '<div class="tp-week-halfhourline" style="top:' + ((gh - hourStart) * TP_WEEK_PX_PER_HOUR + TP_WEEK_PX_PER_HOUR / 2) + 'px;"></div>';
        }
        // Current time indicator (mục 6) — chỉ vẽ nếu đây là hôm nay VÀ giờ hiện tại nằm
        // trong khung hiển thị, tránh vị trí âm/ngoài lưới.
        if (day.isoDate === todayIso) {
            var now = new Date();
            var nowFloat = now.getHours() + now.getMinutes() / 60;
            if (nowFloat >= hourStart && nowFloat <= hourEnd) {
                linesHtml += '<div class="tp-week-now-line" style="top:' + ((nowFloat - hourStart) * TP_WEEK_PX_PER_HOUR) + 'px;"></div>';
            }
        }
        col.innerHTML = linesHtml;

        // ---- Lesson events: cùng nguồn dữ liệu Month View (mục 10/11) ----
        var items = getLessonItemsForDate(day.isoDate, day.dayName).filter(function(it) { return it.startTime; });
        // PART C6: gộp thêm group_sessions của NGÀY này vào CÙNG mảng để tham gia CHUNG 1 vòng
        // tính overlap bên dưới (đề bài: "should participate in the same overlap calculation as
        // existing lesson events") — KHÔNG tạo 1 layout engine song song riêng cho group session.
        items = items.concat(getGroupSessionItemsForDate(day.isoDate).filter(function(it) { return it.startTime; }));
        items.sort(function(a, b) { return timeToFloat(a.startTime) - timeToFloat(b.startTime); });
        var laidOut = items.map(function(it) {
            var start = timeToFloat(it.startTime);
            // group_sessions.duration là PHÚT (khác lesson 1-1 vốn tính bằng GIỜ) — quy đổi về
            // GIỜ ngay tại đây để layout/overlap dùng chung 1 đơn vị nhất quán cho mọi loại item.
            var durationHours = (it.type === 'group_session') ? (Number(it.duration) || 0) / 60 : (Number(it.duration) || 0);
            var end = start + durationHours;
            return { item: it, start: start, end: end, col: 0, cols: 1, durationHours: durationHours };
        });
        // Overlap (mục 5): gom cụm các buổi chồng giờ nhau (connected components qua overlap
        // theo cặp), rồi chia đều chiều rộng trong từng cụm. Số buổi/ngày rất nhỏ nên O(n²)
        // không đáng lo (mục 16: không có vòng lặp DOM/Supabase nào bên trong).
        var visited = new Array(laidOut.length).fill(false);
        for (var s = 0; s < laidOut.length; s++) {
            if (visited[s]) continue;
            var stack = [s], comp = [];
            visited[s] = true;
            while (stack.length) {
                var cur = stack.pop(); comp.push(cur);
                for (var t = 0; t < laidOut.length; t++) {
                    if (!visited[t] && laidOut[t].start < laidOut[cur].end && laidOut[t].end > laidOut[cur].start) {
                        visited[t] = true; stack.push(t);
                    }
                }
            }
            comp.sort(function(x, y) { return laidOut[x].start - laidOut[y].start; });
            comp.forEach(function(idx, ci) { laidOut[idx].col = ci; laidOut[idx].cols = comp.length; });
        }

        laidOut.forEach(function(lo) {
            var it = lo.item;
            var clampedStart = Math.max(lo.start, hourStart);
            var clampedEnd = Math.min(lo.end, hourEnd);
            if (clampedEnd <= clampedStart) return; // buổi nằm ngoài hoàn toàn khung giờ hiển thị

            var top = (clampedStart - hourStart) * TP_WEEK_PX_PER_HOUR;
            var height = Math.max((clampedEnd - clampedStart) * TP_WEEK_PX_PER_HOUR, 20);
            var widthPct = 100 / lo.cols;
            var leftPct = widthPct * lo.col;
            // dùng lo.durationHours (đã quy đổi PHÚT->GIỜ cho group_session ở bước layout phía
            // trên) thay vì it.duration thô — với lesson 1-1, lo.durationHours === it.duration
            // (không đổi giá trị/behavior cũ).
            var endTimeStr = computeScheduleEndTime(it.startTime, lo.durationHours);
            var color = STATUS_COLOR[it.status] || STATUS_COLOR.scheduled;
            var isGroup = (it.type === 'group_session');

            var evEl = document.createElement('div');
            evEl.className = 'tp-week-event' + (isGroup ? ' tp-week-event-group' : '') + (it.status === 'cancelled' ? ' tp-week-event-cancelled' : '');
            evEl.style.top = top + 'px';
            evEl.style.height = height + 'px';
            evEl.style.left = 'calc(' + leftPct + '% + 2px)';
            evEl.style.width = 'calc(' + widthPct + '% - 4px)';
            evEl.style.borderLeftColor = color;

            if (isGroup) {
                // PART C4/C6: hiển thị RÕ đây là Group Class ("Nhóm"), KHÔNG hiển thị như học
                // sinh 1-1. PART C8: phân biệt buổi bù (session_type='makeup') qua nhãn "· Bù".
                var gc = it.groupClass;
                var gcName = gc ? gc.name : 'Lớp nhóm';
                evEl.title = gcName + ' — Nhóm' + (it.sessionType === 'makeup' ? ' · Bù' : '') + ' — ' + it.startTime + (endTimeStr ? '–' + endTimeStr : '');
                evEl.innerHTML = '<div class="tp-week-event-name">' + escapeHtml(gcName) + '</div>'
                    + '<div class="tp-week-event-subject">Nhóm' + (it.sessionType === 'makeup' ? ' · Bù' : '') + '</div>'
                    + '<div class="tp-week-event-time">' + it.startTime + (endTimeStr && height >= 46 ? '–' + endTimeStr : '') + '</div>';
                // CRITICAL (đề bài PART C5): KHÔNG mở Lesson Detail modal cho group session — chưa
                // có Group Session Detail modal an toàn ở step này nên để DISPLAY-ONLY, không gắn
                // click handler nào (mục C5: "keep the event display-only for this step").
            } else {
                evEl.title = (it.student.name || '') + ' — ' + it.startTime + (endTimeStr ? '–' + endTimeStr : '');
                evEl.innerHTML = '<div class="tp-week-event-name">' + escapeHtml(it.student.name || '') + '</div>'
                    + (it.student.subject ? '<div class="tp-week-event-subject">' + escapeHtml(it.student.subject) + '</div>' : '')
                    + '<div class="tp-week-event-time">' + it.startTime + (endTimeStr && height >= 46 ? '–' + endTimeStr : '') + '</div>';
                // Click -> mở Lesson Detail HIỆN CÓ (mục 9 cũ), KHÔNG tạo modal mới. KHÔNG đổi behavior 1-1.
                evEl.addEventListener('click', function() {
                    openLessonDetailModal(it.student, it.isoDate, it.dayName);
                });
            }
            col.appendChild(evEl);
        });

        colsBox.appendChild(col);
    });
}

// ‹/›/"Hôm nay" dùng CHUNG 3 nút UI cho cả Month View và Week View — rẽ nhánh theo
// window.tpCalMainView ngay đầu hàm (logic tính ngày của 2 nhánh HOÀN TOÀN tách biệt, không dùng
// chung 1 phép toán ngày nào, tránh sai lệch giữa "lùi 1 tháng" và "lùi 1 tuần").
function tpCalPrevMonth() {
    if (window.tpCalMainView === 'week') { tpWeekGoPrevWeek(); return; }
    window.tpCalMonth--;
    if (window.tpCalMonth < 0) { window.tpCalMonth = 11; window.tpCalYear--; }
    renderTpCalendar();
}

function tpCalNextMonth() {
    if (window.tpCalMainView === 'week') { tpWeekGoNextWeek(); return; }
    window.tpCalMonth++;
    if (window.tpCalMonth > 11) { window.tpCalMonth = 0; window.tpCalYear++; }
    renderTpCalendar();
}

// Nút "Hôm nay" trên trang "Lịch dạy" — quay lại tháng hiện tại và chọn luôn ngày hôm nay,
// KHÔNG tạo route mới, chỉ set lại state rồi renderTpCalendar() như prev/next tháng.
// Ở Week View: nhảy về tuần chứa hôm nay (mục 7), KHÔNG đụng state của Month View.
function tpCalGoToday() {
    var now = new Date();
    if (window.tpCalMainView === 'week') {
        tpWeekAnchorIso = getLocalIsoDate(now);
        renderTpWeekView();
        return;
    }
    window.tpCalYear = now.getFullYear();
    window.tpCalMonth = now.getMonth();
    window.tpCalSelectedIso = getLocalIsoDate(now);
    renderTpCalendar();
}

// Đổi bộ lọc trạng thái cho danh sách buổi của ngày đang chọn trên "Lịch dạy".
function setTpCalDayFilter(status) {
    tpCalDayFilterStatus = status;
    document.querySelectorAll('#tp-cal-day-filter-row .tw-filter-btn[data-tpcal-filter]').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tpcal-filter') === status);
    });
    if (window.tpCalSelectedIso) renderTpCalDayList(window.tpCalSelectedIso);
}

function renderTpCalendar() {
    var grid = document.getElementById('tp-cal-grid');
    if (!grid) return; // trang Calendar chưa có trong DOM (không phải Tutor workspace)

    var y = window.tpCalYear, m = window.tpCalMonth;
    var viMonths = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    var titleEl = document.getElementById('tp-cal-title');
    if (titleEl) titleEl.innerText = viMonths[m] + ' ' + y;

    // STEP 11G-B2-A-FIX PART C5: đảm bảo group_sessions của THÁNG đang hiển thị đã/đang được
    // tải. Đặt TRƯỚC vòng lặp ngày bên dưới để nếu cache đã có sẵn (cache-hit), group session
    // hiển thị NGAY trong lần render này — cache-miss thì lần render này tạm thời thiếu group
    // session (an toàn, 1-1 lessons vẫn render đủ), rồi tự render lại 1 lần khi tải xong.
    tpCalEnsureMonthGroupSessionsLoaded(y, m);

    grid.innerHTML = '';

    var firstDay = new Date(y, m, 1).getDay(); // 0 = CN
    var startOffset = (firstDay === 0) ? 6 : firstDay - 1; // tuần bắt đầu từ T2
    var daysInMonth = new Date(y, m + 1, 0).getDate();

    for (var i = 0; i < startOffset; i++) {
        var blank = document.createElement('div');
        blank.className = 'tp-cal-cell tp-cal-blank';
        grid.appendChild(blank);
    }

    var todayIso = getLocalIsoDate(new Date());
    var STATUS_DOT_COLOR = { scheduled: '#38bdf8', completed: '#10b981', cancelled: '#ef4444', absent: '#f59e0b' };

    // Thống kê nhanh của cả THÁNG (mục 14) — cộng dồn ngay trong vòng lặp ngày có sẵn bên dưới,
    // tránh gọi getLessonItemsForDate() thêm một lần nữa cho cùng dữ liệu.
    var monthTotal = 0, monthCompleted = 0, monthScheduled = 0, monthCancelled = 0;
    var monthHours = 0, monthRevenue = 0;

    for (var day = 1; day <= daysInMonth; day++) {
        var d = new Date(y, m, day);
        var isoDate = getLocalIsoDate(d);
        var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
        var items = getLessonItemsForDate(isoDate, dayName);
        // PART C5: group_sessions của ngày này — tính RIÊNG (không gộp vào `items`/monthTotal-KPI
        // phía dưới, vốn là số liệu tài chính/giờ dạy 1-1 — mục C9: "Do not change student revenue
        // calculations"). Chỉ dùng để hiển thị số lượng/chấm tròn trên ô ngày + danh sách buổi.
        var groupItemsForDay = getGroupSessionItemsForDate(isoDate);

        items.forEach(function(item) {
            monthTotal++;
            if (item.status === 'completed') {
                monthCompleted++;
                // STEP 9F: item.status === 'completed' đảm bảo item.lesson là lesson thật (xem
                // getLessonItemsForDate()) -> phải cộng đúng lesson.rate (snapshot VNĐ đầy đủ tại
                // thời điểm tạo, đã tự chọn đúng online_rate/offline_rate), KHÔNG dùng lại
                // student.rate hiện tại. lesson.rate đã là VNĐ đầy đủ nên KHÔNG nhân ×1000 nữa.
                monthRevenue += Number(item.lesson.rate) || 0;
            } else if (item.status === 'cancelled') {
                monthCancelled++;
            } else if (item.status === 'scheduled') {
                monthScheduled++;
            }
            if (item.status !== 'cancelled') monthHours += Number(item.duration) || 0; // giống quy tắc Today
        });

        var cell = document.createElement('div');
        cell.className = 'tp-cal-cell';
        if (isoDate === todayIso) cell.classList.add('tp-cal-today');
        if (isoDate === window.tpCalSelectedIso) cell.classList.add('tp-cal-selected');
        cell.setAttribute('data-iso', isoDate);

        var numEl = document.createElement('div');
        numEl.className = 'tp-cal-day-num';
        numEl.innerText = day;
        cell.appendChild(numEl);

        var totalDayCount = items.length + groupItemsForDay.length; // PART C5: group_sessions "count as calendar events"
        if (totalDayCount > 0) {
            var countEl = document.createElement('div');
            countEl.style.cssText = 'font-size:11px;color:var(--text-sub);margin-top:3px;';
            countEl.innerText = '● ' + totalDayCount + ' buổi';
            cell.appendChild(countEl);

            var dotRow = document.createElement('div');
            dotRow.className = 'tp-cal-dot-row';
            items.slice(0, 8).forEach(function(item) {
                var dot = document.createElement('div');
                dot.className = 'tp-cal-dot';
                dot.style.background = STATUS_DOT_COLOR[item.status] || STATUS_DOT_COLOR.scheduled;
                dotRow.appendChild(dot);
            });
            // PART C5: chấm riêng cho group_sessions — class .tp-cal-dot-group (hình vuông, xem
            // style.css) để "visually distinguishable" khỏi chấm tròn của lesson 1-1, màu vẫn
            // theo status (PART C7: respect existing status, không tự bịa màu/status mới).
            groupItemsForDay.slice(0, Math.max(0, 8 - items.length)).forEach(function(gItem) {
                var dot = document.createElement('div');
                dot.className = 'tp-cal-dot tp-cal-dot-group';
                dot.style.background = STATUS_DOT_COLOR[gItem.status] || STATUS_DOT_COLOR.scheduled;
                dotRow.appendChild(dot);
            });
            cell.appendChild(dotRow);

            // Mục 13: indicator nhật ký cho các buổi ĐÃ HOÀN THÀNH — 📝 nếu tất cả buổi completed
            // trong ngày đã có nhật ký, ⚠️ nếu còn ít nhất 1 buổi completed chưa ghi. Không đụng
            // schema/database, chỉ đọc lessons.notes đã có qua parseLessonJournal().
            var completedItems = items.filter(function(i) { return i.status === 'completed'; });
            if (completedItems.length > 0) {
                var missingJournal = completedItems.some(function(i) {
                    var j = parseLessonJournal(i.lesson ? i.lesson.notes : '');
                    return !(j.content || j.feedback || j.homework);
                });
                var journalIndicator = document.createElement('div');
                journalIndicator.style.cssText = 'font-size:11px; margin-top:2px;';
                journalIndicator.title = missingJournal ? 'Có buổi đã dạy nhưng chưa ghi nhật ký' : 'Đã ghi nhật ký đầy đủ';
                journalIndicator.innerText = missingJournal ? '⚠️' : '📝';
                cell.appendChild(journalIndicator);
            }
        }

        cell.addEventListener('click', function() {
            window.tpCalSelectedIso = this.getAttribute('data-iso');
            renderTpCalendar();
        });

        grid.appendChild(cell);
    }

    var statsRow = document.getElementById('tp-cal-stats-row');
    if (statsRow) {
        var hoursText = (monthHours % 1 === 0 ? monthHours : monthHours.toFixed(1)) + 'h';
        statsRow.innerHTML = ''
            + '<div class="tw-kpi-card"><div class="tw-kpi-value">' + monthTotal + '</div><div class="tw-kpi-label">📚 Tổng buổi</div></div>'
            + '<div class="tw-kpi-card"><div class="tw-kpi-value" style="color:#10b981;">' + monthCompleted + '</div><div class="tw-kpi-label">✅ Đã hoàn thành</div></div>'
            + '<div class="tw-kpi-card"><div class="tw-kpi-value" style="color:#38bdf8;">' + monthScheduled + '</div><div class="tw-kpi-label">🕒 Chưa học</div></div>'
            + '<div class="tw-kpi-card"><div class="tw-kpi-value" style="color:#ef4444;">' + monthCancelled + '</div><div class="tw-kpi-label">❌ Đã huỷ</div></div>'
            + '<div class="tw-kpi-card"><div class="tw-kpi-value">' + hoursText + '</div><div class="tw-kpi-label">⏱️ Tổng giờ</div></div>'
            + '<div class="tw-kpi-card"><div class="tw-kpi-value" style="color:#00cca3;">' + monthRevenue.toLocaleString('vi-VN') + 'đ</div><div class="tw-kpi-label">💰 Tiền đã dạy</div></div>';
    }

    if (window.tpCalSelectedIso) {
        renderTpCalDayList(window.tpCalSelectedIso);
    } else {
        var listTitle = document.getElementById('tp-cal-day-list-title');
        if (listTitle) listTitle.innerText = 'Chọn một ngày để xem buổi học';
        var listBox = document.getElementById('tp-cal-day-list');
        if (listBox) listBox.innerHTML = '';
    }

    applyTpCalMobileModeDisplay();
    renderTpCalMobileList();
}

// ===== MOBILE CALENDAR VIEW: Tháng / Tuần / Danh sách (Mobile UX 2.0, mục 8) =====
// Mặc định 'agenda' trên mobile (<=640px) — reuse getLessonItemsForDate()/buildTodaysWorkCard(),
// KHÔNG tạo nguồn dữ liệu/route mới. Trên desktop luôn hiển thị lưới tháng bất kể biến này.
var tpCalMobileMode = 'agenda';

function switchTpCalMobileMode(mode) {
    tpCalMobileMode = mode;
    document.querySelectorAll('#tp-cal-view-toggle button[data-tpcal-view]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tpcal-view') === mode);
    });
    applyTpCalMobileModeDisplay();
    renderTpCalMobileList();
}

function applyTpCalMobileModeDisplay() {
    // Fix regression (mục 17): hàm này chỉ điều khiển gridWrap/agendaWrap của MONTH VIEW cũ.
    // Nó được gọi trực tiếp bởi window resize listener (mục dưới) mà KHÔNG biết gì về
    // window.tpCalMainView mới — nếu đang ở Week View và người dùng resize/xoay màn hình, hàm sẽ vô
    // tình set gridWrap.style.display = '' (hiện lại Month grid) đè lên Week View đang mở.
    // Bỏ qua hoàn toàn khi đang Week View; applyTpCalMainViewDisplay() đã ẩn 2 khối này rồi
    // và sẽ tự gọi lại đúng hàm này khi chuyển về Month View.
    if (typeof window.tpCalMainView !== 'undefined' && window.tpCalMainView === 'week') return;
    var gridWrap = document.getElementById('tp-cal-grid-wrap');
    var agendaWrap = document.getElementById('tp-cal-agenda-wrap');
    if (!gridWrap || !agendaWrap) return;
    var isMobile = window.matchMedia('(max-width:640px)').matches;
    if (!isMobile) {
        gridWrap.style.display = '';
        agendaWrap.style.display = 'none';
        return;
    }
    gridWrap.style.display = (tpCalMobileMode === 'month') ? '' : 'none';
    agendaWrap.style.display = (tpCalMobileMode === 'month') ? 'none' : '';
}
// Mobile UX 2.0: đồng bộ lại grid/agenda khi xoay màn hình hoặc kéo cửa sổ qua mốc 640px
// (VD: mở DevTools/resize) — chỉ 1 listener, gọi lại hàm nhẹ đã có, KHÔNG polling liên tục.
window.addEventListener('resize', applyTpCalMobileModeDisplay);

// 'week' = 7 ngày (T2→CN) chứa ngày hôm nay thực tế; 'agenda' = cả tháng đang xem trên lịch
// (window.tpCalYear/window.tpCalMonth). Chỉ hiển thị các ngày CÓ buổi học (khớp tpCalDayFilterStatus),
// giống ví dụ trong yêu cầu — không render ngày trống để đỡ cuộn dài trên điện thoại.
function renderTpCalMobileList() {
    var box = document.getElementById('tp-cal-agenda-list');
    if (!box || tpCalMobileMode === 'month') return;

    var dates = [];
    if (tpCalMobileMode === 'week') {
        var now = new Date();
        var dow = now.getDay();
        var mondayOffset = (dow === 0) ? -6 : 1 - dow;
        for (var i = 0; i < 7; i++) {
            dates.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + i));
        }
    } else {
        var daysInMonth = new Date(window.tpCalYear, window.tpCalMonth + 1, 0).getDate();
        for (var day = 1; day <= daysInMonth; day++) dates.push(new Date(window.tpCalYear, window.tpCalMonth, day));
    }

    box.innerHTML = '';
    var anyItems = false;
    dates.forEach(function(d) {
        var isoDate = getLocalIsoDate(d);
        var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
        var items = getLessonItemsForDate(isoDate, dayName);
        var filtered = tpCalDayFilterStatus === 'all' ? items : items.filter(function(i) { return i.status === tpCalDayFilterStatus; });
        if (filtered.length === 0) return;
        anyItems = true;
        var header = document.createElement('div');
        header.className = 'tp-cal-agenda-daylabel';
        header.innerText = dayName.toUpperCase() + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        box.appendChild(header);
        filtered.forEach(function(item) { box.appendChild(buildTodaysWorkCard(item, false)); });
    });
    if (!anyItems) {
        box.innerHTML = '<div class="tw-empty">🎉 Không có buổi học nào trong khoảng thời gian này.</div>';
    }
}

// Hiển thị danh sách buổi học của MỘT ngày đã chọn trên lịch (tái sử dụng buildTodaysWorkCard).
// Áp dụng tpCalDayFilterStatus (mục 13) — chỉ là ống kính hiển thị, không đụng dữ liệu Supabase.
function renderTpCalDayList(isoDate) {
    var parts = isoDate.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
    var items = getLessonItemsForDate(isoDate, dayName);
    var filteredItems = tpCalDayFilterStatus === 'all' ? items : items.filter(function(i) { return i.status === tpCalDayFilterStatus; });

    // PART C5: group_sessions của ngày này tham gia CHUNG danh sách hiển thị + bộ lọc trạng thái
    // đang chọn (giá trị status trùng nhau: scheduled/completed/cancelled — filter "Vắng"/"absent"
    // đơn giản không khớp gì bên group, đúng vì group_sessions không có khái niệm "Vắng").
    var groupItems = getGroupSessionItemsForDate(isoDate);
    var filteredGroupItems = tpCalDayFilterStatus === 'all' ? groupItems : groupItems.filter(function(i) { return i.status === tpCalDayFilterStatus; });
    var totalCount = items.length + groupItems.length;

    var titleEl = document.getElementById('tp-cal-day-list-title');
    if (titleEl) {
        titleEl.innerText = dayName + ', ' + parts[2] + '/' + parts[1] + '/' + parts[0]
            + (totalCount > 0 ? ' — ' + totalCount + ' buổi học' : '');
    }

    var listBox = document.getElementById('tp-cal-day-list');
    if (!listBox) return;
    if (totalCount === 0) {
        listBox.innerHTML = '<div class="tw-empty">🎉 Không có buổi học trong ngày này.</div>';
    } else if (filteredItems.length === 0 && filteredGroupItems.length === 0) {
        listBox.innerHTML = '<div class="tw-empty">Không có buổi học nào khớp bộ lọc đang chọn.</div>';
    } else {
        listBox.innerHTML = '';
        // Gộp 2 nguồn (lesson 1-1 + group_sessions) rồi sắp theo giờ bắt đầu để trải nghiệm liền
        // mạch trong 1 danh sách — mỗi loại vẫn dùng đúng card builder RIÊNG của nó (KHÔNG dùng
        // chung buildTodaysWorkCard() cho group session, xem ghi chú tại buildGroupSessionDayCard).
        var combined = filteredItems.map(function(it) { return { kind: 'lesson', item: it }; })
            .concat(filteredGroupItems.map(function(it) { return { kind: 'group', item: it }; }));
        combined.sort(function(a, b) { return String(a.item.startTime || '').localeCompare(String(b.item.startTime || '')); });
        combined.forEach(function(c) {
            listBox.appendChild(c.kind === 'lesson' ? buildTodaysWorkCard(c.item, false) : buildGroupSessionDayCard(c.item));
        });
    }
}

// Nạp dữ liệu buổi học (Supabase-backed: từ public.lessons; local-only: từ localStorage cũ)
// rồi render lưới điểm danh + số buổi/tiền của tháng đang chọn.
async function loadMonthAttendanceAndFee() {
    var student = classList.find(c => c.id === activeProfileClassId);
    if (!student) return;

    if(!student.feePaidMonths) student.feePaidMonths = {};
    var grid = document.getElementById('attendance-box-grid');

    if (student._supabaseSource) {
        // Nguồn dữ liệu chính = Supabase public.lessons — luôn nạp lại để đồng bộ giữa Tutor/Admin.
        grid.innerHTML = '<div style="color:var(--text-sub); font-size:13px; padding:10px;">⏳ Đang tải dữ liệu buổi học...</div>';
        var result = await loadStudentLessons(student.id);
        if (result.error) {
            grid.innerHTML = '<div style="color:#ef4444; font-size:13px; padding:10px;">⚠️ Không tải được dữ liệu buổi học.<br>' + describeSupabaseError(result.error) + '</div>';
            return; // không cập nhật UI giả, giữ nguyên dữ liệu cũ
        }
        rebuildAttendanceBridgeFromLessons(student);

        // Nguồn dữ liệu chính học phí = Supabase public.payments — luôn nạp lại để đồng bộ Tutor/Admin.
        var paymentsResult = await loadStudentPayments(student.id);
        if (paymentsResult.error) {
            var feeBtnErr = document.getElementById('fee-status-toggle-btn');
            feeBtnErr.innerText = "⚠️ Lỗi tải học phí";
            feeBtnErr.className = "fee-toggle-status fee-unpaid";
            document.getElementById('payment-history-section').style.display = 'none';
            // Không cập nhật UI giả — vẫn hiển thị lưới điểm danh, nhưng dừng lại không tính
            // trạng thái học phí từ cache cũ/rỗng.
            refreshMonthMoneyDisplay(student);
            renderAttendanceGrid(student);
            return;
        }
    } else {
        if(!student.attendance) student.attendance = {};
        if(!student.attendance[currentSelectedMonth]) student.attendance[currentSelectedMonth] = [];
    }

    if(!student.attendance[currentSelectedMonth]) student.attendance[currentSelectedMonth] = [];

    refreshMonthMoneyDisplay(student);
    refreshFeeStatusUI(student);
    renderPaymentHistory(student);
    renderAttendanceGrid(student);
    refreshStudentProfileExtras(student); // Student Profile 2.0 — vẽ lại hero/KPI/tabs từ cache vừa nạp
}

// Render lưới các buổi học trong tháng đang chọn, dựa trên "Thứ học cố định" (student_schedules).
// Với học sinh Supabase (_supabaseSource), mỗi ô đọc/ghi trực tiếp vào public.lessons (qua cache).
// Với học sinh local-only (chưa chuyển đổi), giữ nguyên hành vi checkbox + localStorage như cũ.
// Đóng tất cả menu trạng thái buổi học đang mở, trừ menu được truyền vào (nếu có) — dùng khi mở
// một menu mới (chỉ 1 menu mở tại một thời điểm) và khi click ra ngoài.
function closeAllLessonStatusMenus(exceptMenu) {
    document.querySelectorAll('.lesson-status-menu.open').forEach(function(m) {
        if (m !== exceptMenu) m.classList.remove('open');
    });
}
document.addEventListener('click', function() { closeAllLessonStatusMenus(); });

function renderAttendanceGrid(student) {
    var grid = document.getElementById('attendance-box-grid');
    console.log('[RENDER] renderAttendanceGrid cho student.id=' + student.id + ', lessons cache hiện tại:', lessonsCacheByStudent[student.id]);
    grid.innerHTML = '';
    // Học sinh Supabase hiển thị dạng bảng thật (có tiêu đề cột, các cột thẳng hàng);
    // học sinh local-only giữ dạng danh sách checkbox cũ.
    grid.classList.toggle('attendance-table-wrap', !!student._supabaseSource);
    if (student._supabaseSource) {
        var head = document.createElement('div');
        head.className = 'lesson-row-header';
        head.innerHTML = '<span>#</span><span>Ngày học</span><span>Học phí</span><span>Trạng thái</span><span></span>';
        grid.appendChild(head);
    }

    var parts = currentSelectedMonth.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]) - 1;

    var targetDays = student.days && student.days.length ? student.days : [student.day];
    var targetDayNumbers = targetDays.map(getDayOfWeekNumber);
    var totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    var statusMeta = lessonStatusMeta; // dùng chung với lesson-detail modal, xem khai báo global phía trên

    // Mục 7: tổng tiền LŨY KẾ tính đến từng buổi completed, theo đúng thứ tự thời gian tăng dần
    // (vòng lặp day đã đi từ 1 -> cuối tháng nên đã đúng thứ tự ngày tăng dần).
    var runningMoney = 0;

    var countDays = 0;
    for (let day = 1; day <= totalDaysInMonth; day++) {
        let curDate = new Date(year, month, day);
        if (targetDayNumbers.includes(curDate.getDay())) {
            countDays++;
            let dayName = targetDays[targetDayNumbers.indexOf(curDate.getDay())];
            let dateStr = String(day).padStart(2, '0') + "/" + String(month + 1).padStart(2, '0');
            let isoDate = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');

            let lesson = student._supabaseSource ? findLessonForDate(student.id, isoDate) : null;
            let status = lesson ? lesson.status
                : (!student._supabaseSource && student.attendance[currentSelectedMonth].includes(dateStr) ? 'completed' : 'scheduled');
            let meta = statusMeta[status] || statusMeta.scheduled;

            // Học phí là GIÁ SNAPSHOT của TỪNG buổi (lessons.rate, đã tự chọn đúng online_rate/
            // offline_rate lúc tạo) -> mỗi buổi "Đã học" cộng đúng lesson.rate của chính nó, KHÔNG
            // dùng lại student.rate hiện tại (STEP 9F). Nếu ra 0đ, đó LUÔN là do lesson.rate đang
            // bằng 0/thiếu — cảnh báo rõ để tutor kiểm tra.
            let lessonMoneyHtml = '';
            if (student._supabaseSource && status === 'completed' && lesson) {
                // `lesson` đã được xác nhận non-null ở điều kiện if ngay trên -> lesson.rate là
                // snapshot VNĐ đầy đủ, KHÔNG nhân ×1000.
                let lessonAmount = Number(lesson.rate) || 0;
                runningMoney += lessonAmount;
                if (lessonAmount > 0) {
                    lessonMoneyHtml = '<div class="lesson-row-fee">' + lessonAmount.toLocaleString('vi-VN') + 'đ'
                        + '<span class="cumulative">lũy kế ' + runningMoney.toLocaleString('vi-VN') + 'đ</span></div>';
                } else {
                    lessonMoneyHtml = '<div class="lesson-row-fee zero-warning" title="Buổi này tính ra 0đ vì Học phí/buổi của học sinh đang bằng 0. Vào hồ sơ học sinh để nhập lại Học phí/Buổi.">⚠️ Thiếu học phí</div>';
                }
            } else if (student._supabaseSource) {
                lessonMoneyHtml = '<div class="lesson-row-fee empty">—</div>';
            }

            let item = document.createElement('div');

            if (student._supabaseSource) {
                // Mục 8: MỘT dropdown trạng thái duy nhất — gọn hơn pill+menu cũ, không còn 2 lớp
                // click (bấm pill rồi mới chọn trong menu) gây cảm giác rối mắt.
                // Mục 9/11: label/màu CHỈ phụ thuộc "status" (đọc trực tiếp từ lesson.status ở trên,
                // không có fallback nào khác) — không có cách nào khác để nó lệch với DB.
                item.className = 'lesson-row status-' + status;

                let numBadge = document.createElement('div');
                numBadge.className = 'lesson-row-num';
                numBadge.textContent = countDays;
                item.appendChild(numBadge);

                let info = document.createElement('div');
                info.className = 'lesson-row-info';
                info.innerHTML = '<span class="lesson-row-title">' + dayName + ' - ' + dateStr + (lesson && lesson.notes ? ' 📝' : '') + '</span>'
                    + '<span class="lesson-row-sub">Buổi ' + countDays + '</span>';
                item.appendChild(info);

                item.insertAdjacentHTML('beforeend', lessonMoneyHtml);

                let statusIcon = { scheduled: '⚪', completed: '🟢', absent: '🟡', cancelled: '🔴' };
                let select = document.createElement('select');
                select.className = 'lesson-status-select status-' + status;
                // "let" ở đầu vòng lặp (thay cho "var" trước đây) đảm bảo MỖI lần lặp tạo ra một
                // binding riêng cho select/isoDate/dayName/lesson — đây chính là chỗ sửa lỗi
                // "bấm ngày nào cũng tính cho ngày cuối tháng": trước đây dùng "var" nên các closure
                // đều trỏ chung vào biến của LẦN LẶP CUỐI (buổi cuối tháng) sau khi vòng lặp kết
                // thúc, bất kể bấm vào control của buổi nào.
                ['completed', 'scheduled', 'absent', 'cancelled'].forEach(function(s) {
                    var opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = statusIcon[s] + ' ' + statusMeta[s].label;
                    if (s === status) opt.selected = true;
                    select.appendChild(opt);
                });
                select.addEventListener('click', function(e) { e.stopPropagation(); }); // không mở lesson detail khi chỉ bấm để mở dropdown
                select.addEventListener('change', function(e) {
                    e.stopPropagation();
                    var chosenStatus = select.value; // mục 14: giá trị tường minh từ control, không toggle mù
                    // STEP 7 — entry point A: nếu buổi học NÀY CHƯA tồn tại (lesson == null) thì đổi
                    // status ở đây sẽ TẠO lesson mới (qua setLessonStatusForDate() -> createLesson())
                    // -> phải xác định teaching_mode TRƯỚC. Lesson ĐÃ tồn tại thì KHÔNG hỏi mode
                    // (mục 7 đề bài — không hỏi lại/không đổi rate của lesson cũ).
                    var teachingMode;
                    if (!lesson) {
                        teachingMode = resolveStudentTeachingMode(student);
                        if (teachingMode === null) {
                            select.value = status; // Case C, tutor cancel -> khôi phục lựa chọn cũ trên dropdown
                            return; // KHÔNG tạo lesson
                        }
                    }
                    select.disabled = true; // chặn double-đổi trong lúc đang gọi Supabase
                    setLessonStatusForDate(student, isoDate, dayName, chosenStatus, lesson, teachingMode);
                });
                item.appendChild(select);

                if (lesson) {
                    let delBtn = document.createElement('button');
                    delBtn.className = 'lesson-row-del';
                    delBtn.innerHTML = '🗑️';
                    delBtn.title = 'Xóa buổi học này';
                    delBtn.onclick = function(e) {
                        e.stopPropagation();
                        removeLessonForDate(student, lesson.id);
                    };
                    item.appendChild(delBtn);
                }

                // MODULE QUẢN LÝ BUỔI HỌC — bấm vào phần thông tin của dòng lesson (không phải
                // dropdown trạng thái hay nút xóa) để mở modal chi tiết buổi học.
                item.style.cursor = 'pointer';
                item.addEventListener('click', function(e) {
                    if (e.target.closest('.lesson-status-select') || e.target.closest('.lesson-row-del')) return;
                    openLessonDetailModal(student, isoDate, dayName);
                });
            } else {
                item.className = 'attendance-item' + (meta.cls ? ' ' + meta.cls : '');
                item.style.cssText = 'justify-content:space-between;';

                let labelWrap = document.createElement('div');
                labelWrap.style.cssText = 'display:flex; align-items:center; gap:10px; flex:1; min-width:0;';
                labelWrap.innerHTML = `<input type="checkbox" ${status === 'completed' ? 'checked' : ''}>
                   <span>Buổi ${countDays}: ${dayName} - ${dateStr}</span>`;
                item.appendChild(labelWrap);

                // Học sinh local-only (chưa chuyển sang Supabase): giữ nguyên hành vi cũ.
                (function(dStr, boxItem) {
                    boxItem.onclick = function(e) {
                        var chk = boxItem.querySelector('input');
                        if(e.target !== chk) chk.checked = !chk.checked;

                        if(chk.checked) {
                            if(!student.attendance[currentSelectedMonth].includes(dStr)) {
                                student.attendance[currentSelectedMonth].push(dStr);
                            }
                            boxItem.classList.add('checked');
                        } else {
                            student.attendance[currentSelectedMonth] = student.attendance[currentSelectedMonth].filter(x => x !== dStr);
                            boxItem.classList.remove('checked');
                        }

                        var activeMonthKey = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
                        if(currentSelectedMonth === activeMonthKey) {
                            student.sessions = student.attendance[activeMonthKey].length;
                        }

                        saveData();
                        refreshMonthMoneyDisplay(student);
                    };
                })(dateStr, item);
            }

            grid.appendChild(item);
        }
    }
    if(countDays === 0) {
        grid.innerHTML = '<div style="color:var(--text-sub); font-size:13px; padding:10px;">Không tìm thấy ngày trùng khớp lịch cố định trong tháng này.</div>';
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (HTML COMPATIBILITY)
// Chỉ export những hàm được gọi trực tiếp từ onclick/onchange trong HTML, hoặc
// từ script chính (classic script)/module khác như global — đúng pattern của
// js/students/students.js (STEP 7C) và js/lessons/lessons.js (STEP 7D). Các hàm
// nội bộ (không bị gọi từ bên ngoài module này) KHÔNG được expose riêng.
// ============================================================================
export {
    switchTpCalMainView, applyTpCalMainViewDisplay,
    tpWeekGetMonday, tpWeekGoPrevWeek, tpWeekGoNextWeek, renderTpWeekView,
    tpCalPrevMonth, tpCalNextMonth, tpCalGoToday, setTpCalDayFilter, renderTpCalendar,
    switchTpCalMobileMode, applyTpCalMobileModeDisplay, renderTpCalMobileList, renderTpCalDayList,
    loadMonthAttendanceAndFee, closeAllLessonStatusMenus, renderAttendanceGrid
};

window.switchTpCalMainView = switchTpCalMainView;
window.applyTpCalMainViewDisplay = applyTpCalMainViewDisplay;
window.tpWeekGetMonday = tpWeekGetMonday;
window.tpWeekGoPrevWeek = tpWeekGoPrevWeek;
window.tpWeekGoNextWeek = tpWeekGoNextWeek;
window.renderTpWeekView = renderTpWeekView;
window.tpCalPrevMonth = tpCalPrevMonth;
window.tpCalNextMonth = tpCalNextMonth;
window.tpCalGoToday = tpCalGoToday;
window.setTpCalDayFilter = setTpCalDayFilter;
window.renderTpCalendar = renderTpCalendar;
window.switchTpCalMobileMode = switchTpCalMobileMode;
window.applyTpCalMobileModeDisplay = applyTpCalMobileModeDisplay;
window.renderTpCalMobileList = renderTpCalMobileList;
window.renderTpCalDayList = renderTpCalDayList;
window.loadMonthAttendanceAndFee = loadMonthAttendanceAndFee;
window.closeAllLessonStatusMenus = closeAllLessonStatusMenus;
window.renderAttendanceGrid = renderAttendanceGrid;

// State vars (tpCalYear/tpCalMonth/tpCalSelectedIso/tpCalDayFilterStatus/tpCalMainView/
// tpWeekAnchorIso/TP_WEEK_HOUR_START/TP_WEEK_HOUR_END/TP_WEEK_PX_PER_HOUR/tpCalMobileMode)
// KHÔNG được export/window-expose: code ngoài module này (goToCalendarDate/
// goToCalendarDateAsWeek trong index.html) chỉ ĐỌC/GHI chúng dưới dạng "var" toàn cục
// classic-script-style (không phải qua import) — "var" ở top-level của module KHÔNG tạo
// biến global thật (module có scope riêng). Vì các hàm bên ngoài kia BẮT BUỘC phải gán
// trực tiếp tpCalYear = ...; tpCalMonth = ...; tpCalSelectedIso = ...; tpCalMainView chỉ
// đọc — nên các biến state này được gán qua window.* (KHÔNG dùng var) để trở thành thuộc
// tính thật của window, giữ đúng hành vi "biến toàn cục dùng chung" như trước khi tách.

// ============================================================================
// STEP 8C — ĐĂNG KÝ LẮNG NGHE "LESSONS DATA CHANGED" (phá circular dependency)
// ============================================================================
// TRƯỚC STEP 8C: js/lessons/lessons.js gọi THẲNG renderAttendanceGrid(student) (hàm ngay
// phía trên) mỗi khi mutate xong lessons, tạo vòng gọi Calendar → Lessons → Calendar.
// STEP 8C: Lessons chỉ gọi notifyLessonsDataChanged(student) (js/core/state.js — tầng
// core, không biết Calendar tồn tại). Calendar (module này) tự đăng ký lắng nghe ở đây để
// tiếp tục refresh lưới điểm danh y hệt hành vi cũ — KHÔNG đổi behavior, chỉ đổi CƠ CHẾ nối
// dây: Lessons không còn giữ tên hàm renderAttendanceGrid trong code của nó nữa.
window.onLessonsDataChanged(function(student) {
    renderAttendanceGrid(student);
});
