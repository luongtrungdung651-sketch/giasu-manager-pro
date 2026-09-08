// ============================================================================
// js/group-class/schedule.js  —  STEP 11G-B2-A: RECURRING GROUP CLASS SCHEDULE CRUD
// ============================================================================
// Đây là ES module thật (cùng convention js/group-class/group-class.js/enrollment.js/
// session.js — xem comment trong index.html tại vị trí nạp module này). Module này tự expose
// các hàm cần thiết qua window ở cuối file để (a) onclick="..." trong HTML gọi được, và (b)
// group-class.js (switchGroupClassTab) gọi lại qua window.loadGroupClassSchedulesIfNeeded.
//
// DEPENDENCY: module này ĐỌC các global do script chính/state.js/group-class.js định nghĩa
// (activeGroupClassId, groupClassList, supabaseClient, escapeHtml, showToast,
// describeSupabaseError, getLocalIsoDate). Module này KHÔNG import group-class.js (tránh
// circular dependency — group-class.js gọi ngược lại module này qua window.* trong
// switchGroupClassTab(), cùng lý do enrollment.js/session.js không import group-class.js) và
// KHÔNG import enrollment.js/session.js (các module ngang hàng, không phụ thuộc lẫn nhau). Cùng
// lý do defer/module với các module khác: module bị hoãn, chạy SAU khi script chính đã chạy
// xong, và group-class.js LUÔN load TRƯỚC module này (xem thứ tự <script type="module"> trong
// index.html) nên tại thời điểm các hàm dưới đây THỰC SỰ được gọi (người dùng mở tab "Buổi
// học"/bấm nút), mọi global trên đã tồn tại.
//
// PHẠM VI STEP 11G-B2-A (CHỈ ĐÚNG NHỮNG GÌ LIỆT KÊ, KHÔNG HƠN):
//   1. Recurring Weekly Schedule List (public.group_class_schedules) — tách active/inactive.
//   2. Create (INSERT 1 dòng mới).
//   3. Edit = VERSIONING (đóng dòng cũ + tạo dòng mới), KHÔNG overwrite.
//   4. Deactivate (UPDATE is_active=false), KHÔNG DELETE.
//
// CHỦ Ý KHÔNG CÓ Ở STEP NÀY (để dành cho step sau — KHÔNG code ở đây dù chỉ 1 dòng):
//   - 12-week Rolling Window Generator / tạo group_sessions.
//   - Cron job / scheduled job.
//   - Calendar integration.
//   - Attendance / Billing.
//   - Reactivation của lịch đã tắt.
//   - Unique/duplicate constraint hoặc RPC/migration mới.
//
// NO HARD DELETE: bảng group_class_schedules không có DELETE policy/privilege nào (xem STEP
// 11G-B1 §7/§9 — RLS default-deny + không GRANT DELETE cho authenticated). Module này TUYỆT ĐỐI
// KHÔNG được viết bất kỳ hàm nào gọi supabaseClient.from('group_class_schedules').delete(...).
// "Tắt" (deactivate) là hành động DUY NHẤT để loại bỏ hiệu lực của 1 dòng.
// ============================================================================

// ----------------------------------------------------------------------
// STATE (chỉ dùng trong module này — cùng convention gcSessionListCache/
// gcSessionListLoadedForClassId của session.js: cache CONTEXT-AWARE theo activeGroupClassId,
// KHÔNG dùng boolean trần kiểu "loaded = true" — tránh tái tạo bug hiển thị nhầm cache của lớp
// trước đó khi chuyển Group Class A -> B, hoặc Admin chuyển Tutor A -> B).
// ----------------------------------------------------------------------
var groupClassSchedules = [];
var groupClassSchedulesLoadedForGroupClassId = null;

// Guard chống double-submit — cùng pattern addGroupSessionInFlight (session.js),
// addEnrollmentInFlight (enrollment.js).
var addScheduleInFlight = false;
var editScheduleInFlight = false;
var deactivateScheduleInFlight = false;

// Dòng đang được sửa (versioning) — lưu nguyên object từ cache để submitEditSchedule() có đủ
// start_date/end_date gốc (S/E) phục vụ validate hiệu lực ngày áp dụng (mục 12 đề bài).
var editingScheduleRow = null;

