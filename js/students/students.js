// ============================================================================
// js/students/students.js  —  STEP 7C: STUDENTS MODULE
// ============================================================================
// Tách nguyên vẹn phần logic THUẦN STUDENTS: danh sách / tìm kiếm / filter /
// thêm / sửa / xóa học sinh (list, search, filter, add, edit, delete).
//
// KHÔNG đổi behavior. KHÔNG đổi database/Supabase call. KHÔNG đổi CSS.
// Các hàm "lai" (đụng cả Lessons/Finance/Reports như renderProfileDetails,
// computeStudentStats, refreshFinanceDashboardIfOpen...) CHỦ Ý ĐỂ LẠI trong
// script chính theo quyết định của Tutor — KHÔNG di chuyển sang đây.
//
// Đây là ES module thật (export/import), giống pattern của js/core/*.js
// (STEP 7B): file này tự expose các hàm cần thiết qua window ở cuối file để
// (a) các onclick="..."/onchange="..." trong HTML tiếp tục gọi được, và
// (b) script chính (classic script) tiếp tục gọi các hàm này như global bình
// thường, đúng như trước khi tách.
//
// DEPENDENCY: module này ĐỌC các global do script chính định nghĩa (classList,
// activeTutorId, activeProfileClassId, supabaseClient, SCHEDULE_FIELDS,
// showToast, saveData, renderTimeSlots, updateTimeSelectOptions,
// refreshAdminDashboardStats, escapeHtml, getSelectedDays,
// checkScheduleConflict, acShowConflictWarning, acFloatToTimeStr,
// timeToFloat, switchTutorPage, getSessionsInMonth, computeBillingStats,
// getPeriodTotalPaid, computePeriodStatus, describeSupabaseError,
// refreshFinanceDashboardIfOpen, refreshReportsPageIfOpen, renderTodaysWork,
// openProfilePage). Module này KHÔNG import những thứ đó (core KHÔNG được
// phụ thuộc Students, và các hàm này không phải core) — vì module chạy SAU
// khi script chính (classic <script>) đã chạy xong (module bị hoãn/defer,
// classic script chạy ngay khi parser gặp), nên tại thời điểm các hàm bên
// dưới THỰC SỰ được gọi (do người dùng bấm nút, không phải lúc module vừa
// load), toàn bộ các global trên chắc chắn đã tồn tại trên window.
// ============================================================================

// ----------------------------------------------------------------------
// SOURCE OF TRUTH state của riêng Students (chỉ dùng trong module này,
// không có bản sao nào khác trong toàn bộ project trước khi tách).
// ----------------------------------------------------------------------
var tutorStudentSearchState = { query: '', subject: 'all', status: 'all', finance: 'all' };

var editingClassId = null;
var ecSelectedTimes = [];

// STEP 9A — guard chống double-click gây duplicate insert/delete/update. Cùng pattern
// avatarUploadInFlight (index.html) / disable nút ở doLogin/doRegister/change password —
// KHÔNG đổi UI flow, KHÔNG đổi DB, KHÔNG thêm unique constraint, chỉ chặn gọi trùng ở
// tầng client trong lúc request Supabase trước đó CHƯA xong.
var addClassInFlight = false;
var removeClassInFlight = false;
var saveEditClassInFlight = false;

// ----------------------------------------------------------------------
// TẠO STUDENT RECORD (STEP 11F-B — tách reusable primitive, CHUẨN BỊ cho STEP 11F-C)
// ----------------------------------------------------------------------
// Tách NGUYÊN VẸN phần INSERT public.students ra khỏi addNewClassActual() bên dưới — CHỈ tạo
// record trong students, KHÔNG tạo student_schedules (khác addNewClassActual(), hàm đó vẫn tự
// làm tiếp bước tạo student_schedules ngay sau khi gọi hàm này — KHÔNG đổi thứ tự/behavior 1-to-1
// hiện tại). tutor_id LUÔN lấy từ activeTutorId (biến global, không nhận qua tham số) — cùng
// convention addNewClassActual()/addNewGroupClass() (group-class.js): KHÔNG bao giờ lấy tutor_id
// từ input tự do.
//
// STEP 11F-C mới là nơi GỌI hàm này từ Group Class Enrollment (flow "Tạo học viên mới" trong
// Group Class). STEP 11F-B (Enrollment CHỈ Existing Student) CHỦ Ý CHƯA gọi hàm này ở bất kỳ đâu
// ngoài addNewClassActual() — xem "DO NOT IMPLEMENT CASE B" trong js/group-class/enrollment.js.
//
// STEP 11F-C-FIX-2: parentName/parentPhone là 2 tham số MỚI, TÙY CHỌN (map tới 2 cột CÓ SẴN trên
// public.students — parent_name/parent_phone, đã dùng ở nhiều nơi khác trong app: Settings "Thông
// tin học sinh" ở index.html, Search+Filter, students.js — KHÔNG phải cột mới). Cố ý dùng
// `!== undefined` (KHÔNG phải `if (parentName)`) để chỉ đưa key vào payload khi caller THỰC SỰ
// truyền tham số này — addNewClassActual() (1-to-1, gọi hàm này với đúng 3 tham số cũ) vì vậy
// hoàn toàn KHÔNG bị ảnh hưởng: payload INSERT của nó giữ nguyên y hệt trước đây (không có
// parent_name/parent_phone trong object gửi lên Supabase).
async function createStudentRecord(name, subject, rate, parentName, parentPhone) {
    var payload = { tutor_id: activeTutorId, name: name, subject: subject, rate: rate };
    if (parentName !== undefined) payload.parent_name = parentName || null;
    if (parentPhone !== undefined) payload.parent_phone = parentPhone || null;
    return await supabaseClient
        .from('students')
        .insert(payload)
        .select()
        .single();
}

