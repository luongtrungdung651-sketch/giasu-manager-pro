// ============================================================================
// js/group-class/generator.js  —  STEP 11G-C2-B: GROUP SESSION GENERATOR (12-WEEK ROLLING WINDOW)
// ============================================================================
// Đây là ES module thật (cùng convention js/group-class/group-class.js/enrollment.js/
// session.js/schedule.js — xem comment trong index.html tại vị trí nạp module này). Module này
// tự expose entry point qua window ở cuối file để (a) group-class.js gọi lại qua
// window.runGroupSessionGeneratorIfNeeded trong switchGroupClassTab(), và (b) nút fallback thủ
// công (nếu có) gọi trực tiếp.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js/group-class.js định nghĩa
// (activeGroupClassId, supabaseClient, showToast, describeSupabaseError). Module này KHÔNG
// import group-class.js/session.js/schedule.js (tránh circular dependency — cùng lý do các
// module anh em không import lẫn nhau, xem comment trong schedule.js/session.js) và KHÔNG import
// js/core/utils.js/toast.js (dùng lại qua window.* như quy ước hiện có của group-class.js —
// window.getLocalIsoDate/window.showToast). Cùng lý do defer/module với các module khác: module
// bị hoãn, chạy SAU khi script chính đã chạy xong, và tại thời điểm hàm dưới đây THỰC SỰ được
// gọi (người dùng mở tab "Buổi học"/bấm nút thủ công), mọi global trên đã tồn tại.
//
// ARCHITECTURE (đã audit + approve ở STEP 11G-C2-A):
//   group_class_schedules (RULE lặp lại) -> Generator -> group_sessions (MATERIALIZED)
//     -> Calendar/Attendance/Billing (đọc lại group_sessions, KHÔNG đổi gì ở đây).
//
// PHẠM VI STEP 11G-C2-B (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN):
//   1. Đọc group_class_schedules đang active của activeGroupClassId.
//   2. Với mỗi lịch active, sinh các ngày khớp day_of_week trong cửa sổ 12 tuần (today .. today+83,
//      cả 2 đầu inclusive) VÀ trong khoảng hiệu lực [start_date, end_date] của lịch đó.
//   3. Pre-query TOÀN BỘ group_sessions hiện có (mọi session_type/status) trong cửa sổ để biết
//      slot nào đã bị chiếm — bỏ qua candidate trùng slot.
//   4. Insert 1 lần (batch) các candidate còn thiếu — LUÔN session_type='regular',
//      status='scheduled', notes=null.
//   5. Idempotent — chạy lại bao nhiêu lần cũng không tạo trùng (pre-query diff + UNIQUE
//      constraint DB là backstop cuối).
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (KHÔNG code ở đây dù chỉ 1 dòng):
//   - Tạo/sửa/xoá group_class_schedules (đó là schedule.js, KHÔNG đụng).
//   - Sinh buổi 'makeup' (Generator CHỈ tạo 'regular').
//   - Sửa/xoá bất kỳ group_sessions đã tồn tại (mọi status/session_type).
//   - Attendance/Billing/Calendar.
//   - RPC/Edge Function mới.
//
// NO HARD DELETE / NO UPDATE của session đã tồn tại: Generator TUYỆT ĐỐI KHÔNG được viết bất kỳ
// hàm nào gọi supabaseClient.from('group_sessions').update(...)/.delete(...). Generator CHỈ có
// .select() (2 lần: schedules + existing sessions) và .insert() (batch, khi có candidate thiếu).
// ============================================================================

// ----------------------------------------------------------------------
// ROLLING WINDOW — mục 4 đề bài STEP 11G-C2-A/B: [today, today+83] CẢ 2 ĐẦU INCLUSIVE = đúng 84
// ngày = 12 tuần. KHÔNG dùng today+84 làm end inclusive (sẽ dư 1 ngày -> 13 tuần thiếu 1 ngày).
// Dùng getLocalIsoDate() (window.*, js/core/utils.js) + Date cục bộ (KHÔNG dùng UTC) để cộng
// ngày, cùng cách project đang dùng cho toàn app (schedule.js isoDateMinusOneDay() cùng convention).
// ----------------------------------------------------------------------
var GENERATOR_WINDOW_DAYS = 84; // today .. today+83 inclusive = 84 ngày