// Thứ tự hiển thị hợp lý (mục 6 đề bài: "KHÔNG dựa vào sắp xếp alphabet chuỗi tiếng Việt") — tái
// dùng ĐÚNG quy ước 7 giá trị "Thứ 2".."Chủ Nhật" đã có sẵn trong index.html (dropdown
// public.student_schedules, dayOptions ở luồng sửa lịch cố định) — KHÔNG tạo quy ước mới.
var WEEKDAY_DISPLAY_ORDER = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

function weekdaySortIndex(day) {
    var idx = WEEKDAY_DISPLAY_ORDER.indexOf(day);
    return idx === -1 ? WEEKDAY_DISPLAY_ORDER.length : idx; // giá trị lạ (nếu có) rơi xuống cuối, không vỡ sort
}

// So sánh theo mục 6: day_of_week (thứ tự tuần) -> start_time -> start_date.
function compareSchedules(a, b) {
    var dayDiff = weekdaySortIndex(a.day_of_week) - weekdaySortIndex(b.day_of_week);
    if (dayDiff !== 0) return dayDiff;
    var timeA = String(a.start_time || '');
    var timeB = String(b.start_time || '');
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;
    var dateA = String(a.start_date || '');
    var dateB = String(b.start_date || '');
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    return 0;
}

// ----------------------------------------------------------------------
// DATE HELPERS — chỉ dùng string ISO "YYYY-MM-DD" (so sánh lexicographic = so sánh thời gian,
// đúng vì cùng định dạng cố định) + Date cục bộ (KHÔNG dùng UTC) để cộng/trừ ngày, cùng cách
// getLocalIsoDate() (js/core/utils.js) đang dùng cho toàn app — KHÔNG tạo timezone logic mới.
// ----------------------------------------------------------------------
function isoDateMinusOneDay(isoStr) {
    var parts = isoStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() - 1);
    return getLocalIsoDate(d);
}