// ----------------------------------------------------------------------
// THÊM HỌC SINH
// ----------------------------------------------------------------------
// Hàm THÊM HỌC SINH DÙNG CHUNG cho cả Tutor tự đăng nhập và Admin quản lý hộ một Tutor.
// Khi activeTutorId có giá trị (Tutor Supabase hoặc Admin đang mở workspace của một Tutor):
// ghi thẳng lên Supabase (students + student_schedules), tutor_id LUÔN lấy từ activeTutorId
// (không bao giờ lấy từ input tự do của người dùng). Khi activeTutorId null (tài khoản local cũ):
// giữ nguyên hành vi cũ — chỉ lưu localStorage.
// Conflict Detection (mục 6 "CREATE SCHEDULE"): kiểm tra TỪNG ngày đã chọn (cùng 1 giờ bắt đầu +
// thời lượng cho mọi ngày, đúng thiết kế form hiện tại) trước khi lưu. Chỉ áp dụng khi có
// activeTutorId (Supabase) — tài khoản local cũ không có student_schedules nên không check.
async function addNewClass() {
    var name = document.getElementById('student-name').value.trim();
    var subject = document.getElementById('student-subject').value.trim();
    var rate = parseInt(document.getElementById('student-rate').value);
    var days = getSelectedDays();
    var duration = document.getElementById('select-duration').value;
    var startTime = document.getElementById('select-time').value;

    if (!name || !subject || isNaN(rate) || days.length === 0 || !startTime) { alert('Vui lòng nhập đầy đủ thông tin và chọn ít nhất một ngày học!'); return; }

    if (activeTutorId) {
        var allConflicts = [];
        days.forEach(function(dayName) {
            var found = checkScheduleConflict({ dayName: dayName, startTime: startTime, durationHours: parseFloat(duration) });
            found.forEach(function(f) { allConflicts.push(f); });
        });
        if (allConflicts.length > 0) {
            var endTime = acFloatToTimeStr(timeToFloat(startTime) + parseFloat(duration));
            acShowConflictWarning(allConflicts, { dayName: days.join(', '), startTime: startTime, endTime: endTime }, function() {
                addNewClassActual(name, subject, rate, days, duration, startTime);
            });
            return; // mục 6: KHÔNG âm thầm save — chờ Tutor quyết định trên modal
        }
    }
    await addNewClassActual(name, subject, rate, days, duration, startTime);
}