function computeGeneratorWindow() {
    var now = new Date();
    var todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var endLocal = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate() + (GENERATOR_WINDOW_DAYS - 1));
    return {
        startIso: window.getLocalIsoDate(todayLocal),
        endIso: window.getLocalIsoDate(endLocal)
    };
}

// Cộng n ngày (n có thể âm) lên 1 chuỗi ISO "YYYY-MM-DD", trả về Date cục bộ mới — dùng Date
// cục bộ (KHÔNG parse qua "new Date(isoStr)" trần vì chuỗi đó bị hiểu là UTC midnight ở 1 số
// engine, có thể lệch ngày khi hiển thị lại theo giờ Việt Nam UTC+7 — cùng cảnh báo mục 5 đề bài
// và cùng pattern isoDateMinusOneDay() của schedule.js).
function isoDateToLocalDate(isoStr) {
    var parts = isoStr.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function addDaysIso(isoStr, days) {
    var d = isoDateToLocalDate(isoStr);
    d.setDate(d.getDate() + days);
    return window.getLocalIsoDate(d);
}

// ----------------------------------------------------------------------
// WEEKDAY MAPPING — mục 6 đề bài: TÁI DÙNG DAY_NUMBER_TO_NAME đã có sẵn (index.html, classic
// script, index theo Date.getDay(): 0=Chủ Nhật..6=Thứ 7) — KHÔNG tạo quy ước mới, KHÔNG dùng
// WEEKDAY_DISPLAY_ORDER của schedule.js (mảng đó chỉ để SẮP XẾP hiển thị, không phải để tính
// ngày<->thứ).
// ----------------------------------------------------------------------
function weekdayNameForIso(isoStr) {
    var d = isoDateToLocalDate(isoStr);
    return window.DAY_NUMBER_TO_NAME[d.getDay()];
}

// ----------------------------------------------------------------------
// IN-FLIGHT GUARD (mục 20/21 đề bài) — 2 lệnh gọi chồng nhau trong CÙNG 1 tab trình duyệt (VD mở
// tab "Buổi học" liên tục nhanh) dùng chung 1 Promise đang chạy, KHÔNG chạy song song 2 lần. Đây
// KHÔNG phải "đã generate rồi thì thôi mãi mãi" (mục 20 đề bài cấm) — chỉ là khoá NGẮN HẠN trong
// lúc request đang bay, KHÔNG lưu theo activeGroupClassId (Test 15: đổi lớp A->B trong lúc A đang
// chạy dở là edge case cực hiếm, chấp nhận đợi lệnh cũ xong rồi lệnh mới tự chạy đúng
// activeGroupClassId TẠI THỜI ĐIỂM NÓ THỰC SỰ QUERY — xem re-check bên dưới).
var generatorInFlightPromise = null;

// ----------------------------------------------------------------------
// CORE — chạy Generator cho activeGroupClassId hiện tại. Trả về result summary object (mục 17
// đề bài), KHÔNG throw ra ngoài (mọi lỗi được bắt và phản ánh qua result.status/result.error).
// ----------------------------------------------------------------------
async function runGroupSessionGeneratorIfNeeded() {
    if (generatorInFlightPromise) return generatorInFlightPromise;

    generatorInFlightPromise = executeGenerator().finally(function() {
        generatorInFlightPromise = null;
    });
    return generatorInFlightPromise;
}

async function executeGenerator() {
    var groupClassId = activeGroupClassId;
    var win = computeGeneratorWindow();

    var result = {
        groupClassId: groupClassId,
        windowStart: win.startIso,
        windowEnd: win.endIso,
        schedulesCount: 0,
        candidatesCount: 0,
        existingCount: 0,
        insertedCount: 0,
        skippedCount: 0,
        status: 'no_schedule',
        error: null
    };

    if (!groupClassId) {
        result.status = 'no_schedule';
        return result;
    }

    // ------------------------------------------------------------------
    // BƯỚC 1: đọc group_class_schedules ĐANG ACTIVE của lớp này (mục 8 đề bài) — CHỈ lấy cột cần
    // thiết. KHÔNG tái dùng cache groupClassSchedules của schedule.js ở đây: cache đó có thể
    // chứa CẢ dòng inactive (dùng để hiển thị khối "Lịch đã tắt") và có thể chưa được tải/đang
    // stale cho đúng activeGroupClassId hiện tại (schedule.js tự quản lý điều kiện tái dùng
    // riêng của nó) — query trực tiếp is_active=true cho gọn, đúng nguyên tắc "1 SELECT lịch, 1
    // SELECT session, 1 batch INSERT" (mục 33 đề bài), tránh phụ thuộc vào trạng thái tải của
    // module khác.
    // ------------------------------------------------------------------
    var scheduleResult;
    try {
        scheduleResult = await supabaseClient
            .from('group_class_schedules')
            .select('id, group_class_id, day_of_week, start_time, duration, start_date, end_date, is_active')
            .eq('group_class_id', groupClassId)
            .eq('is_active', true);
    } catch (err) {
        console.error('[GROUP SESSION GENERATOR] Đọc lịch học hàng tuần EXCEPTION:', err);
        result.status = 'error';
        result.error = 'Lỗi không xác định khi đọc lịch học hàng tuần.';
        return result;
    }

    if (scheduleResult.error) {
        console.error('[GROUP SESSION GENERATOR] Đọc lịch học hàng tuần FAILED:', scheduleResult.error);
        result.status = 'error';
        result.error = window.describeSupabaseError ? window.describeSupabaseError(scheduleResult.error) : String(scheduleResult.error.message || scheduleResult.error);
        return result;
    }

    // Re-check: nếu người dùng đã chuyển sang Group Class khác trong lúc query vừa await, KHÔNG
    // áp dụng kết quả này lên lớp mới — trả về no-op an toàn (cùng nguyên tắc "chỉ áp dụng kết
    // quả nếu vẫn còn đúng lớp lúc bắt đầu gọi" đã dùng ở enrollment.js/session.js).
    if (activeGroupClassId !== groupClassId) {
        result.status = 'no_schedule';
        return result;
    }

    var activeSchedules = scheduleResult.data || [];
    result.schedulesCount = activeSchedules.length;

    if (activeSchedules.length === 0) {
        result.status = 'no_schedule';
        return result;
    }

    // ------------------------------------------------------------------
    // BƯỚC 2: sinh candidate ngày cho từng lịch (mục 9 đề bài) — start = max(window_start,
    // schedule.start_date), end = min(window_end, schedule.end_date || window_end), chỉ giữ ngày
    // đúng day_of_week. So sánh chuỗi ISO "YYYY-MM-DD" hợp lệ vì cùng định dạng cố định
    // (lexicographic = chronological), cùng convention schedule.js.
    // ------------------------------------------------------------------
    var candidates = []; // { group_class_id, scheduled_date, start_time, duration, status, session_type, notes }

    activeSchedules.forEach(function(sch) {
        var effectiveStart = sch.start_date > win.startIso ? sch.start_date : win.startIso;
        var effectiveEnd = win.endIso;
        if (sch.end_date && sch.end_date < effectiveEnd) effectiveEnd = sch.end_date;

        if (effectiveStart > effectiveEnd) return; // khoảng hiệu lực rỗng — bỏ qua lịch này (mục 9)

        var cursor = effectiveStart;
        // Giới hạn vòng lặp an toàn theo đúng độ dài cửa sổ tối đa (84 ngày) — không thể vượt vì
        // effectiveStart/effectiveEnd luôn nằm trong [window_start, window_end].
        var guard = 0;
        while (cursor <= effectiveEnd && guard <= GENERATOR_WINDOW_DAYS) {
            guard++;
            if (weekdayNameForIso(cursor) === sch.day_of_week) {
                candidates.push({
                    group_class_id: groupClassId,
                    scheduled_date: cursor,
                    start_time: sch.start_time,
                    duration: sch.duration,
                    status: 'scheduled',
                    session_type: 'regular',
                    notes: null
                });
            }
            cursor = addDaysIso(cursor, 1);
        }
    });

    result.candidatesCount = candidates.length;

    if (candidates.length === 0) {
        result.status = 'up_to_date';
        return result;
    }

    // ------------------------------------------------------------------
    // BƯỚC 3: pre-query TOÀN BỘ group_sessions hiện có trong cửa sổ (mục 10 đề bài) — KHÔNG lọc
    // session_type/status, vì UNIQUE constraint áp dụng cho MỌI dòng (group_class_id +
    // scheduled_date + start_time), bất kể regular/makeup/scheduled/completed/cancelled.
    // ------------------------------------------------------------------
    var existingResult;
    try {
        existingResult = await supabaseClient
            .from('group_sessions')
            .select('scheduled_date, start_time, session_type, status')
            .eq('group_class_id', groupClassId)
            .gte('scheduled_date', win.startIso)
            .lte('scheduled_date', win.endIso);
    } catch (err) {
        console.error('[GROUP SESSION GENERATOR] Đọc buổi học hiện có EXCEPTION:', err);
        result.status = 'error';
        result.error = 'Lỗi không xác định khi đọc danh sách buổi học hiện có.';
        return result;
    }

    if (existingResult.error) {
        console.error('[GROUP SESSION GENERATOR] Đọc buổi học hiện có FAILED:', existingResult.error);
        result.status = 'error';
        result.error = window.describeSupabaseError ? window.describeSupabaseError(existingResult.error) : String(existingResult.error.message || existingResult.error);
        return result;
    }

    if (activeGroupClassId !== groupClassId) {
        result.status = 'no_schedule';
        return result;
    }

    var existingRows = existingResult.data || [];
    result.existingCount = existingRows.length;

    // Key collision-safe: scheduled_date (ISO cố định) + '|' + start_time cắt về "HH:MM:SS" hoặc
    // "HH:MM" tuỳ DB trả về — chuẩn hoá về 5 ký tự đầu "HH:MM" để so khớp với start_time của
    // candidate (lấy nguyên từ group_class_schedules.start_time, cùng định dạng input <input
    // type="time">, cùng convention buildScheduleRowHtml() của schedule.js).
    function occupiedKey(dateIso, timeStr) {
        return dateIso + '|' + String(timeStr || '').slice(0, 5);
    }

    var occupiedSlots = {};
    existingRows.forEach(function(row) {
        occupiedSlots[occupiedKey(row.scheduled_date, row.start_time)] = true;
    });

    // ------------------------------------------------------------------
    // BƯỚC 4: diff (mục 11 đề bài) — chỉ giữ candidate KHÔNG trùng slot đã tồn tại. KHÔNG update/
    // xoá dòng đã tồn tại dưới bất kỳ hình thức nào.
    // ------------------------------------------------------------------
    var toInsert = candidates.filter(function(c) {
        return !occupiedSlots[occupiedKey(c.scheduled_date, c.start_time)];
    });
    result.skippedCount = candidates.length - toInsert.length;

    if (toInsert.length === 0) {
        result.status = 'up_to_date';
        return result;
    }

    // ------------------------------------------------------------------
    // BƯỚC 5: batch insert 1 lần (mục 14 đề bài) — KHÔNG insert từng dòng. UNIQUE constraint DB
    // là backstop cuối cho race condition (mục 13 đề bài) — nếu có race, PostgREST trả về lỗi
    // uniqueness violation (Postgres code 23505); trường hợp đó KHÔNG phải lỗi Generator thật,
    // coi như "1 lần chạy Generator khác đã tạo session đó rồi" — KHÔNG báo lỗi đáng sợ cho
    // người dùng, chỉ log để theo dõi.
    // ------------------------------------------------------------------
    var insertResult;
    try {
        insertResult = await supabaseClient
            .from('group_sessions')
            .insert(toInsert)
            .select('id');
    } catch (err) {
        console.error('[GROUP SESSION GENERATOR] Tạo buổi học (batch insert) EXCEPTION:', err);
        result.status = 'error';
        result.error = 'Lỗi không xác định khi tạo buổi học.';
        return result;
    }

    if (insertResult.error) {
        // Mục 13: uniqueness violation (23505) do race condition giữa 2 lần chạy Generator gần
        // như đồng thời -> KHÔNG coi là lỗi thật. Mọi lỗi khác (network/RLS/permission/...) vẫn
        // phải báo lỗi thật (mục 16 đề bài: "Do not swallow real database errors silently").
        if (insertResult.error.code === '23505') {
            console.warn('[GROUP SESSION GENERATOR] Uniqueness collision (race condition) khi insert — coi như buổi học đã được tạo bởi lần chạy khác:', insertResult.error);
            result.status = 'generated';
            result.insertedCount = 0; // không rõ chính xác bao nhiêu dòng đã lọt qua trước khi va constraint — an toàn báo 0, KHÔNG suy đoán
            return result;
        }
        console.error('[GROUP SESSION GENERATOR] Tạo buổi học (batch insert) FAILED:', insertResult.error);
        result.status = 'error';
        result.error = window.describeSupabaseError ? window.describeSupabaseError(insertResult.error) : String(insertResult.error.message || insertResult.error);
        return result;
    }

    result.insertedCount = (insertResult.data || []).length;
    result.status = 'generated';
    return result;
}

// ----------------------------------------------------------------------
// MANUAL FALLBACK (mục 29 đề bài) — nút phụ trong tab "Buổi học", gọi Generator + refresh danh
// sách buổi học đã có (session.js) nếu cần + hiện kết quả gọn qua showToast. KHÔNG redesign UI,
// KHÔNG thêm card lớn.
// ----------------------------------------------------------------------
async function runGroupSessionGeneratorManually(btnEl) {
    var origText = btnEl ? btnEl.innerText : null;
    if (btnEl) { btnEl.disabled = true; btnEl.innerText = 'Đang tạo...'; }

    try {
        var result = await runGroupSessionGeneratorIfNeeded();
        reportGeneratorResultToast(result);

        // Refresh danh sách buổi học hiện có (session.js) nếu có session mới được tạo — dùng lại
        // cơ chế load hiện có, KHÔNG tạo cache thứ hai (mục 23 đề bài).
        if (result.insertedCount > 0 && typeof window.loadGroupSessions === 'function') {
            await window.loadGroupSessions();
        }
    } finally {
        if (btnEl) { btnEl.disabled = false; btnEl.innerText = origText; }
    }
}

// Hiện kết quả gọn qua showToast — KHÔNG hiện toast nếu no_schedule/up_to_date với 0 thay đổi lúc
// chạy TỰ ĐỘNG (tab mở lại nhiều lần không nên làm phiền người dùng bằng toast liên tục — mục 20
// đề bài "repeated tab open phải an toàn", không nói phải luôn thông báo); nút thủ công (mục 29)
// thì LUÔN hiện kết quả vì người dùng chủ động bấm, cần phản hồi.
function reportGeneratorResultToast(result) {
    if (result.status === 'error') {
        window.showToast('⚠️', 'Không thể tạo buổi học tự động', result.error || 'Lỗi không xác định.');
        return;
    }
    if (result.insertedCount > 0) {
        window.showToast('✅', 'Đã tạo buổi học sắp tới', result.insertedCount + ' buổi học mới đã được thêm.');
        return;
    }
    window.showToast('ℹ️', 'Buổi học đã được cập nhật đầy đủ', 'Không có buổi học mới nào cần tạo thêm.');
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention group-class.js/enrollment.js/session.js/
// schedule.js mục "HTML COMPATIBILITY") — chỉ export những entry point thực sự cần: (a) để
// group-class.js gọi qua window.runGroupSessionGeneratorIfNeeded trong switchGroupClassTab(),
// (b) để onclick="..." của nút fallback thủ công trong HTML gọi được.
// ============================================================================
export { runGroupSessionGeneratorIfNeeded, runGroupSessionGeneratorManually };

window.runGroupSessionGeneratorIfNeeded = runGroupSessionGeneratorIfNeeded;
window.runGroupSessionGeneratorManually = runGroupSessionGeneratorManually;