// Hiển thị "dd/mm/yyyy" đơn giản cho start_date/end_date (KHÔNG dùng formatDate() của utils.js
// vì hàm đó thêm tiền tố thứ trong tuần "T2 01/09/2026" — ở đây mỗi dòng ĐÃ hiển thị Thứ riêng,
// lặp lại sẽ dư thừa/rối, đúng mockup mục 5 đề bài chỉ có "Từ 01/09/2026").
function formatScheduleDate(isoStr) {
    if (!isoStr) return '—';
    var parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

// ----------------------------------------------------------------------
// LOAD (context-aware theo activeGroupClassId) + RENDER SECTION "LỊCH HỌC HÀNG TUẦN"
// ----------------------------------------------------------------------
// Được gọi từ switchGroupClassTab('sessions') (group-class.js) mỗi lần vào tab. Chỉ tái dùng
// cache khi cache đó THỰC SỰ thuộc về activeGroupClassId hiện tại — nếu vừa chuyển Group Class A
// -> B (activeGroupClassId đổi), điều kiện tự động false và bắt buộc query lại Supabase cho đúng
// lớp mới, KHÔNG bao giờ render nhầm cache của lớp trước đó (mục 23-F/G, mục 24 test 17-20).
async function loadGroupClassSchedulesIfNeeded() {
    if (groupClassSchedulesLoadedForGroupClassId === activeGroupClassId) {
        renderGroupClassSchedules();
        return;
    }
    await loadGroupClassSchedules();
}

async function loadGroupClassSchedules() {
    var activeContainer = document.getElementById('gc-schedule-active-list');
    if (!activeGroupClassId) return;

    if (activeContainer) {
        activeContainer.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:20px; font-size:14px;">⏳ Đang tải lịch học hàng tuần...</div>';
    }

    try {
        // group_class_id = activeGroupClassId đã tự động chỉ trả về đúng lớp thuộc tutor đang
        // active (RLS Tutor scope qua group_classes -> tutors chain, cùng convention
        // loadEnrollments()/loadGroupSessions()) — không cần lọc lại tutor_id ở đây.
        var result = await supabaseClient
            .from('group_class_schedules')
            .select('id, group_class_id, day_of_week, start_time, duration, start_date, end_date, is_active, created_at')
            .eq('group_class_id', activeGroupClassId);

        if (result.error) {
            console.error('[GROUP SCHEDULE] Tải lịch học hàng tuần FAILED:', result.error);
            if (activeContainer) {
                activeContainer.innerHTML = '<div style="color:#ef4444; text-align:center; padding:20px; font-size:14px;">⚠️ Không tải được lịch học hàng tuần.<br>' + escapeHtml(describeSupabaseError(result.error)) + '</div>';
            }
            var inactiveWrapperErr = document.getElementById('gc-schedule-inactive-wrapper');
            if (inactiveWrapperErr) inactiveWrapperErr.style.display = 'none';
            return;
        }

        // Sắp xếp CLIENT-SIDE ngay sau khi tải — mục 6 đề bài: KHÔNG dựa vào order() của
        // PostgREST trên cột day_of_week (chuỗi tiếng Việt, order alphabet sai quy tắc tuần).
        groupClassSchedules = (result.data || []).slice().sort(compareSchedules);
        groupClassSchedulesLoadedForGroupClassId = activeGroupClassId;
        renderGroupClassSchedules();
    } catch (err) {
        console.error('[GROUP SCHEDULE] Tải lịch học hàng tuần EXCEPTION:', err);
        if (activeContainer) {
            activeContainer.innerHTML = '<div style="color:#ef4444; text-align:center; padding:20px; font-size:14px;">⚠️ Lỗi không xác định khi tải lịch học hàng tuần.</div>';
        }
    }
}

function buildScheduleRowHtml(row, isActive) {
    var idJs = "'" + String(row.id).replace(/'/g, "\\'") + "'";
    var endDateLabel = row.end_date ? formatScheduleDate(row.end_date) : 'Không giới hạn';

    var actionsHtml = '';
    if (isActive) {
        actionsHtml =
            '<div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">' +
                '<button class="btn-secondary" style="padding:6px 11px; font-size:11.5px;" onclick="openEditScheduleModal(' + idJs + ')">Sửa</button>' +
                '<button class="btn-secondary" style="padding:6px 11px; font-size:11.5px;" onclick="deactivateSchedule(' + idJs + ', this)">Tắt</button>' +
            '</div>';
    }

    return (
        '<div class="sp-card-mini" style="margin-bottom:8px; padding:10px 12px;' + (isActive ? '' : ' opacity:0.65;') + '">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">' +
                '<div style="font-size:13.5px; color:var(--text-main);">' +
                    '<strong>' + escapeHtml(row.day_of_week) + '</strong> · ' + escapeHtml(String(row.start_time || '').slice(0, 5)) + ' · ' + Number(row.duration) + ' phút' +
                    '<div style="color:var(--text-sub); font-size:12px; margin-top:2px;">Từ ' + formatScheduleDate(row.start_date) + ' · ' + escapeHtml(endDateLabel) + '</div>' +
                '</div>' +
                actionsHtml +
            '</div>' +
        '</div>'
    );
}

function renderGroupClassSchedules() {
    var activeContainer = document.getElementById('gc-schedule-active-list');
    var inactiveWrapper = document.getElementById('gc-schedule-inactive-wrapper');
    var inactiveContainer = document.getElementById('gc-schedule-inactive-list');
    if (!activeContainer) return;

    // Mục 6 đề bài: TÁCH riêng active/inactive — mặc định NHẤN MẠNH active, inactive gom vào
    // khối thu gọn "Lịch đã tắt" (KHÔNG xoá, chỉ ẩn bớt — dùng <details>/<summary> có sẵn của
    // trình duyệt, KHÔNG cần thêm state/JS toggle riêng).
    var activeRows = groupClassSchedules.filter(function(r) { return r.is_active; });
    var inactiveRows = groupClassSchedules.filter(function(r) { return !r.is_active; });

    if (activeRows.length === 0) {
        activeContainer.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:20px; font-size:13.5px;">Chưa có lịch học hàng tuần nào.<br><button type="button" class="btn-primary" style="margin-top:12px; padding:8px 16px; font-size:12.5px;" onclick="openCreateScheduleModal()">+ Thêm lịch học</button></div>';
    } else {
        activeContainer.innerHTML = activeRows.map(function(r) { return buildScheduleRowHtml(r, true); }).join('');
    }

    if (inactiveWrapper && inactiveContainer) {
        if (inactiveRows.length === 0) {
            inactiveWrapper.style.display = 'none';
            inactiveContainer.innerHTML = '';
        } else {
            inactiveWrapper.style.display = 'block';
            inactiveContainer.innerHTML = inactiveRows.map(function(r) { return buildScheduleRowHtml(r, false); }).join('');
        }
    }
}

// ----------------------------------------------------------------------
// FORM VALIDATION DÙNG CHUNG (Create + phần "lịch mới" của Edit) — mục 8/12 đề bài. Trả về
// { ok: true, values } hoặc { ok: false, message }. Vietnamese message theo mục 8.
// ----------------------------------------------------------------------
function validateScheduleFormFields(day, startTime, durationRaw, startDate, endDate) {
    if (!day) return { ok: false, message: 'Vui lòng chọn Thứ.' };
    if (WEEKDAY_DISPLAY_ORDER.indexOf(day) === -1) return { ok: false, message: 'Thứ không hợp lệ.' };
    if (!startTime) return { ok: false, message: 'Vui lòng chọn Giờ bắt đầu.' };

    var duration = parseFloat(durationRaw);
    if (!durationRaw || isNaN(duration) || duration <= 0) {
        return { ok: false, message: 'Thời lượng phải lớn hơn 0.' };
    }

    if (!startDate) return { ok: false, message: 'Vui lòng chọn Ngày bắt đầu áp dụng.' };

    if (endDate && endDate < startDate) {
        return { ok: false, message: 'Ngày kết thúc phải sau hoặc bằng Ngày bắt đầu áp dụng.' };
    }

    return {
        ok: true,
        values: {
            day_of_week: day,
            start_time: startTime,
            duration: duration,
            start_date: startDate,
            end_date: endDate || null
        }
    };
}

// ----------------------------------------------------------------------
// CREATE MODAL (mục 7/8/9 đề bài)
// ----------------------------------------------------------------------
function openCreateScheduleModal() {
    if (!activeGroupClassId) return;

    var gc = (groupClassList || []).find(function(x) { return x.id === activeGroupClassId; });
    var nameEl = document.getElementById('acsch-group-class-name');
    if (nameEl) nameEl.innerText = gc ? gc.name : '';

    document.getElementById('acsch-day').value = '';
    document.getElementById('acsch-start-time').value = '';
    document.getElementById('acsch-duration').value = '';
    document.getElementById('acsch-start-date').value = '';
    document.getElementById('acsch-end-date').value = '';

    var errBox = document.getElementById('add-group-schedule-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    document.getElementById('add-group-schedule-modal').classList.add('open');
}

function closeCreateScheduleModal() {
    var modal = document.getElementById('add-group-schedule-modal');
    if (modal) modal.classList.remove('open');
}

async function submitCreateSchedule() {
    if (!activeGroupClassId) return;

    var errBox = document.getElementById('add-group-schedule-error');
    function showModalError(msg) {
        if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
        else { alert(msg); }
    }

    var day = document.getElementById('acsch-day').value;
    var startTime = document.getElementById('acsch-start-time').value;
    var durationRaw = document.getElementById('acsch-duration').value;
    var startDate = document.getElementById('acsch-start-date').value;
    var endDate = document.getElementById('acsch-end-date').value;

    // Mục 8: validate client-side — DB constraint (duration > 0, end_date >= start_date) vẫn là
    // tuyến bảo vệ cuối cùng, KHÔNG chỉ dựa vào validate ở đây.
    var validation = validateScheduleFormFields(day, startTime, durationRaw, startDate, endDate);
    if (!validation.ok) { showModalError(validation.message); return; }

    // Mục 9: guard chống double-submit — cùng pattern addGroupSessionInFlight (session.js).
    if (addScheduleInFlight) return;
    addScheduleInFlight = true;
    var confirmBtn = document.getElementById('confirm-add-group-schedule-btn');
    var confirmBtnOrigText = confirmBtn ? confirmBtn.innerText : null;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = 'Đang lưu...'; }

    try {
        // Mục 9: CHỈ insert các cột được liệt kê — KHÔNG gửi id/is_active/created_at (system-
        // controlled, dùng DEFAULT của DB, cùng convention submitCreateSession() không tự gửi
        // status='scheduled').
        var insertResult = await supabaseClient
            .from('group_class_schedules')
            .insert({
                group_class_id: activeGroupClassId,
                day_of_week: validation.values.day_of_week,
                start_time: validation.values.start_time,
                duration: validation.values.duration,
                start_date: validation.values.start_date,
                end_date: validation.values.end_date
            })
            .select()
            .single();

        if (insertResult.error || !insertResult.data) {
            console.error('[GROUP SCHEDULE] Tạo lịch học hàng tuần FAILED:', insertResult.error);
            showModalError('⚠️ Không thể tạo lịch học: ' + (insertResult.error ? describeSupabaseError(insertResult.error) : 'không nhận được dữ liệu trả về'));
            return; // Mục 9: KHÔNG đóng modal, giữ input để retry, KHÔNG hiển thị false success.
        }

        showToast('✅', 'Đã thêm lịch học hàng tuần', validation.values.day_of_week + ' ' + validation.values.start_time.slice(0, 5));
        closeCreateScheduleModal();
        await loadGroupClassSchedules(); // refresh từ Supabase, KHÔNG tự suy luận thêm vào cache.
    } catch (err) {
        console.error('[GROUP SCHEDULE] Tạo lịch học hàng tuần EXCEPTION:', err);
        showModalError('⚠️ Lỗi không xác định khi tạo lịch học.');
    } finally {
        addScheduleInFlight = false;
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = confirmBtnOrigText; }
    }
}

// ----------------------------------------------------------------------
// EDIT = VERSIONING (mục 10/11/12/13/14 đề bài) — KHÔNG overwrite dòng cũ.
// ----------------------------------------------------------------------
function openEditScheduleModal(scheduleId) {
    var row = groupClassSchedules.find(function(r) { return r.id === scheduleId && r.is_active; });
    if (!row) return; // chỉ sửa được dòng đang active (dòng inactive là lịch sử, KHÔNG có nút Sửa trên UI)

    editingScheduleRow = row;

    document.getElementById('esch-day').value = row.day_of_week;
    document.getElementById('esch-start-time').value = String(row.start_time || '').slice(0, 5);
    document.getElementById('esch-duration').value = Number(row.duration);
    document.getElementById('esch-end-date').value = row.end_date || '';
    // Mục 11: TUYỆT ĐỐI không tự điền "Ngày áp dụng thay đổi" bằng ngày hôm nay — bỏ trống, bắt
    // buộc người dùng tự chọn.
    document.getElementById('esch-effective-date').value = '';

    var errBox = document.getElementById('edit-group-schedule-error');
    if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }

    document.getElementById('edit-group-schedule-modal').classList.add('open');
}