async function addNewClassActual(name, subject, rate, days, duration, startTime) {
    // STEP 9A guard: chặn gọi trùng khi request trước CHƯA xong (double-click nút, hoặc
    // double-click nút "Xác nhận" trên modal cảnh báo trùng lịch — cả 2 đường gọi đều đi qua
    // đúng hàm này nên chặn ở đây là đủ, không cần sửa addNewClass()/acShowConflictWarning()).
    if (addClassInFlight) return;
    addClassInFlight = true;
    var addBtn = document.getElementById('add-class-btn');
    var addBtnOrigText = addBtn ? addBtn.innerText : null;
    if (addBtn) { addBtn.disabled = true; addBtn.innerText = 'Đang lưu...'; }

    try {
        var newId = Date.now();
        // Giá trị mặc định dùng khi KHÔNG có activeTutorId (tài khoản local cũ, không có Supabase)
        var finalName = name, finalSubject = subject, finalRate = rate;

        if (activeTutorId) {
            console.log('[ADD STUDENT] input rate:', rate);

            var insertResult = await createStudentRecord(name, subject, rate);

            console.log('[ADD STUDENT] Supabase inserted student:', insertResult.data);

            if (insertResult.error || !insertResult.data) {
                console.error('THÊM HỌC SINH FAILED:', insertResult.error);
                alert('⚠️ Không thể lưu học sinh: ' + (insertResult.error ? (insertResult.error.message || 'lỗi không rõ') : 'không nhận được dữ liệu trả về'));
                return;
            }
            console.log('[ADD STUDENT] Supabase stored rate:', insertResult.data.rate);

            // Supabase là SOURCE OF TRUTH — dựng classList từ chính row vừa insert trả về,
            // KHÔNG dùng lại biến local name/subject/rate ở trên.
            newId = insertResult.data.id;
            finalName = insertResult.data.name != null ? insertResult.data.name : name;
            finalSubject = insertResult.data.subject != null ? insertResult.data.subject : subject;
            finalRate = insertResult.data.rate != null ? insertResult.data.rate : rate;

            var scheduleRows = days.map(function(d) {
                var row = { student_id: newId };
                row[SCHEDULE_FIELDS.day] = d;
                row[SCHEDULE_FIELDS.start] = startTime;
                row[SCHEDULE_FIELDS.duration] = parseFloat(duration);
                return row;
            });
            var schedResult = await supabaseClient.from('student_schedules').insert(scheduleRows);
            if (schedResult.error) {
                console.error('LƯU LỊCH HỌC FAILED:', schedResult.error);
                showToast('⚠️', 'Đã thêm học sinh nhưng lưu lịch học thất bại', schedResult.error.message || '');
            }
        }

        classList.push({
            id: newId, name: finalName, subject: finalSubject, rate: finalRate,
            day: days[0],   // giữ lại trường cũ để tương thích
            days: days,     // mảng ngày mới
            startTime: startTime, startTimes: days.map(function() { return startTime; }),
            duration: duration,
            sessions: 0, lessons: [], files: [], attendance: {}, feePaidMonths: {},
            _supabaseSource: !!activeTutorId
        });

        document.getElementById('student-name').value = '';
        document.getElementById('student-subject').value = '';
        // Reset checkboxes
        document.querySelectorAll('#day-checkbox-group input[type=checkbox]').forEach(function(c) {
            c.checked = false;
        });
        document.querySelectorAll('#day-checkbox-group label').forEach(function(lbl) {
            lbl.style.borderColor = ''; lbl.style.color = ''; lbl.style.background = '';
        });
        saveData(); renderTimeSlots(); updateTimeSelectOptions(); renderClassList();
        if (activeTutorId) { showToast('✅', 'Đã thêm học sinh', name); refreshAdminDashboardStats(); }
    } finally {
        // Luôn restore dù thành công hay lỗi (kể cả return sớm/exception) — mục 2 đề bài.
        addClassInFlight = false;
        if (addBtn) { addBtn.disabled = false; addBtn.innerText = addBtnOrigText; }
    }
}

// ----------------------------------------------------------------------
// XÓA HỌC SINH
// ----------------------------------------------------------------------
// Hàm XÓA HỌC SINH DÙNG CHUNG — cùng cơ chế activeTutorId như addNewClass ở trên.
async function removeClass(id, btnEl) {
    // STEP 9A guard: confirm() vốn đã chặn được double-click TRONG lúc dialog đang mở (native
    // dialog block cả event loop), nhưng KHÔNG chặn được click thứ 2 SAU khi đã bấm OK, trong lúc
    // 2 lệnh delete Supabase bên dưới đang await — thêm in-flight flag để chặn đúng khoảng đó.
    if (removeClassInFlight) return;
    if (!confirm('Xóa lớp học này?')) return;

    removeClassInFlight = true;
    // btnEl: nút 🗑️ vừa bấm, được truyền từ chính onclick (xem renderClassList) — không đổi
    // UI flow, chỉ thêm tham chiếu để disable/restore đúng nút đó.
    var origHtml = btnEl ? btnEl.innerHTML : null;
    if (btnEl) { btnEl.disabled = true; }

    try {
        if (activeTutorId) {
            var schedDel = await supabaseClient.from('student_schedules').delete().eq('student_id', id);
            if (schedDel.error) {
                console.error('XÓA LỊCH HỌC (trước khi xóa học sinh) FAILED:', schedDel.error);
                alert('⚠️ Không thể xóa lịch học của học sinh này: ' + (schedDel.error.message || ''));
                return;
            }
            var stuDel = await supabaseClient.from('students').delete().eq('id', id);
            if (stuDel.error) {
                console.error('XÓA HỌC SINH FAILED:', stuDel.error);
                alert('⚠️ Không thể xóa học sinh: ' + (stuDel.error.message || ''));
                return;
            }
        }

        classList = classList.filter(c => c.id !== id);
        saveData(); renderTimeSlots(); updateTimeSelectOptions(); renderClassList();
        if (activeTutorId) { showToast('✅', 'Đã xóa học sinh', ''); refreshAdminDashboardStats(); }
    } finally {
        // Luôn restore dù thành công hay lỗi. Lưu ý: nếu xóa thành công, renderClassList() ở
        // trên đã render lại toàn bộ card (kể cả nút này) nên việc gán lại btnEl vô hại (element
        // cũ đã bị remove khỏi DOM, set thuộc tính trên nó không ảnh hưởng gì); nếu lỗi/return sớm,
        // renderClassList() KHÔNG chạy nên nút vẫn còn trên DOM và cần được restore đúng ở đây.
        removeClassInFlight = false;
        if (btnEl) { btnEl.disabled = false; if (origHtml !== null) btnEl.innerHTML = origHtml; }
    }
}