function closeEditScheduleModal() {
    var modal = document.getElementById('edit-group-schedule-modal');
    if (modal) modal.classList.remove('open');
    editingScheduleRow = null;
}

async function submitEditSchedule() {
    if (!activeGroupClassId || !editingScheduleRow) return;

    var errBox = document.getElementById('edit-group-schedule-error');
    function showModalError(msg) {
        if (errBox) { errBox.innerText = msg; errBox.style.display = 'block'; }
        else { alert(msg); }
    }

    var old = editingScheduleRow;
    var day = document.getElementById('esch-day').value;
    var startTime = document.getElementById('esch-start-time').value;
    var durationRaw = document.getElementById('esch-duration').value;
    var newEndDate = document.getElementById('esch-end-date').value;
    var effectiveDate = document.getElementById('esch-effective-date').value;

    // start_date của dòng MỚI = effectiveDate — validate các field còn lại dùng chung hàm với
    // Create (mục 12: "new schedule must then begin at D").
    var validation = validateScheduleFormFields(day, startTime, durationRaw, effectiveDate, newEndDate);
    if (!validation.ok) { showModalError(validation.message); return; }

    // Mục 12/14: validate hiệu lực ngày áp dụng D so với dòng cũ (S = old.start_date, E =
    // old.end_date). So sánh string ISO "YYYY-MM-DD" hợp lệ vì cùng định dạng cố định (lexicographic
    // = chronological).
    var S = old.start_date;
    var E = old.end_date;
    var D = effectiveDate;

    if (!(D > S)) {
        // Mục 14: trường hợp đặc biệt D === S (hoặc D < S) bị từ chối — versioning bắt buộc
        // ngày áp dụng SAU ngày bắt đầu gốc.
        showModalError('Ngày áp dụng thay đổi phải SAU ngày bắt đầu hiện tại của lịch học (' + formatScheduleDate(S) + '). Nếu muốn đổi ngay từ ngày bắt đầu gốc, đây không phải là sửa phiên bản thông thường và không được hỗ trợ ở màn hình này.');
        return;
    }
    if (E && D > E) {
        showModalError('Ngày áp dụng thay đổi phải nằm trong khoảng hiệu lực của lịch học hiện tại (không sau ' + formatScheduleDate(E) + ').');
        return;
    }

    // Mục 13: guard chống double-submit.
    if (editScheduleInFlight) return;
    editScheduleInFlight = true;
    var confirmBtn = document.getElementById('confirm-edit-group-schedule-btn');
    var confirmBtnOrigText = confirmBtn ? confirmBtn.innerText : null;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = 'Đang lưu...'; }

    try {
        // BƯỚC 1: đóng dòng cũ — end_date = D - 1 ngày, is_active = false (mục 10/12).
        var closeOldResult = await supabaseClient
            .from('group_class_schedules')
            .update({ end_date: isoDateMinusOneDay(D), is_active: false })
            .eq('id', old.id)
            .select()
            .single();

        if (closeOldResult.error || !closeOldResult.data) {
            console.error('[GROUP SCHEDULE] Đóng lịch cũ (versioning bước 1) FAILED:', closeOldResult.error);
            // Mục 13: bước 1 thất bại -> KHÔNG được thực hiện bước 2, KHÔNG có gì bị sửa đổi.
            showModalError('⚠️ Không thể cập nhật lịch học: ' + (closeOldResult.error ? describeSupabaseError(closeOldResult.error) : 'không nhận được dữ liệu trả về'));
            return;
        }

        // BƯỚC 2: tạo dòng mới (mục 10) — bắt đầu từ D, is_active mặc định true (DEFAULT của DB,
        // cùng convention không tự gửi is_active ở submitCreateSchedule()).
        var createNewResult = await supabaseClient
            .from('group_class_schedules')
            .insert({
                group_class_id: activeGroupClassId,
                day_of_week: validation.values.day_of_week,
                start_time: validation.values.start_time,
                duration: validation.values.duration,
                start_date: D,
                end_date: validation.values.end_date
            })
            .select()
            .single();

        if (createNewResult.error || !createNewResult.data) {
            console.error('[GROUP SCHEDULE] Tạo lịch mới (versioning bước 2) FAILED:', createNewResult.error);
            // Mục 13: bước 1 ĐÃ THÀNH CÔNG (dòng cũ đã đóng) nhưng bước 2 FAIL — KHÔNG được báo
            // thành công, KHÔNG được âm thầm che giấu trạng thái nửa vời. Reload từ database để
            // UI phản ánh ĐÚNG trạng thái thật hiện tại (dòng cũ đã inactive, chưa có dòng mới).
            showModalError('⚠️ Đã đóng lịch cũ nhưng KHÔNG tạo được lịch mới: ' + (createNewResult.error ? describeSupabaseError(createNewResult.error) : 'không nhận được dữ liệu trả về') + '\nVui lòng thử "Sửa" lại lịch vừa bị đóng đã trở thành lịch sử — hiện chưa có lịch nào active thay thế. Tải lại danh sách để kiểm tra trạng thái mới nhất.');
            closeEditScheduleModal();
            await loadGroupClassSchedules(); // KHÔNG giữ modal mở với editingScheduleRow trỏ vào dòng đã đóng.
            return;
        }

        showToast('✅', 'Đã tạo phiên bản lịch học mới', validation.values.day_of_week + ' ' + validation.values.start_time.slice(0, 5) + ' từ ' + formatScheduleDate(D));
        closeEditScheduleModal();
        await loadGroupClassSchedules(); // refresh từ Supabase — KHÔNG tự suy luận thêm vào cache.
    } catch (err) {
        console.error('[GROUP SCHEDULE] Sửa lịch học (versioning) EXCEPTION:', err);
        showModalError('⚠️ Lỗi không xác định khi sửa lịch học. Vui lòng tải lại danh sách để kiểm tra trạng thái hiện tại trước khi thử lại.');
        // Không rõ bước nào đã chạy tới đâu khi exception xảy ra (vd. lỗi mạng giữa 2 request) —
        // reload để phản ánh trạng thái THẬT từ database thay vì đoán, cùng nguyên tắc mục 13.
        await loadGroupClassSchedules();
    } finally {
        editScheduleInFlight = false;
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = confirmBtnOrigText; }
    }
}