// ----------------------------------------------------------------------
// DANH SÁCH / SEARCH / FILTER
// ----------------------------------------------------------------------
// Hiển thị lịch học: nếu có nhiều ngày kèm giờ riêng (c.startTimes) thì hiện đủ từng cặp ngày-giờ,
// nếu không thì giữ nguyên định dạng cũ (days chung 1 startTime) để không ảnh hưởng dữ liệu local hiện có.
function buildScheduleDisplay(c) {
    if (Array.isArray(c.days) && Array.isArray(c.startTimes) && c.startTimes.length === c.days.length && c.startTimes.length > 0) {
        return c.days.map(function(d, i) { return d + ' lúc ' + c.startTimes[i]; }).join(' · ');
    }
    if (Array.isArray(c.days) && c.days.length) {
        return c.days.join(', ') + (c.startTime ? ' (' + c.startTime + ')' : '');
    }
    return (c.day || '') + (c.startTime ? ' (' + c.startTime + ')' : '');
}

// Trạng thái học phí hiển thị ở thẻ lớp học / bảng tài chính: học sinh Supabase (_supabaseSource)
// tính từ public.payments (SOURCE OF TRUTH); học sinh local-only giữ nguyên feePaidMonths cũ.
function getClassCardFeeStatus(student, monthKey, expectedAmount) {
    if (student._supabaseSource) {
        var totalPaid = getPeriodTotalPaid(student.id, monthKey);
        return computePeriodStatus(totalPaid, expectedAmount);
    }
    var isPaid = !!(student.feePaidMonths && student.feePaidMonths[monthKey]);
    return isPaid ? 'paid' : 'pending';
}

function buildFeeStatusBadgeHtml(status) {
    if (status === 'paid') return '<span style="color:#10b981; font-size:12px; margin-left:10px;">[Đã thu phí]</span>';
    if (status === 'partial') return '<span style="color:#f59e0b; font-size:12px; margin-left:10px;">[Thu một phần]</span>';
    return '<span style="color:#ef4444; font-size:12px; margin-left:10px;">[Chưa thu phí]</span>';
}