// ----------------------------------------------------------------------
// DEACTIVATE (mục 15 đề bài) — UPDATE is_active=false, KHÔNG DELETE, KHÔNG đụng group_sessions/
// attendance/lessons/students/enrollments.
// ----------------------------------------------------------------------
async function deactivateSchedule(scheduleId, btnEl) {
    // Guard chống double-submit — confirm() chặn double-click TRONG lúc dialog đang mở, nhưng
    // không chặn click thứ 2 SAU khi đã bấm OK trong lúc UPDATE đang await (cùng lý do
    // leaveEnrollmentInFlight ở enrollment.js).
    if (deactivateScheduleInFlight) return;
    if (!confirm('Bạn có chắc muốn tắt lịch học hàng tuần này?')) return;

    deactivateScheduleInFlight = true;
    var origText = btnEl ? btnEl.innerText : null;
    if (btnEl) { btnEl.disabled = true; btnEl.innerText = 'Đang cập nhật...'; }

    try {
        var updResult = await supabaseClient
            .from('group_class_schedules')
            .update({ is_active: false })
            .eq('id', scheduleId)
            .select()
            .single();

        if (updResult.error || !updResult.data) {
            console.error('[GROUP SCHEDULE] Tắt lịch học FAILED:', updResult.error);
            showToast('⚠️', 'Không thể tắt lịch học', updResult.error ? describeSupabaseError(updResult.error) : 'không nhận được dữ liệu trả về');
            return;
        }

        showToast('✅', 'Đã tắt lịch học hàng tuần', '');
        await loadGroupClassSchedules(); // refresh — dòng chuyển sang khối "Lịch đã tắt", KHÔNG biến mất khỏi UI.
    } catch (err) {
        console.error('[GROUP SCHEDULE] Tắt lịch học EXCEPTION:', err);
        showToast('⚠️', 'Lỗi không xác định', 'Vui lòng thử lại.');
    } finally {
        deactivateScheduleInFlight = false;
        // btnEl có thể đã bị gỡ khỏi DOM do loadGroupClassSchedules() vừa render lại toàn bộ
        // container — gán lại thuộc tính lên 1 node đã detach vô hại.
        if (btnEl) { btnEl.disabled = false; btnEl.innerText = origText; }
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (cùng convention group-class.js/enrollment.js/session.js mục
// "HTML COMPATIBILITY") — chỉ export những entry point thực sự cần cho onclick trong HTML hoặc
// để group-class.js gọi lại (loadGroupClassSchedulesIfNeeded).
// ============================================================================
export {
    loadGroupClassSchedulesIfNeeded, loadGroupClassSchedules, renderGroupClassSchedules,
    openCreateScheduleModal, closeCreateScheduleModal, submitCreateSchedule,
    openEditScheduleModal, closeEditScheduleModal, submitEditSchedule,
    deactivateSchedule
};

window.loadGroupClassSchedulesIfNeeded = loadGroupClassSchedulesIfNeeded;
window.openCreateScheduleModal = openCreateScheduleModal;
window.closeCreateScheduleModal = closeCreateScheduleModal;
window.submitCreateSchedule = submitCreateSchedule;
window.openEditScheduleModal = openEditScheduleModal;
window.closeEditScheduleModal = closeEditScheduleModal;
window.submitEditSchedule = submitEditSchedule;
window.deactivateSchedule = deactivateSchedule;