function renderClassList() {
    renderTodaysWork(); // mục 14/15: Today's Work luôn đồng bộ theo classList hiện tại, không cần F5
    var container = document.getElementById('class-container');
    container.innerHTML = ''; var globalRevenue = 0;

    if (classList.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:30px; font-size:14px;">Chưa có lớp học nào được thêm.</div>';
        document.getElementById('global-revenue').innerText = '0 đ';
        renderTutorStudentFilterOptions(); // vẫn dựng lại các option filter (rỗng) để không kẹt giá trị cũ
        return;
    }

    var currentMonthKey = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');

    // Mục SEARCH+FILTER: tính doneSessionsThisMonth/totalCost/feeStatus cho TOÀN BỘ classList
    // trước (globalRevenue ở đầu trang LUÔN phản ánh TẤT CẢ học sinh, không bị ảnh hưởng bởi
    // search/filter đang áp dụng) — filter chỉ quyết định card nào được RENDER bên dưới.
    var enriched = classList.map(function(c) {
        var doneSessionsThisMonth = 0;
        if (c._supabaseSource) {
            // SOURCE OF TRUTH cho học sinh Supabase: public.lessons (qua lessonsCacheByStudent),
            // dùng LẠI đúng hàm getSessionsInMonth() mà Finance Dashboard đang dùng — để Student
            // Card và Finance Dashboard KHÔNG BAO GIỜ lệch số liệu với cùng một dữ liệu gốc.
            // KHÔNG dùng c.attendance/c.sessions làm nguồn chính nữa (chỉ còn là bridge hiển thị cũ).
            doneSessionsThisMonth = getSessionsInMonth(c, currentMonthKey).length;
        } else if (c.attendance && c.attendance[currentMonthKey]) {
            doneSessionsThisMonth = c.attendance[currentMonthKey].length;
        } else {
            doneSessionsThisMonth = c.sessions || 0;
        }

        var totalCost = computeBillingStats(
            Array.from({ length: doneSessionsThisMonth }, function() { return { status: 'completed', duration: 0 }; }),
            [], (Number(c.rate) || 0) * 1000
        ).expected;
        globalRevenue += totalCost;

        var feeStatus = getClassCardFeeStatus(c, currentMonthKey, totalCost);
        return { student: c, doneSessionsThisMonth: doneSessionsThisMonth, totalCost: totalCost, feeStatus: feeStatus };
    });

    document.getElementById('global-revenue').innerText = globalRevenue.toLocaleString() + ' đ';

    renderTutorStudentFilterOptions(); // dựng lại option Môn học/Trạng thái từ đúng dữ liệu hiện tại, không hard-code

    var visible = applyTutorStudentFilters(enriched);

    if (visible.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af; text-align:center; padding:30px; font-size:14px;">Không tìm thấy dữ liệu phù hợp.</div>';
        return;
    }

    visible.forEach(function(item) {
        var c = item.student;
        var doneSessionsThisMonth = item.doneSessionsThisMonth;
        var totalCost = item.totalCost;
        var statusText = buildFeeStatusBadgeHtml(item.feeStatus);

        var card = document.createElement('div'); card.className = 'class-card';
        var idJs = (typeof c.id === 'number') ? c.id : "'" + String(c.id).replace(/'/g, "\\'") + "'"; // an toàn cho cả id số (local) và id UUID chuỗi (Supabase), tương thích onclick="..." (nháy kép)
        var scheduleDisplay = buildScheduleDisplay(c);
        card.innerHTML = `
            <div class="class-meta" onclick="openProfilePage(${idJs})">
                <h4><strong>${c.name}</strong> - <span style="color:#00cca3">${c.subject}</span> ${statusText}</h4>
                <p>Học phí cố định: ${(c.rate * 1000).toLocaleString()} đ/buổi</p>
                <div>
                    <span class="sched-tag">⏰ ${scheduleDisplay}</span>
                    <span class="profile-btn-tag">📝 Vào Hồ Sơ Toàn Diện ➔</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
                <div style="text-align:right;">
                    <div style="font-size:12px; color:var(--text-sub);">Đã dạy: <strong>${doneSessionsThisMonth} buổi</strong></div>
                    <div class="total-money"><strong>${totalCost.toLocaleString()} đ</strong></div>
                </div>
                <button onclick="openEditClass(${idJs}); event.stopPropagation();" class="btn-edit-class" title="Chỉnh sửa lớp">✏️</button>
                <button onclick="removeClass(${idJs}, this); event.stopPropagation();" class="btn-del">🗑️</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ===== SEARCH + FILTER: Danh sách học sinh của Tutor hiện tại (class-container) =====
// Áp dụng cho CẢ Tutor tự xem lẫn Admin đang "quản lý hộ" một Tutor (openTutorWorkspaceAsAdmin
// dùng chung renderClassList/class-container) — không tạo bản sao riêng cho Admin.
function applyTutorStudentFilters(enriched) {
    var q = (tutorStudentSearchState.query || '').trim().toLowerCase();
    var subjectFilter = tutorStudentSearchState.subject;
    var statusFilter = tutorStudentSearchState.status;
    var financeFilter = tutorStudentSearchState.finance;
    return enriched.filter(function(item) {
        var c = item.student;
        if (q) {
            var hay = [c.name, c.subject, c.school, c.parent_name, c.parent_phone].filter(Boolean).join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        if (subjectFilter !== 'all' && (c.subject || '') !== subjectFilter) return false;
        if (statusFilter !== 'all' && (c.status || '') !== statusFilter) return false;
        if (financeFilter !== 'all' && item.feeStatus !== financeFilter) return false;
        return true;
    });
}

// Dựng lại option của 2 dropdown "Môn học"/"Trạng thái" TỪ ĐÚNG dữ liệu classList hiện tại
// (không hard-code danh sách môn/trạng thái) — giữ lại lựa chọn đang chọn nếu vẫn còn hợp lệ.
function renderTutorStudentFilterOptions() {
    var subjectSel = document.getElementById('tutor-student-subject-filter');
    var statusSel = document.getElementById('tutor-student-status-filter');
    if (!subjectSel || !statusSel) return;

    var subjects = Array.from(new Set(classList.map(function(c) { return c.subject; }).filter(Boolean))).sort();
    var statuses = Array.from(new Set(classList.map(function(c) { return c.status; }).filter(Boolean))).sort();

    subjectSel.innerHTML = '<option value="all">Môn học: Tất cả</option>'
        + subjects.map(function(s) { return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; }).join('');
    statusSel.innerHTML = '<option value="all">Trạng thái: Tất cả</option>'
        + statuses.map(function(s) { return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; }).join('');

    subjectSel.value = subjects.indexOf(tutorStudentSearchState.subject) > -1 ? tutorStudentSearchState.subject : 'all';
    statusSel.value = statuses.indexOf(tutorStudentSearchState.status) > -1 ? tutorStudentSearchState.status : 'all';
    if (subjectSel.value === 'all') tutorStudentSearchState.subject = 'all';
    if (statusSel.value === 'all') tutorStudentSearchState.status = 'all';
}

function onTutorStudentSearchInput(value) {
    tutorStudentSearchState.query = value;
    renderClassList();
}

function onTutorStudentFilterChange(key, value) {
    tutorStudentSearchState[key] = value;
    renderClassList();
}

// Thao tác nhanh "+ Thêm học sinh" (mục 12) — chuyển sang trang Học sinh rồi focus thẳng vào
// ô tên học sinh của form "Thêm Lớp Mới" đã có sẵn, KHÔNG tạo form mới.
function goToAddStudent() {
    switchTutorPage('students');
    var input = document.getElementById('student-name');
    if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function() { input.focus(); }, 250);
    }
}

// ----------------------------------------------------------------------
// SỬA HỌC SINH (CHỈNH SỬA LỚP HỌC) — Giữ nguyên toàn bộ dữ liệu
// ----------------------------------------------------------------------
function openEditClass(id) {
    var c = classList.find(function(x) { return x.id === id; });
    if (!c) return;
    editingClassId = id;
    ecSelectedTimes = (c.startTimes || [c.startTime]).slice();

    // Điền thông tin
    document.getElementById('ec-name').value = c.name;
    document.getElementById('ec-subject').value = c.subject;
    document.getElementById('ec-rate').value = c.rate;
    document.getElementById('ec-duration').value = c.duration || '2';
    ecUpdateRatePreview();

    // Ngày học
    var cdays = c.days || [c.day];
    document.querySelectorAll('#ec-days input').forEach(function(chk) {
        chk.checked = cdays.includes(chk.value);
    });

    // Giờ dạy — build grid từ tất cả khung giờ phổ biến
    ecBuildTimeGrid();

    document.getElementById('edit-class-modal').classList.add('open');
}

function closeEditClass() {
    document.getElementById('edit-class-modal').classList.remove('open');
    editingClassId = null;
}

function ecUpdateRatePreview() {
    var rate = parseInt(document.getElementById('ec-rate').value) || 0;
    document.getElementById('ec-rate-preview').innerText = rate > 0
        ? '= ' + (rate * 1000).toLocaleString('vi-VN') + ' đ/buổi'
        : '';
}
document.addEventListener('DOMContentLoaded', function() {
    var rateInp = document.getElementById('ec-rate');
    if (rateInp) rateInp.addEventListener('input', ecUpdateRatePreview);
});

function ecBuildTimeGrid() {
    var grid = document.getElementById('ec-times-grid');
    grid.innerHTML = '';
    var allTimes = [
        "06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
        "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30",
        "18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00"
    ];
    // Thêm các giờ thủ công đã chọn không có trong danh sách
    ecSelectedTimes.forEach(function(t) {
        if (!allTimes.includes(t)) allTimes.push(t);
    });
    allTimes.sort(function(a,b) { return parseFloat(a)-parseFloat(b); });

    allTimes.forEach(function(t) {
        var lbl = document.createElement('label');
        lbl.className = 'time-edit-lbl';
        lbl.innerHTML = '<input type="checkbox" value="'+t+'" '+(ecSelectedTimes.includes(t)?'checked':'')+' onchange="ecOnTimeChange(this)"> '+t;
        grid.appendChild(lbl);
    });
    ecUpdateSelectedChips();
}

function ecOnTimeChange(chk) {
    if (chk.checked) { if (!ecSelectedTimes.includes(chk.value)) ecSelectedTimes.push(chk.value); }
    else { ecSelectedTimes = ecSelectedTimes.filter(function(t) { return t !== chk.value; }); }
    ecSelectedTimes.sort();
    ecUpdateSelectedChips();
}

function ecAddManualTime() {
    var val = document.getElementById('ec-manual-time').value;
    if (!val) return;
    var parts = val.split(':');
    var t = String(parseInt(parts[0])).padStart(2,'0') + ':' + (parts[1]||'00');
    if (!ecSelectedTimes.includes(t)) { ecSelectedTimes.push(t); ecSelectedTimes.sort(); }
    document.getElementById('ec-manual-time').value = '';
    ecBuildTimeGrid(); // rebuild để thêm giờ mới vào grid
}

function ecRemoveTime(t) {
    ecSelectedTimes = ecSelectedTimes.filter(function(x) { return x !== t; });
    // Uncheck trong grid nếu có
    document.querySelectorAll('#ec-times-grid input').forEach(function(chk) {
        if (chk.value === t) chk.checked = false;
    });
    ecUpdateSelectedChips();
}

function ecUpdateSelectedChips() {
    var box = document.getElementById('ec-selected-times');
    box.innerHTML = '';
    if (!ecSelectedTimes.length) {
        box.innerHTML = '<span style="font-size:12px;color:var(--text-sub);">Chưa chọn giờ nào</span>';
        return;
    }
    ecSelectedTimes.forEach(function(t) {
        var chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:var(--accent-dim);color:var(--accent);border:1px solid rgba(0,204,163,0.3);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;';
        chip.innerHTML = t + ' <span onclick="ecRemoveTime(\''+t+'\')" style="cursor:pointer;font-size:14px;line-height:1;opacity:.7;">×</span>';
        box.appendChild(chip);
    });
}

// Hàm SỬA HỌC SINH DÙNG CHUNG — cùng cơ chế activeTutorId như addNewClass/removeClass.
// Khi có activeTutorId: cập nhật students (name, subject) rồi ĐỒNG BỘ LẠI TOÀN BỘ lịch học
// của học sinh này trong student_schedules (xóa hết lịch cũ, ghi lại lịch mới theo lựa chọn hiện tại).
// Conflict Detection (mục 5 "EDIT EXISTING SCHEDULE"): vì đây là kiểu "xóa hết + ghi lại toàn
// bộ" (không sửa từng dòng), loại trừ TOÀN BỘ lịch CŨ của chính học sinh này khỏi so sánh
// (excludeStudentId = editingClassId, không truyền excludeScheduleRowId) — chỉ so với các
// học sinh KHÁC, đúng tinh thần "A edit A không được báo conflict với chính A".
async function saveEditClass() {
    var c = classList.find(function(x) { return x.id === editingClassId; });
    if (!c) return;

    var name = document.getElementById('ec-name').value.trim();
    var subject = document.getElementById('ec-subject').value.trim();
    var rate = parseInt(document.getElementById('ec-rate').value);
    var duration = document.getElementById('ec-duration').value;
    var days = Array.from(document.querySelectorAll('#ec-days input:checked')).map(function(chk) { return chk.value; });

    if (!name) { alert('Vui lòng nhập tên học sinh.'); return; }
    if (!subject) { alert('Vui lòng nhập môn học.'); return; }
    if (isNaN(rate) || rate <= 0) { alert('Học phí không hợp lệ.'); return; }
    if (days.length === 0) { alert('Chọn ít nhất 1 ngày học.'); return; }
    if (ecSelectedTimes.length === 0) { alert('Chọn ít nhất 1 giờ dạy.'); return; }

    if (activeTutorId) {
        var allConflicts = [];
        days.forEach(function(d, i) {
            var t = ecSelectedTimes[i] || ecSelectedTimes[0];
            var found = checkScheduleConflict({ dayName: d, startTime: t, durationHours: parseFloat(duration), excludeStudentId: editingClassId });
            found.forEach(function(f) { allConflicts.push(f); });
        });
        if (allConflicts.length > 0) {
            var repTime = ecSelectedTimes[0];
            var endTime = acFloatToTimeStr(timeToFloat(repTime) + parseFloat(duration));
            acShowConflictWarning(allConflicts, { dayName: days.join(', '), startTime: repTime, endTime: endTime }, function() {
                saveEditClassActual(c, name, subject, rate, duration, days);
            });
            return; // mục 6: KHÔNG âm thầm save
        }
    }
    await saveEditClassActual(c, name, subject, rate, duration, days);
}

async function saveEditClassActual(c, name, subject, rate, duration, days) {
    // STEP 9A guard: chặn gọi trùng khi request trước CHƯA xong — cả 2 đường gọi
    // (saveEditClass() trực tiếp, hoặc qua modal xác nhận trùng lịch) đều đi qua đúng
    // hàm này nên chặn ở đây là đủ.
    if (saveEditClassInFlight) return;
    saveEditClassInFlight = true;
    var saveBtn = document.getElementById('save-edit-class-btn');
    var saveBtnOrigText = saveBtn ? saveBtn.innerText : null;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Đang lưu...'; }

    try {
        if (activeTutorId) {
            console.log('[EDIT STUDENT] rate input:', rate);

            // UPDATE trực tiếp public.students, đúng row theo id, bao gồm cả cột rate.
            // .select().single() để đọc lại NGAY giá trị thực tế mà Supabase vừa ghi
            // (SOURCE OF TRUTH) — không suy ra/tin vào biến local "rate" ở trên.
            var updResult = await supabaseClient
                .from('students')
                .update({ name: name, subject: subject, rate: rate })
                .eq('id', editingClassId)
                .select()
                .single();

            console.log('[EDIT STUDENT] updated row:', updResult.data);

            if (updResult.error || !updResult.data) {
                // Không được hiển thị là lưu thành công khi UPDATE thất bại
                console.error('[ADMIN UPDATE STUDENT RATE FAILED]', updResult.error);
                var errMsg = describeSupabaseError(updResult.error);
                alert('⚠️ Không thể lưu học phí học sinh: ' + errMsg
                    + '\n\nNếu lỗi liên quan đến RLS/403, kiểm tra policy UPDATE trên bảng students cho vai trò Admin/Tutor — không tự ý đổi RLS khi chưa xác nhận đây là nguyên nhân.');
                return;
            }
            // Ghi đè lại rate bằng giá trị THẬT vừa đọc từ Supabase (không phải giá trị nhập vào input)
            rate = updResult.data.rate != null ? updResult.data.rate : rate;

            var delSched = await supabaseClient.from('student_schedules').delete().eq('student_id', editingClassId);
            if (delSched.error) {
                console.error('ĐỒNG BỘ LỊCH HỌC (xóa cũ) FAILED:', delSched.error);
                alert('⚠️ Không thể cập nhật lịch học: ' + (delSched.error.message || ''));
                return;
            }

            var newScheduleRows = days.map(function(d, i) {
                var row = { student_id: editingClassId };
                row[SCHEDULE_FIELDS.day] = d;
                row[SCHEDULE_FIELDS.start] = ecSelectedTimes[i] || ecSelectedTimes[0];
                row[SCHEDULE_FIELDS.duration] = parseFloat(duration);
                return row;
            });
            var insSched = await supabaseClient.from('student_schedules').insert(newScheduleRows);
            if (insSched.error) {
                console.error('ĐỒNG BỘ LỊCH HỌC (ghi mới) FAILED:', insSched.error);
                alert('⚠️ Không thể lưu lịch học mới: ' + (insSched.error.message || ''));
                return;
            }
        }

        // Cập nhật — GIỮ NGUYÊN toàn bộ dữ liệu khác
        c.name = name;
        c.subject = subject;
        c.rate = rate;
        c.duration = duration;
        c.days = days;
        c.day = days[0];
        c.startTimes = ecSelectedTimes.slice();
        c.startTime = ecSelectedTimes[0];

        saveData();
        renderClassList();
        renderTimeSlots();
        closeEditClass();

        // Nếu đang mở hồ sơ của lớp này thì cập nhật luôn
        if (activeProfileClassId === editingClassId) {
            document.getElementById('view-student-title').innerText = 'Hồ sơ học sinh: ' + c.name;
            document.getElementById('view-student-subtitle').innerText = 'Bộ môn: ' + c.subject + ' | Lịch: ' + c.days.join(', ') + ' lúc ' + c.startTime;
        }

        // Toast
        if (typeof showToast === 'function') {
            showToast('✅', 'Đã lưu thay đổi!', c.name + ' · ' + days.join(', ') + ' · ' + ecSelectedTimes.join(', '));
        }
        refreshFinanceDashboardIfOpen(c); // rate/lịch vừa đổi -> Finance Dashboard phải cập nhật ngay nếu đang mở
        refreshReportsPageIfOpen(c); // rate/lịch vừa đổi -> Reports phải cập nhật ngay nếu đang mở
    } finally {
        // Luôn restore dù thành công hay lỗi (kể cả return sớm) — mục 2 đề bài. Nếu thành công,
        // closeEditClass() ở trên đã đóng modal nên việc restore text/disabled ở đây vô hại.
        saveEditClassInFlight = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = saveBtnOrigText; }
    }
}

// ============================================================================
// EXPOSE TỐI THIỂU QUA WINDOW (mục 7 — HTML COMPATIBILITY)
// Chỉ export những hàm được gọi trực tiếp từ onclick/onchange/oninput trong
// HTML hoặc từ script chính (classic script) như global. KHÔNG expose toàn bộ
// module (không expose các hàm nội bộ như buildScheduleDisplay/
// applyTutorStudentFilters mà chỉ được gọi TỪ BÊN TRONG module này — nhưng vì
// script chính vẫn có thể cần gọi renderClassList()/goToAddStudent() ở nơi
// khác, các hàm "public" theo đúng audit mục 3 được export dưới đây).
// ============================================================================
export {
    createStudentRecord,
    addNewClass, addNewClassActual, removeClass,
    renderClassList, applyTutorStudentFilters, renderTutorStudentFilterOptions,
    onTutorStudentSearchInput, onTutorStudentFilterChange, goToAddStudent,
    buildScheduleDisplay, getClassCardFeeStatus, buildFeeStatusBadgeHtml,
    openEditClass, closeEditClass, saveEditClass, saveEditClassActual,
    ecUpdateRatePreview, ecBuildTimeGrid, ecOnTimeChange, ecAddManualTime, ecRemoveTime, ecUpdateSelectedChips
};

window.createStudentRecord = createStudentRecord;
window.addNewClass = addNewClass;
window.removeClass = removeClass;
window.renderClassList = renderClassList;
window.onTutorStudentSearchInput = onTutorStudentSearchInput;
window.onTutorStudentFilterChange = onTutorStudentFilterChange;
window.goToAddStudent = goToAddStudent;
window.openEditClass = openEditClass;
window.closeEditClass = closeEditClass;
window.saveEditClass = saveEditClass;
window.ecOnTimeChange = ecOnTimeChange;
window.ecAddManualTime = ecAddManualTime;
window.ecRemoveTime = ecRemoveTime;

// BUG FIX (phát hiện qua console log thực tế, KHÔNG thuộc STEP 11H-D): buildScheduleDisplay/
// getClassCardFeeStatus đã có trong export{} ở trên (ý định export từ đầu) nhưng bị THIẾU dòng
// gán window tương ứng — script chính (classic <script>, KHÔNG PHẢI module) gọi thẳng
// buildScheduleDisplay(student) trong openProfilePage()/renderStudentHero() (index.html) và
// getClassCardFeeStatus(...) ở nhiều chỗ tính trạng thái học phí (renderClassList của script
// chính, dashboard...) — vì KHÔNG có trên window nên ném ReferenceError, làm vỡ hoàn toàn trang
// Hồ sơ học sinh 1-1 (mở lên bị crash ngay, thấy đúng lỗi "buildScheduleDisplay is not defined at
// openProfilePage"). CHỈ thêm 2 dòng gán window dưới đây — KHÔNG đổi logic/behavior của 2 hàm này
// (100% cùng function reference đã tồn tại sẵn, giữ nguyên "TẠM Ở BÊN NGOÀI" quyết định trong
// export{} phía trên, chỉ sửa đúng chỗ thiếu).
window.buildScheduleDisplay = buildScheduleDisplay;
window.getClassCardFeeStatus = getClassCardFeeStatus;
