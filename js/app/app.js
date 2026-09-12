
        // ===== TEST SUPABASE AUTH (CHỈ KIỂM TRA, KHÔNG THAY ĐỔI LOGIN HIỆN TẠI) =====
        async function testSupabaseAuth() {
            const { data: { session }, error } =
                await supabaseClient.auth.getSession();
            if (error) {
                console.error('Supabase Auth test FAILED:', error);
                return;
            }
            console.log('Supabase Auth test SUCCESS:', session);
        }
        // supabaseClient giờ đến từ js/core/supabase.js (ES module — deferred theo spec), nên gọi
        // ngay tại top-level (như trước STEP 7B) sẽ chạy trước khi module kịp expose window.supabaseClient.
        // Đổi sang gọi ở DOMContentLoaded (chắc chắn sau khi module chạy xong) — vẫn chỉ console.log,
        // không đổi hành vi thật nào.
        document.addEventListener('DOMContentLoaded', testSupabaseAuth);

        // ===== TEST SUPABASE AUTH LOGIN (TUTOR) — CHỈ ĐỂ TEST, KHÔNG MIGRATE LOGIN HIỆN TẠI =====
        // Gọi thủ công từ Console: testTutorSupabaseLogin()
        async function testTutorSupabaseLogin() {
            const email = 'trungdunga25@gmail.com';
            const password = prompt('Nhập password Supabase của tài khoản Tutor Test:');
            if (!password) return;

            console.log('Testing Supabase Auth login...');

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });
            if (error) {
                console.error('Supabase Tutor Login FAILED:', error);
                return;
            }
            console.log('Supabase Tutor Login SUCCESS:', data.user);

            const userId = data.user.id;
            console.log('Auth User ID:', userId);

            const { data: tutor, error: tutorError } = await supabaseClient
                .from('tutors')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle(); // maybeSingle: 0 dòng khớp sẽ trả null, KHÔNG ném lỗi 406 như .single()
            if (tutorError) {
                console.error('Tutor lookup FAILED:', tutorError);
                return;
            }
            if (!tutor) {
                console.warn('Tutor lookup: không tìm thấy hồ sơ tutor cho user_id này.');
                return;
            }
            console.log('Tutor lookup SUCCESS:', tutor);

            const { data: students, error: studentsError } = await supabaseClient
                .from('students')
                .select('*')
                .eq('tutor_id', tutor.id);
            if (studentsError) {
                console.error('Student lookup FAILED:', studentsError);
                return;
            }
            console.log('Student lookup SUCCESS:', students);

            await supabaseClient.auth.signOut();
            console.log('Supabase Tutor Auth test COMPLETE');
        }

        var defaultTimes = [
            "06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
            "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30",
            "18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00"
        ];
        
        var freeSchedule = JSON.parse(localStorage.getItem('v13_free_sched')) || {
            "Thứ 2": ["06:00","07:30","10:00","10:30","11:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30"],
            "Thứ 3": ["08:00","09:00"], "Thứ 4": ["08:00","09:00"], "Thứ 5": ["08:00","09:00"], "Thứ 6": ["18:00"], "Thứ 7": ["08:00"], "Chủ Nhật": ["09:00"]
        };

        // classList / lessonsCacheByStudent / paymentsCacheByStudent: STEP 8B đã chuyển khai
        // báo (declaration) sang js/core/state.js (mục C — SHARED CACHE), vì đây là state dùng
        // chung Students/Lessons/Calendar/Finance/Admin/Reports, không riêng khu vực này. Giá
        // trị khởi tạo và cấu trúc GIỮ NGUYÊN 100% — chỉ đổi vị trí khai báo, không đổi behavior.
        // window.classList / window.lessonsCacheByStudent / window.paymentsCacheByStudent đã sẵn
        // sàng trước khi dòng này chạy (state.js là classic script, nạp trước script chính).

        // ===== MODULE QUẢN LÝ BUỔI HỌC: metadata trạng thái DÙNG CHUNG =====
        // Trước đây statusMeta/statusIcon được khai báo RIÊNG bên trong renderAttendanceGrid().
        // Nay hoisted lên global để lesson-detail modal (bên dưới) TÁI SỬ DỤNG đúng cùng một
        // nguồn nhãn/icon, không tạo bản sao lệch nhau giữa các nơi hiển thị trạng thái.
        var lessonStatusMeta = {
            scheduled: { label: 'Chưa học', cls: '' },
            completed: { label: 'Đã học', cls: 'checked' },
            absent:    { label: 'Nghỉ', cls: 'status-absent' },
            cancelled: { label: 'Hủy', cls: 'status-cancelled' }
        };
        var lessonStatusIcon = { scheduled: '🕒', completed: '✓', absent: '🟡', cancelled: '✕' };
        // currentLessonDetail (tọa độ buổi học đang mở trong lesson-detail modal) đã tách sang
        // js/lessons/lessons.js (STEP 7D) — chỉ dùng nội bộ trong module đó, không có nơi nào
        // khác trong file này đọc/ghi biến này (đã audit qua grep trước khi tách).

        // ================================================================================
        // ===== MODULE SEARCH + FILTER — CHỈ TÁC ĐỘNG UI, KHÔNG ĐỘNG VÀO DỮ LIỆU SUPABASE =====
        // Toàn bộ state dưới đây chỉ là "ống kính" hiển thị: mọi hàm filter luôn đọc từ dữ liệu THẬT
        // đã có sẵn trong bộ nhớ (classList / lessonsCacheByStudent / paymentsCacheByStudent / các
        // cache admin-*), KHÔNG BAO GIỜ xóa hay ghi đè lên các nguồn dữ liệu gốc đó, và KHÔNG gọi
        // Supabase khi người dùng gõ/đổi filter (chỉ lọc phía client). F5 sẽ reset các state này về
        // mặc định "Tất cả" — chấp nhận được theo yêu cầu, KHÔNG lưu vào localStorage.
        // ================================================================================
        var adminTutorSearchState = { query: '', status: 'all' };
        var adminTutorsCache = []; // danh sách Tutor đã tải từ Supabase (loadAdminTutorsFromSupabase), dùng để lọc lại phía client

        // tutorStudentSearchState đã tách sang js/students/students.js (STEP 7C).

        var adminStudentSearchState = { query: '', subject: 'all', tutorId: 'all', status: 'all', finance: 'all' };
        var adminStudentStatsCache = []; // các dòng đã tính sẵn của bảng "Thống kê theo Học sinh" (refreshAdminDashboardStats), dùng để lọc lại phía client
        var adminStudentFilterTutors = []; // danh sách {id, name} Tutor để đổ vào dropdown lọc "Tutor" của bảng học sinh toàn hệ thống

        // ===== REPORTS / ANALYTICS (Admin) — state + cache thô dùng chung =====
        // adminReportsRaw: dữ liệu THÔ (tutors/students/lessons TOÀN BỘ status/payments TOÀN BỘ status)
        // được nạp ĐÚNG 1 LẦN bên trong refreshAdminDashboardStats() — Reports KHÔNG gọi Supabase riêng,
        // KHÔNG tạo công thức tính tiền thứ hai, chỉ tính lại (client-side, theo tháng) từ mảng này.
        var adminReportsRaw = { tutors: [], students: [], lessons: [], payments: [], ok: false };
        var adminActiveMainTab = 'dashboard'; // 'dashboard' (nội dung Admin cũ) | 'reports' (module mới)
        var reportsMonth = new Date().getMonth();  // 0-based — mặc định THÁNG HIỆN TẠI (mục 2)
        var reportsYear = new Date().getFullYear();
        var reportsComputedCache = null; // kết quả computeReportsForMonth() của (reportsYear, reportsMonth) hiện tại — tính 1 lần/lượt render, không tính lại khi chỉ đổi search/filter
        var currentDayView = "Thứ 2";
        // activeProfileClassId / currentSelectedMonth: STEP 8B đã chuyển khai báo sang
        // js/core/state.js (mục B — SELECTION, state dùng chung Students/Lessons/Calendar/
        // Finance). Dòng gán currentSelectedMonth = ... ngay bên dưới GIỮ NGUYÊN vị trí/hành vi.

        // Khởi tạo tháng hiện tại
        var d = new Date();
        currentSelectedMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');

        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
        }

        function toggleTheme() {
            var btn = document.getElementById('theme-btn');
            if (document.body.classList.contains('light-mode')) {
                document.body.classList.remove('light-mode');
                btn.innerText = "🌙";
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.add('light-mode');
                btn.innerText = "☀️";
                localStorage.setItem('theme', 'light');
            }
        }

        // timeToFloat(): đã chuyển sang js/core/utils.js (STEP 7B), expose qua window.

        function getOccupiedClass(day, timeStr) {
            var targetTime = timeToFloat(timeStr);
            for (var i = 0; i < classList.length; i++) {
                var c = classList[i];
                // Hỗ trợ cả lớp cũ (c.day là string) và lớp mới (c.days là mảng)
                var classDays = c.days ? c.days : [c.day];
                if (classDays.includes(day)) {
                    var startTime = timeToFloat(c.startTime);
                    var endTime = startTime + parseFloat(c.duration);
                    if (targetTime >= startTime && targetTime < endTime) return c;
                }
            }
            return null;
        }

        // ================================================================================
        // ===== SMART CONFLICT DETECTION V1 =====
        // AUDIT (mục 1): app đã có getOccupiedClass(day, timeStr) ở trên, dùng cho lưới Weekly
        // Availability — nhưng nó chỉ kiểm tra 1 THỜI ĐIỂM có rơi vào trong 1 lịch khác hay không,
        // KHÔNG kiểm tra overlap giữa 2 KHOẢNG thời gian tùy ý (VD: lịch mới 19:00–21:00 vẫn "lọt qua"
        // nếu chọn giờ bắt đầu 19:00 trong khi đã có lịch khác 20:00–22:00, vì 19:00 không nằm trong
        // [20:00,22:00)). Vì vậy KHÔNG viết lại getOccupiedClass()/Weekly Availability (đúng yêu cầu
        // "KHÔNG viết lại phần Availability"), mà thêm 1 helper TRUNG TÂM MỚI dùng ĐÚNG 1 định nghĩa
        // overlap chuẩn (mục 3: A.start < B.end AND A.end > B.start) cho MỌI nơi tạo/sửa lịch cố định
        // (student_schedules): "Thêm Lớp Mới" (addNewClass), "Lịch dạy cố định" từng dòng
        // (addScheduleRow/updateScheduleRow), và "Sửa lớp" (saveEditClass).
        // KHÔNG tạo bảng/cột Supabase mới, KHÔNG thêm Supabase query mới: dữ liệu so sánh lấy từ
        // classList (đã nạp sẵn cho TẤT CẢ học sinh của Tutor lúc đăng nhập — mục 17 "không N+1") +
        // scheduleRowsCacheByStudent (đã nạp sẵn khi mở tab "Lịch dạy cố định" của 1 học sinh — dùng
        // để loại trừ CHÍNH XÁC 1 dòng đang sửa, mục 5). Đây CHÍNH LÀ nguồn dữ liệu Availability/
        // Calendar/Today's Work đang dùng, nên Availability và Conflict Check dùng CHUNG 1 định nghĩa
        // thời gian (mục 12), không tạo nguồn thứ 2.
        // PHẠM VI V1 (đã audit — mục 10 "actual lesson"): app hiện KHÔNG có bất kỳ nơi nào cho phép
        // tạo/sửa giờ của MỘT buổi lesson cụ thể khác với lịch cố định (chỉ có thể đổi status/notes
        // qua setLessonStatusForDate() — thời gian luôn copy nguyên từ student_schedules). Vì vậy V1
        // chỉ so sánh SCHEDULE-vs-SCHEDULE (lịch cố định theo thứ, mục 9) — chưa có tình huống thực tế
        // nào để so sánh với 1 lesson có giờ lệch khỏi lịch cố định của chính nó. Ghi rõ theo yêu cầu
        // mục 19, không tự đoán/bịa thêm tích hợp cho phần chưa tồn tại trong kiến trúc.
        // ================================================================================

        function acFloatToTimeStr(f) {
            var h = Math.floor(f), m = Math.round((f - h) * 60);
            if (m === 60) { h += 1; m = 0; }
            return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        }

        // Gom "khoảng bận" của TẤT CẢ học sinh (trừ chính đối tượng đang tạo/sửa — mục 5) cho ĐÚNG 1
        // thứ trong tuần (mục 9: "không compare Thứ 2 với Thứ 3"). excludeStudentId + không có
        // excludeScheduleRowId => loại TOÀN BỘ lịch cũ của học sinh đó (dùng khi ghi đè lại toàn bộ
        // lịch của 1 học sinh, VD saveEditClass). excludeScheduleRowId => chỉ loại ĐÚNG 1 dòng đang
        // sửa, giữ lại các dòng/thứ khác của CHÍNH học sinh đó (mục 5, addScheduleRow/updateScheduleRow).
        function acCollectBusyIntervalsForDay(dayName, excludeStudentId, excludeScheduleRowId) {
            var out = [];
            classList.forEach(function(student) {
                var isSelf = (excludeStudentId != null && String(student.id) === String(excludeStudentId));
                if (isSelf && !excludeScheduleRowId) return; // mục 5 (thay toàn bộ lịch) — loại hẳn học sinh này
                var rows = scheduleRowsCacheByStudent[student.id];
                if (rows && rows.length) {
                    // Có dữ liệu TỪNG DÒNG (chính xác hơn, có id để loại trừ đúng 1 dòng) — ưu tiên dùng.
                    rows.forEach(function(r) {
                        if (excludeScheduleRowId && String(r.id) === String(excludeScheduleRowId)) return; // mục 5
                        if (r.day_of_week !== dayName || !r.start_time || r.duration == null) return;
                        out.push({ studentId: student.id, studentName: student.name, subject: student.subject, startTime: r.start_time, durationHours: parseFloat(r.duration) });
                    });
                } else {
                    // Chưa nạp dữ liệu từng dòng cho học sinh này (chưa mở tab "Lịch dạy cố định" trong
                    // phiên này) — dùng classList (bulk, đã nạp sẵn cho TẤT CẢ học sinh, KHÔNG gọi
                    // Supabase thêm). classList[].duration là 1 giá trị dùng chung cho mọi ngày của học
                    // sinh đó (đúng model hiện tại của app, xem mapSupabaseStudentToClass).
                    var days = student.days || (student.day ? [student.day] : []);
                    var startTimes = student.startTimes || [];
                    days.forEach(function(d, idx) {
                        if (d !== dayName) return;
                        var st = startTimes[idx] || student.startTime;
                        if (!st || student.duration == null) return;
                        out.push({ studentId: student.id, studentName: student.name, subject: student.subject, startTime: st, durationHours: parseFloat(student.duration) });
                    });
                }
            });
            return out;
        }

        // Helper TRUNG TÂM (mục 2) — nhận thứ/giờ bắt đầu/thời lượng + đối tượng đang tạo/sửa để loại
        // trừ, trả về mảng conflict đủ để UI dùng (tên học sinh, môn học, giờ, số phút trùng — mục 6/8).
        // opts: { dayName, startTime, durationHours, excludeStudentId, excludeScheduleRowId }
        function checkScheduleConflict(opts) {
            if (!opts || !opts.dayName || !opts.startTime || !opts.durationHours) return [];
            var newStart = timeToFloat(opts.startTime);
            var newEnd = newStart + parseFloat(opts.durationHours);
            var busy = acCollectBusyIntervalsForDay(opts.dayName, opts.excludeStudentId, opts.excludeScheduleRowId);
            return busy.filter(function(b) {
                var bStart = timeToFloat(b.startTime);
                var bEnd = bStart + b.durationHours;
                return newStart < bEnd && newEnd > bStart; // mục 3: đúng công thức overlap chuẩn
            }).map(function(b) {
                var bStart = timeToFloat(b.startTime);
                var bEnd = bStart + b.durationHours;
                var overlapMinutes = Math.round((Math.min(newEnd, bEnd) - Math.max(newStart, bStart)) * 60);
                return { studentId: b.studentId, studentName: b.studentName, subject: b.subject, startTime: b.startTime, endTime: acFloatToTimeStr(bEnd), overlapMinutes: overlapMinutes };
            });
        }

        // ----- Modal cảnh báo (mục 6/7/8, tái sử dụng .modal-overlay/.modal-box hiện có) -----
        var acConflictPendingAction = null; // callback được gọi khi bấm "Vẫn tạo"

        function acShowConflictWarning(conflicts, newInfo, onProceed) {
            acConflictPendingAction = onProceed;
            document.getElementById('conflict-warning-title').innerText = conflicts.length > 1
                ? ('⚠️ Phát hiện ' + conflicts.length + ' xung đột') : '⚠️ Lịch bị trùng';
            document.getElementById('conflict-warning-new').innerHTML =
                'Lịch bạn đang tạo/sửa:<br><strong>' + escapeHtml(newInfo.dayName) + ' · ' + escapeHtml(newInfo.startTime) + ' – ' + escapeHtml(newInfo.endTime) + '</strong>';
            var listEl = document.getElementById('conflict-warning-list');
            listEl.innerHTML = '';
            conflicts.forEach(function(c, i) {
                var oh = Math.floor(c.overlapMinutes / 60), om = c.overlapMinutes % 60;
                var overlapText = (oh > 0 ? oh + ' giờ ' : '') + (om > 0 || oh === 0 ? om + ' phút' : '');
                var row = document.createElement('div');
                row.style.cssText = 'background:var(--bg-card-sub); border:1px solid var(--border-color); border-left:3px solid #ef4444; border-radius:8px; padding:8px 10px; font-size:12.5px; line-height:1.6;';
                row.innerHTML = (conflicts.length > 1 ? ((i + 1) + '. ') : '') + '<strong>' + escapeHtml(c.studentName || '') + '</strong>' + (c.subject ? (' · ' + escapeHtml(c.subject)) : '')
                    + '<br>' + escapeHtml(c.startTime) + ' – ' + escapeHtml(c.endTime)
                    + ' <span style="color:var(--text-sub);">(trùng ' + overlapText + ')</span>';
                listEl.appendChild(row);
            });
            document.getElementById('conflict-warning-modal').classList.add('open');
        }

        function acCloseConflictModal() {
            document.getElementById('conflict-warning-modal').classList.remove('open');
            acConflictPendingAction = null; // "Quay lại" = hủy thao tác lưu, KHÔNG âm thầm save (mục 6)
        }

        function acProceedDespiteConflict() {
            var action = acConflictPendingAction;
            document.getElementById('conflict-warning-modal').classList.remove('open');
            acConflictPendingAction = null;
            if (typeof action === 'function') action(); // "Vẫn tạo" — Tutor cố tình chấp nhận trùng lịch (mục 7)
        }

        function getSelectedDays() {
            var checks = document.querySelectorAll('#day-checkbox-group input[type=checkbox]:checked');
            return Array.from(checks).map(c => c.value);
        }

        function onDayCheckChange(chk) {
            // Highlight label khi được chọn
            var labels = document.querySelectorAll('#day-checkbox-group label');
            labels.forEach(function(lbl) {
                var inp = lbl.querySelector('input');
                if (inp.checked) {
                    lbl.style.borderColor = '#00cca3';
                    lbl.style.color = '#00cca3';
                    lbl.style.background = 'rgba(0,204,163,0.12)';
                } else {
                    lbl.style.borderColor = '';
                    lbl.style.color = '';
                    lbl.style.background = '';
                }
            });
            updateTimeSelectOptions();
        }

        function toggleDay(dayName) {
            currentDayView = dayName;
            document.querySelectorAll('.day-circle').forEach(c => c.classList.remove('active'));
            document.getElementById('circle-' + dayName).classList.add('active');
            renderTimeSlots();
        }

        function renderTimeSlots() {
            var morning = document.getElementById('grid-morning');
            var afternoon = document.getElementById('grid-afternoon');
            var evening = document.getElementById('grid-evening');
            morning.innerHTML = ''; afternoon.innerHTML = ''; evening.innerHTML = '';

            defaultTimes.forEach(function(time) {
                var hour = parseInt(time.split(':')[0]);
                var slot = document.createElement('div');
                slot.className = 'time-slot';
                
                var occupiedBy = getOccupiedClass(currentDayView, time);
                var isFree = freeSchedule[currentDayView].includes(time);

                if (occupiedBy) {
                    slot.className += ' occupied';
                    slot.innerText = time + ' [' + occupiedBy.name + ']';
                    slot.title = 'Đã bận — lịch học cố định của ' + occupiedBy.name;
                } else {
                    if (isFree) {
                        slot.className += ' active';
                        slot.innerText = '✓ ' + time;
                    } else {
                        slot.innerText = time;
                    }
                    
                    slot.onclick = function() {
                        if (isFree) {
                            freeSchedule[currentDayView] = freeSchedule[currentDayView].filter(t => t !== time);
                        } else {
                            freeSchedule[currentDayView].push(time);
                        }
                        freeSchedule[currentDayView].sort((a,b) => timeToFloat(a) - timeToFloat(b));
                        saveData(); renderTimeSlots(); updateTimeSelectOptions();
                    };
                }

                if (hour <= 11) morning.appendChild(slot);
                else if (hour <= 17) afternoon.appendChild(slot);
                else evening.appendChild(slot);
            });
        }

        function updateTimeSelectOptions() {
            var selectedDays = getSelectedDays();
            var timeSelect = document.getElementById('select-time');
            timeSelect.innerHTML = '';

            if (selectedDays.length === 0) {
                var opt = document.createElement('option'); opt.text = "-- Chọn ngày học trước --"; opt.value = ""; timeSelect.appendChild(opt); return;
            }

            // Lấy giờ rảnh của ngày đầu tiên được chọn (để chọn giờ bắt đầu chung)
            var firstDay = selectedDays[0];
            var availableHours = freeSchedule[firstDay] || [];
            var trueAvailable = availableHours.filter(time => getOccupiedClass(firstDay, time) === null);

            if (trueAvailable.length === 0) {
                var opt = document.createElement('option'); opt.text = "-- Không có giờ rảnh --"; opt.value = ""; timeSelect.appendChild(opt); return;
            }
            trueAvailable.forEach(time => {
                var opt = document.createElement('option'); opt.value = time; opt.text = time; timeSelect.appendChild(opt);
            });
        }

        // ===== STUDENTS: list/search/filter/add/edit/delete (STEP 7C) =====
        // addNewClass/addNewClassActual/removeClass/buildScheduleDisplay/getClassCardFeeStatus/
        // buildFeeStatusBadgeHtml/renderClassList/applyTutorStudentFilters/
        // renderTutorStudentFilterOptions/onTutorStudentSearchInput/onTutorStudentFilterChange
        // đã tách sang js/students/students.js. Không đổi behavior/database/Supabase call.



        /* HỆ THỐNG XỬ LÝ TRANG HỒ SƠ TRÀN MÀN HÌNH */
        async function openProfilePage(id) {
            activeProfileClassId = id;
            var student = classList.find(c => c.id === id);
            if (!student) return;

            document.getElementById('main-page-view').style.display = 'none';
            document.getElementById('profile-page-view').style.display = 'block';

            document.getElementById('view-student-title').innerText = "Hồ sơ học sinh: " + student.name;
            document.getElementById('view-student-subtitle').innerText = "Bộ môn: " + student.subject + " | Lịch dạy cố định: " + buildScheduleDisplay(student);

            // "Lịch học cố định" và "Kho dữ liệu & Tài liệu giảng dạy" luôn bắt đầu ở trạng thái ĐÓNG
            // mỗi khi mở hồ sơ (mới hoặc mở lại), đúng yêu cầu "mặc định ẩn" — tránh lộ dữ liệu của
            // học sinh trước đó ra ngay khi vừa mở trang.
            setFixedScheduleSectionOpen(false);
            setDocsSectionOpen(false);

            // Student Profile 2.0 — reset về tab/filter mặc định mỗi khi mở hồ sơ MỘT học sinh mới,
            // tránh giữ lại filter/search của học sinh vừa xem trước đó.
            spHistoryFilterState = 'all'; spHistorySearchState = '';
            var spSearchInput = document.getElementById('sp-history-search'); if (spSearchInput) spSearchInput.value = '';
            switchStudentProfileTab('overview');

            // Weekly Report v1 — reset khi mở hồ sơ MỘT học sinh mới, tránh giữ báo cáo tuần của học
            // sinh vừa xem trước đó (đặc biệt tránh xuất nhầm file HTML của học sinh khác).
            activeWeeklyReport = null;
            var wrDateInput = document.getElementById('wr-pick-date'); if (wrDateInput) wrDateInput.value = '';
            var wrExportBtn = document.getElementById('wr-export-btn'); if (wrExportBtn) wrExportBtn.style.display = 'none';
            var wrPreviewBox = document.getElementById('wr-preview-box');
            if (wrPreviewBox) wrPreviewBox.innerHTML = '<div class="sp-empty-state">Chọn một ngày bất kỳ trong tuần rồi bấm "Tạo báo cáo".</div>';

            buildMonthDropdown();
            renderStudentInfoCard(student);
            await loadMonthAttendanceAndFee(); // gọi refreshStudentProfileExtras() ở cuối hàm này
            renderProfileDetails(student);

            if (student._supabaseSource) {
                var schedResult = await loadStudentScheduleRows(student.id);
                if (schedResult.error) {
                    var schedErrEl = document.getElementById('sched-error');
                    schedErrEl.innerText = '⚠️ Không tải được lịch học.\n' + describeSupabaseError(schedResult.error);
                    schedErrEl.style.display = 'block';
                } else {
                    document.getElementById('sched-error').style.display = 'none';
                    renderScheduleList(student);
                }
                // Vẽ lại hero (mục "Buổi tiếp theo") — lúc loadMonthAttendanceAndFee() gọi refreshStudentProfileExtras()
                // ở trên, scheduleRowsCacheByStudent CHƯA kịp nạp, nên fallback lịch cố định lúc đó có thể chưa có.
                renderStudentHero(student);
            } else {
                document.getElementById('sched-list').innerHTML = '<div style="color:var(--text-sub); font-size:13px; padding:8px;">Học sinh local (chưa liên kết Supabase) — chỉnh lịch qua nút "Sửa lớp" ở trang chính.</div>';
            }
        }


        function closeProfilePage() {
            document.getElementById('profile-page-view').style.display = 'none';
            document.getElementById('main-page-view').style.display = 'flex';
            activeProfileClassId = null;
            renderClassList();
        }

        // ================================================================================
        // ===== 1. THÔNG TIN HỌC SINH (public.students) — xem/sửa ngay trên trang hồ sơ =====
        // Schema THẬT của public.students (theo xác nhận của người dùng): id, tutor_id, name, grade,
        // school, subject, parent_name, parent_phone, current_score, target_score, goal, status,
        // start_date, created_at, rate, duration. KHÔNG có cột "phone" hay "notes" — hai cột này
        // TỪNG bị dùng nhầm ở đây và ĐÃ ĐƯỢC GỠ BỎ HOÀN TOÀN. Ô "Số điện thoại" map đúng vào
        // students.parent_phone. Form này CHỈ sửa name/subject/rate/parent_phone — các cột khác đã
        // có sẵn trong schema (grade, school, parent_name, current_score, target_score, goal, status,
        // start_date, duration) nhưng CHƯA được thêm vào form này, để tránh gộp nhiều thay đổi cùng lúc.
        // ================================================================================
        function renderStudentInfoCard(student) {
            document.getElementById('si-view-name').innerText = student.name || '—';
            document.getElementById('si-view-subject').innerText = student.subject || '—';
            document.getElementById('si-view-rate').innerText = (Number(student.rate) || 0) > 0
                ? ((Number(student.rate) * 1000).toLocaleString('vi-VN') + ' đ/buổi') : '—';
            document.getElementById('si-view-parent-phone').innerText = student.parent_phone || '—';

            document.getElementById('si-input-name').value = student.name || '';
            document.getElementById('si-input-subject').value = student.subject || '';
            document.getElementById('si-input-rate').value = student.rate != null ? student.rate : '';
            document.getElementById('si-input-parent-phone').value = student.parent_phone || '';

            // Chỉ Supabase-source mới cho sửa trực tiếp tại đây (ghi thẳng public.students).
            document.getElementById('si-edit-actions-view').style.display = student._supabaseSource ? 'flex' : 'none';
        }

        function enterStudentInfoEditMode() {
            document.getElementById('si-error').style.display = 'none';
            ['name','subject','rate','parent-phone'].forEach(function(f) {
                document.getElementById('si-view-' + f).style.display = 'none';
                document.getElementById('si-input-' + f).style.display = 'block';
            });
            document.getElementById('si-edit-actions-view').style.display = 'none';
            document.getElementById('si-edit-actions-edit').style.display = 'flex';
        }

        function cancelStudentInfoEdit() {
            var student = classList.find(function(c) { return c.id === activeProfileClassId; });
            if (!student) return;
            ['name','subject','rate','parent-phone'].forEach(function(f) {
                document.getElementById('si-view-' + f).style.display = 'block';
                document.getElementById('si-input-' + f).style.display = 'none';
            });
            document.getElementById('si-edit-actions-edit').style.display = 'none';
            document.getElementById('si-edit-actions-view').style.display = student._supabaseSource ? 'flex' : 'none';
            document.getElementById('si-error').style.display = 'none';
            renderStudentInfoCard(student); // reset lại input về giá trị cũ
        }

        // UPDATE public.students trực tiếp (KHÔNG chỉ sửa state/UI). Đọc lại row thật bằng
        // .select().single() để xác nhận Supabase đã ghi đúng, giống cơ chế đã dùng cho rate
        // ở saveEditClass() — KHÔNG được làm hỏng cơ chế đó. Payload UPDATE CHỈ gồm 4 cột có thật:
        // name, subject, rate, parent_phone — TUYỆT ĐỐI KHÔNG gửi phone/notes (không tồn tại trên
        // public.students, gửi lên sẽ gây lỗi PGRST204).
        async function saveStudentInfoCard() {
            var student = classList.find(function(c) { return c.id === activeProfileClassId; });
            if (!student) return;
            var errEl = document.getElementById('si-error');
            errEl.style.display = 'none';

            var name = document.getElementById('si-input-name').value.trim();
            var subject = document.getElementById('si-input-subject').value.trim();
            var rateRaw = document.getElementById('si-input-rate').value;
            var rate = parseInt(rateRaw);
            var parentPhone = document.getElementById('si-input-parent-phone').value.trim();

            if (!name) { errEl.innerText = '⚠️ Vui lòng nhập tên học sinh.'; errEl.style.display = 'block'; return; }
            if (!subject) { errEl.innerText = '⚠️ Vui lòng nhập môn học.'; errEl.style.display = 'block'; return; }
            if (!rateRaw || isNaN(rate) || rate <= 0) { errEl.innerText = '⚠️ Học phí/buổi không hợp lệ.'; errEl.style.display = 'block'; return; }

            if (!student._supabaseSource) {
                // Học sinh local-only: giữ hành vi cũ (chỉ localStorage), không có DB để ghi.
                student.name = name; student.subject = subject; student.rate = rate;
                student.parent_phone = parentPhone;
                saveData();
                cancelStudentInfoEdit();
                return;
            }

            var saveBtn = document.getElementById('si-save-btn');
            saveBtn.disabled = true; saveBtn.innerText = '⏳ Đang lưu...';

            // CHỈ 4 cột có thật trên public.students — KHÔNG có phone, KHÔNG có notes.
            var updResult = await supabaseClient
                .from('students')
                .update({ name: name, subject: subject, rate: rate, parent_phone: parentPhone || null })
                .eq('id', student.id)
                .select()
                .single();

            saveBtn.disabled = false; saveBtn.innerText = '💾 Lưu thông tin';

            if (updResult.error || !updResult.data) {
                console.error('[SAVE STUDENT INFO] FAILED:', updResult.error);
                errEl.innerText = '⚠️ Không thể lưu thông tin học sinh.\n' + describeSupabaseError(updResult.error);
                errEl.style.display = 'block';
                return; // KHÔNG cập nhật UI thành công khi database thất bại
            }

            // Ghi đè bằng dữ liệu THẬT vừa đọc lại từ Supabase — Supabase là source of truth.
            // rate LUÔN lấy từ row.rate vừa đọc lại, không suy đoán, không set về 0.
            var row = updResult.data;
            student.name = row.name != null ? row.name : name;
            student.subject = row.subject != null ? row.subject : subject;
            student.rate = row.rate != null ? row.rate : rate;
            student.parent_phone = row.parent_phone || '';

            renderStudentInfoCard(student);
            cancelStudentInfoEdit();
            renderClassList();
            renderTimeSlots();
            document.getElementById('view-student-title').innerText = 'Hồ sơ học sinh: ' + student.name;
            document.getElementById('view-student-subtitle').innerText = 'Bộ môn: ' + student.subject + ' | Lịch dạy cố định: ' + buildScheduleDisplay(student);
            refreshMonthMoneyDisplay(student); // rate vừa đổi có thể ảnh hưởng số tiền hiển thị
            refreshFeeStatusUI(student);
            refreshFinanceDashboardIfOpen(student); // rate đổi -> Finance Dashboard phải cập nhật ngay nếu đang mở
            refreshReportsPageIfOpen(student); // rate đổi -> Reports phải cập nhật ngay nếu đang mở
            showToast('✅', 'Đã lưu thông tin học sinh', student.name);
        }

        // ================================================================================
        // ===== 2. LỊCH HỌC (public.student_schedules) — thêm/sửa/xóa TỪNG DÒNG trực tiếp =====
        // Khác với saveEditClass() (xóa hết + ghi lại toàn bộ khi sửa lớp), khu vực này thao tác
        // ĐÚNG MỘT DÒNG mỗi lần theo id — an toàn hơn khi chỉ cần sửa 1 buổi trong tuần.
        // ================================================================================
        var scheduleRowsCacheByStudent = {};

        // ----------------------------------------------------------------------
        // "Lịch học cố định" — collapse/expand THUẦN UI trong Student Profile.
        // Mặc định ẩn; bấm nút "📅 Lịch học" ở khu vực hero để mở/đóng. Không đụng tới
        // renderScheduleList/loadStudentScheduleRows/addScheduleRow/conflict detection bên trong —
        // toggle chỉ show/hide đúng cái div bọc ngoài (#sched-collapse-panel).
        function setFixedScheduleSectionOpen(open) {
            var panel = document.getElementById('sched-collapse-panel');
            var btn = document.getElementById('sched-toggle-btn');
            if (!panel) return;
            if (open) {
                panel.classList.add('is-open');
                // reset rồi thêm lại class animation để hiệu ứng chạy mỗi lần mở (kể cả mở liên tiếp)
                panel.classList.remove('sched-anim-in');
                void panel.offsetWidth; // ép reflow để trigger lại animation
                panel.classList.add('sched-anim-in');
            } else {
                panel.classList.remove('is-open');
                panel.classList.remove('sched-anim-in');
            }
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function toggleFixedScheduleSection() {
            var panel = document.getElementById('sched-collapse-panel');
            if (!panel) return;
            setFixedScheduleSectionOpen(!panel.classList.contains('is-open'));
        }

        // ----------------------------------------------------------------------
        // "Kho dữ liệu & Tài liệu giảng dạy" — collapse/expand THUẦN UI, cùng cơ chế với
        // "Lịch học cố định" ở trên. Mặc định ẩn; bấm nút "📁 Tài liệu" ở khu vực hero để mở/đóng.
        // Không đụng tới handleComputerFileSelect/addFileLinkManual/renderFileList (hay tên hàm CRUD
        // tài liệu tương đương) bên trong — toggle chỉ show/hide đúng div bọc ngoài (#docs-collapse-panel).
        function setDocsSectionOpen(open) {
            var panel = document.getElementById('docs-collapse-panel');
            var btn = document.getElementById('docs-toggle-btn');
            if (!panel) return;
            if (open) {
                panel.classList.add('is-open');
                panel.classList.remove('docs-anim-in');
                void panel.offsetWidth; // ép reflow để trigger lại animation mỗi lần mở
                panel.classList.add('docs-anim-in');
            } else {
                panel.classList.remove('is-open');
                panel.classList.remove('docs-anim-in');
            }
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function toggleDocsSection() {
            var panel = document.getElementById('docs-collapse-panel');
            if (!panel) return;
            setDocsSectionOpen(!panel.classList.contains('is-open'));
        }

        async function loadStudentScheduleRows(studentId) {
            try {
                const { data, error } = await supabaseClient
                    .from('student_schedules')
                    .select('*')
                    .eq('student_id', studentId)
                    .order('day_of_week', { ascending: true });
                if (error) {
                    console.error('loadStudentScheduleRows lỗi:', error);
                    return { data: null, error: error };
                }
                scheduleRowsCacheByStudent[studentId] = data || [];
                return { data: data || [], error: null };
            } catch (err) {
                console.error('loadStudentScheduleRows exception:', err);
                return { data: null, error: err };
            }
        }

        function renderScheduleList(student) {
            var box = document.getElementById('sched-list');
            var rows = scheduleRowsCacheByStudent[student.id] || [];
            if (rows.length === 0) {
                box.innerHTML = '<div style="color:var(--text-sub); font-size:13px; padding:8px;">Chưa có lịch học cố định nào. Thêm lịch ở bên dưới.</div>';
                return;
            }
            var dayOptions = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ Nhật'];
            box.innerHTML = '';
            rows.forEach(function(r) {
                var row = document.createElement('div');
                row.className = 'sched-row';
                var daySelect = '<select onchange="updateScheduleRow(\'' + r.id + '\',\'day_of_week\',this.value)">'
                    + dayOptions.map(function(d) { return '<option value="' + d + '"' + (d === r.day_of_week ? ' selected' : '') + '>' + d + '</option>'; }).join('')
                    + '</select>';
                row.innerHTML = daySelect
                    + '<input type="time" value="' + (r.start_time || '') + '" onchange="updateScheduleRow(\'' + r.id + '\',\'start_time\',this.value)">'
                    + '<span style="font-size:12px;color:var(--text-sub);">Thời lượng (giờ):</span>'
                    + '<input type="number" min="0.5" step="0.5" style="width:70px;" value="' + (r.duration != null ? r.duration : '') + '" onchange="updateScheduleRow(\'' + r.id + '\',\'duration\',this.value)">'
                    + '<button class="sched-del-btn" title="Xóa lịch này" onclick="deleteScheduleRow(\'' + r.id + '\')">🗑️</button>';
                box.appendChild(row);
            });
        }

        // Conflict Detection (mục 6 "CREATE SCHEDULE"): dòng lịch mới thuộc CHÍNH học sinh đang mở hồ
        // sơ -> loại trừ tất cả lịch KHÁC của chính học sinh này khỏi so sánh là không đúng tinh thần
        // (đây là dòng MỚI, không phải sửa dòng cũ) nên chỉ truyền excludeStudentId khi cần loại trừ
        // dòng đang sửa; ở đây so với TẤT CẢ học sinh khác (đúng mục 3/9).
        async function addScheduleRow() {
            var student = classList.find(function(c) { return c.id === activeProfileClassId; });
            if (!student || !student._supabaseSource) return;
            var errEl = document.getElementById('sched-error');
            errEl.style.display = 'none';

            var day = document.getElementById('sched-add-day').value;
            var time = document.getElementById('sched-add-time').value;
            var duration = parseFloat(document.getElementById('sched-add-duration').value);

            if (!time) { errEl.innerText = '⚠️ Vui lòng chọn giờ bắt đầu.'; errEl.style.display = 'block'; return; }
            if (isNaN(duration) || duration <= 0) { errEl.innerText = '⚠️ Thời lượng không hợp lệ.'; errEl.style.display = 'block'; return; }

            var conflicts = checkScheduleConflict({ dayName: day, startTime: time, durationHours: duration });
            if (conflicts.length > 0) {
                var endTime = acFloatToTimeStr(timeToFloat(time) + duration);
                acShowConflictWarning(conflicts, { dayName: day, startTime: time, endTime: endTime }, function() {
                    addScheduleRowActual(student, day, time, duration);
                });
                return; // mục 6: KHÔNG âm thầm save
            }
            await addScheduleRowActual(student, day, time, duration);
        }

        async function addScheduleRowActual(student, day, time, duration) {
            var errEl = document.getElementById('sched-error');
            errEl.style.display = 'none';

            var row = { student_id: student.id };
            row[SCHEDULE_FIELDS.day] = day;
            row[SCHEDULE_FIELDS.start] = time;
            row[SCHEDULE_FIELDS.duration] = duration;

            var insResult = await supabaseClient.from('student_schedules').insert(row).select().single();
            if (insResult.error || !insResult.data) {
                console.error('[ADD SCHEDULE] FAILED:', insResult.error);
                errEl.innerText = '⚠️ Không thể thêm lịch học.\n' + describeSupabaseError(insResult.error);
                errEl.style.display = 'block';
                return; // KHÔNG cập nhật UI khi DB thất bại
            }

            var reload = await loadStudentScheduleRows(student.id);
            if (reload.error) {
                errEl.innerText = '⚠️ Đã thêm nhưng không tải lại được lịch học.\n' + describeSupabaseError(reload.error);
                errEl.style.display = 'block';
                return;
            }
            renderScheduleList(student);
            document.getElementById('sched-add-time').value = '';
            await refreshStudentScheduleDisplayEverywhere(student);
            showToast('✅', 'Đã thêm lịch học', day + ' ' + time);
        }

        async function updateScheduleRow(rowId, field, value) {
            var student = classList.find(function(c) { return c.id === activeProfileClassId; });
            if (!student) return;
            var errEl = document.getElementById('sched-error');
            errEl.style.display = 'none';

            var fields = {};
            fields[field] = (field === 'duration') ? parseFloat(value) : value;
            if (field === 'duration' && (isNaN(fields.duration) || fields.duration <= 0)) {
                errEl.innerText = '⚠️ Thời lượng không hợp lệ.';
                errEl.style.display = 'block';
                renderScheduleList(student); // khôi phục lại giá trị cũ trên UI
                return;
            }

            // Conflict Detection (mục 5 "EDIT EXISTING SCHEDULE"): ghép field vừa đổi với dữ liệu
            // HIỆN TẠI của đúng dòng này (từ cache) để có đủ (thứ, giờ, thời lượng) rồi mới check —
            // loại trừ CHÍNH dòng đang sửa (excludeScheduleRowId = rowId), đúng mục 5 ("A edit A
            // không được báo conflict với chính A").
            var rows = scheduleRowsCacheByStudent[student.id] || [];
            var existingRow = rows.find(function(r) { return String(r.id) === String(rowId); });
            if (existingRow) {
                var mergedDay = (field === 'day_of_week') ? value : existingRow.day_of_week;
                var mergedTime = (field === 'start_time') ? value : existingRow.start_time;
                var mergedDuration = (field === 'duration') ? fields.duration : parseFloat(existingRow.duration);
                if (mergedDay && mergedTime && mergedDuration > 0) {
                    var conflicts = checkScheduleConflict({ dayName: mergedDay, startTime: mergedTime, durationHours: mergedDuration, excludeScheduleRowId: rowId });
                    if (conflicts.length > 0) {
                        var endTime = acFloatToTimeStr(timeToFloat(mergedTime) + mergedDuration);
                        acShowConflictWarning(conflicts, { dayName: mergedDay, startTime: mergedTime, endTime: endTime }, function() {
                            updateScheduleRowActual(student, rowId, fields);
                        });
                        renderScheduleList(student); // mục 6: khôi phục UI về giá trị cũ trong lúc chờ Tutor quyết định, KHÔNG âm thầm save
                        return;
                    }
                }
            }
            await updateScheduleRowActual(student, rowId, fields);
        }

        async function updateScheduleRowActual(student, rowId, fields) {
            var errEl = document.getElementById('sched-error');
            errEl.style.display = 'none';

            var updResult = await supabaseClient.from('student_schedules').update(fields).eq('id', rowId).select().single();
            if (updResult.error || !updResult.data) {
                console.error('[UPDATE SCHEDULE] FAILED:', updResult.error);
                errEl.innerText = '⚠️ Không thể lưu thay đổi lịch học.\n' + describeSupabaseError(updResult.error);
                errEl.style.display = 'block';
                var reloadOnErr = await loadStudentScheduleRows(student.id); // khôi phục dữ liệu thật
                if (!reloadOnErr.error) renderScheduleList(student);
                return;
            }

            var reload = await loadStudentScheduleRows(student.id);
            if (!reload.error) renderScheduleList(student);
            await refreshStudentScheduleDisplayEverywhere(student);
            showToast('✅', 'Đã lưu lịch học', '');
        }

        async function deleteScheduleRow(rowId) {
            if (!confirm('Bạn có chắc muốn xóa lịch học này? Hành động này không thể hoàn tác.')) return;
            var student = classList.find(function(c) { return c.id === activeProfileClassId; });
            if (!student) return;
            var errEl = document.getElementById('sched-error');
            errEl.style.display = 'none';

            var delResult = await supabaseClient.from('student_schedules').delete().eq('id', rowId);
            if (delResult.error) {
                console.error('[DELETE SCHEDULE] FAILED:', delResult.error);
                errEl.innerText = '⚠️ Không thể xóa lịch học.\n' + describeSupabaseError(delResult.error);
                errEl.style.display = 'block';
                return;
            }

            var reload = await loadStudentScheduleRows(student.id);
            if (!reload.error) renderScheduleList(student);
            await refreshStudentScheduleDisplayEverywhere(student);
            showToast('✅', 'Đã xóa lịch học', '');
        }

        // Sau khi thêm/sửa/xóa lịch: cập nhật lại classList[].days/startTimes (bộ nhớ) từ dữ liệu
        // THẬT vừa tải lại từ Supabase, rồi làm mới các nơi hiển thị lịch (tiêu đề hồ sơ, lưới điểm
        // danh trong tháng, danh sách lớp) — tránh tình trạng lịch mới thêm không thấy ngay trên UI.
        async function refreshStudentScheduleDisplayEverywhere(student) {
            var rows = scheduleRowsCacheByStudent[student.id] || [];
            student.days = rows.map(function(r) { return r.day_of_week; }).filter(Boolean);
            student.day = student.days[0];
            student.startTimes = rows.map(function(r) { return r.start_time; }).filter(Boolean);
            student.startTime = student.startTimes[0];
            document.getElementById('view-student-subtitle').innerText = 'Bộ môn: ' + student.subject + ' | Lịch dạy cố định: ' + buildScheduleDisplay(student);
            await loadMonthAttendanceAndFee(); // buổi học phụ thuộc lịch cố định -> nạp lại lưới điểm danh
            renderClassList();
        }

        function buildMonthDropdown() {
            var select = document.getElementById('fee-month-select');
            select.innerHTML = '';
            var currentYear = new Date().getFullYear();
            
            // Tạo danh sách 12 tháng
            for(var m=1; m<=12; m++) {
                var val = currentYear + "-" + String(m).padStart(2, '0');
                var opt = document.createElement('option');
                opt.value = val;
                opt.text = "Tháng " + m + " / " + currentYear;
                if(val === currentSelectedMonth) opt.selected = true;
                select.appendChild(opt);
            }
        }

        async function changeFilterMonth() {
            currentSelectedMonth = document.getElementById('fee-month-select').value;
            await loadMonthAttendanceAndFee();
        }

        function getDayOfWeekNumber(dayName) {
            var mapping = {"Chủ Nhật": 0, "Thứ 2": 1, "Thứ 3": 2, "Thứ 4": 3, "Thứ 5": 4, "Thứ 6": 5, "Thứ 7": 6};
            return mapping[dayName] !== undefined ? mapping[dayName] : 1;
        }

        // ================================================================================
        // ===== TODAY'S WORK / LỊCH HÔM NAY =====
        // SOURCE OF TRUTH: student_schedules (đã map sẵn vào classList[].days/startTimes qua
        // mapSupabaseStudentToClass) + public.lessons (qua lessonsCacheByStudent, dùng lại
        // findLessonForDate() hiện có). KHÔNG tạo table/column mới, KHÔNG gọi thêm Supabase khi
        // render (chỉ đọc cache đã có sẵn trong bộ nhớ — mục PERFORMANCE), KHÔNG tự động insert
        // lesson chỉ vì render Dashboard. Ngày "hôm nay" LUÔN lấy theo local date (new Date() +
        // getFullYear/getMonth/getDate), KHÔNG dùng toISOString()/UTC để tránh lệch ngày VN.
        // Chỉ render trong main-page-view (Tutor tự đăng nhập HOẶC Admin đang quản lý MỘT Tutor cụ
        // thể qua openTutorWorkspaceAsAdmin) — classList lúc đó luôn đã được scope đúng 1 Tutor, nên
        // tự động thỏa "Tutor chỉ thấy học sinh của mình" / "Admin dashboard chính không có mục này".
        // ================================================================================
        var DAY_NUMBER_TO_NAME = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        var TODAYS_WORK_ICON = { scheduled: '🟠', completed: '🟢', cancelled: '⚪', absent: '🔴' };

        // Trang hiện tại trong sidebar Tutor ('today' | 'calendar' | 'students' | 'schedule').
        var tpCurrentPage = 'today';
        // Bộ lọc trạng thái đang chọn ở trang "Hôm nay" ('all'|'scheduled'|'completed'|'cancelled'|'absent') —
        // CHỈ là ống kính hiển thị, không đụng tới dữ liệu Supabase.
        var todayFilterStatus = 'all';

        // getLocalIsoDate(): đã chuyển sang js/core/utils.js (STEP 7B), expose qua window.

        // ================================================================================
        // Dựng danh sách buổi học cho MỘT ngày cụ thể (isoDate + tên thứ trong tuần), dùng CHUNG
        // cho "Hôm nay", "Buổi sắp tới" và trang "Lịch dạy" (calendar theo tháng) — tránh viết lại
        // 3 lần cùng một logic map student_schedules + lessons. Giữ NGUYÊN quy tắc cũ: chỉ xét học
        // sinh Supabase (_supabaseSource) có lịch cố định trùng thứ trong ngày đó (idx !== -1);
        // KHÔNG gọi thêm Supabase (chỉ đọc cache), KHÔNG tự insert lesson.
        // ================================================================================
        function getLessonItemsForDate(isoDate, dayName) {
            var items = [];
            var supabaseStudents = classList.filter(function(c) { return c._supabaseSource; });
            supabaseStudents.forEach(function(c) {
                var days = c.days || [];
                var idx = days.indexOf(dayName);
                if (idx === -1) return; // học sinh này không học vào thứ này
                var lesson = findLessonForDate(c.id, isoDate); // KHÔNG insert, chỉ đọc cache
                var scheduleStartTime = (c.startTimes && c.startTimes[idx]) || c.startTime || null;
                var startTime = (lesson && lesson.start_time) ? lesson.start_time : scheduleStartTime;
                var duration = (lesson && lesson.duration != null) ? lesson.duration : c.duration;
                var status = lesson ? lesson.status : 'scheduled'; // chưa có lesson -> mặc định Chưa học
                items.push({ student: c, isoDate: isoDate, dayName: dayName, startTime: startTime, duration: duration, status: status, lesson: lesson || null });
            });
            items.sort(function(a, b) { return (a.startTime || '').localeCompare(b.startTime || ''); });
            return items;
        }

        function renderTodaysWork() {
            var section = document.getElementById('tw-section');
            if (!section) return;

            var supabaseStudents = classList.filter(function(c) { return c._supabaseSource; });
            if (supabaseStudents.length === 0) {
                section.style.display = 'none';
                return;
            }
            section.style.display = 'block';

            var now = new Date();
            var todayIso = getLocalIsoDate(now);
            var todayDayName = DAY_NUMBER_TO_NAME[now.getDay()];

            var dateLabelEl = document.getElementById('tw-date-label');
            if (dateLabelEl) {
                dateLabelEl.innerText = ' — ' + todayDayName + ', ' + String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0');
            }

            // ----- HÔM NAY: mọi học sinh có lịch cố định trùng thứ hôm nay -----
            var todayItems = getLessonItemsForDate(todayIso, todayDayName);

            // ----- BUỔI SẮP TỚI (30 ngày tới, không tính hôm nay) — tính TRƯỚC để dùng chung cho
            // cả khối "Buổi sắp tới" lẫn card "Buổi tiếp theo" bên phải, tránh lặp 2 vòng lặp ngày. -----
            var upcomingAll = [];
            for (var offset = 1; offset <= 60; offset++) {
                var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
                var isoDate = getLocalIsoDate(d);
                var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
                upcomingAll = upcomingAll.concat(getLessonItemsForDate(isoDate, dayName));
            }
            upcomingAll.sort(function(a, b) {
                if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
                return (a.startTime || '').localeCompare(b.startTime || '');
            });

            // ----- 4 KPI nhỏ (mục 13): tính thẳng từ todayItems trong bộ nhớ, không gọi Supabase riêng -----
            var doneCount = todayItems.filter(function(i) { return i.status === 'completed'; }).length;
            var pendingCount = todayItems.filter(function(i) { return i.status !== 'completed' && i.status !== 'cancelled'; }).length;
            var totalHoursToday = 0, totalRevenueToday = 0;
            todayItems.forEach(function(i) {
                if (i.status === 'cancelled') return; // buổi đã huỷ không tính vào giờ/doanh thu dự kiến
                totalHoursToday += Number(i.duration) || 0;
                totalRevenueToday += (Number(i.student.rate) || 0) * 1000;
            });
            var kpiTotalEl = document.getElementById('tw-kpi-total');
            var kpiDoneEl = document.getElementById('tw-kpi-done');
            var kpiHoursEl = document.getElementById('tw-kpi-hours');
            var kpiRevenueEl = document.getElementById('tw-kpi-revenue');
            if (kpiTotalEl) kpiTotalEl.innerText = todayItems.length;
            if (kpiDoneEl) kpiDoneEl.innerText = doneCount;
            if (kpiHoursEl) kpiHoursEl.innerText = (totalHoursToday % 1 === 0 ? totalHoursToday : totalHoursToday.toFixed(1)) + 'h';
            if (kpiRevenueEl) kpiRevenueEl.innerText = totalRevenueToday.toLocaleString('vi-VN') + ' đ';
            void pendingCount; // (đã hiển thị gián tiếp qua KPI "Buổi hôm nay" - "Đã hoàn thành")

            // ----- Action Center V1 ("Cần xử lý") — đọc lại todayItems vừa tính ở trên + các cache
            // đã có sẵn (lessonsCacheByStudent/paymentsCacheByStudent) để tổng hợp việc cần xử lý,
            // KHÔNG gọi thêm Supabase nào (xem renderActionCenter()). -----
            renderActionCenter(now, todayItems);

            // ----- Card "Buổi tiếp theo" (mục 9) -----
            renderNextLessonCard(now, todayItems, upcomingAll);

            // ----- Mini lịch tháng hiện tại (mục 10) -----
            renderTwMiniCalendar(now);

            // Áp dụng bộ lọc trạng thái (chỉ ảnh hưởng hiển thị, không đụng dữ liệu)
            var filteredToday = todayFilterStatus === 'all' ? todayItems : todayItems.filter(function(i) { return i.status === todayFilterStatus; });

            var todayBox = document.getElementById('tw-today-list');
            if (todayBox) {
                if (todayItems.length === 0) {
                    todayBox.innerHTML = '<div class="tw-empty">🎉 Hôm nay không có buổi học.</div>';
                } else if (filteredToday.length === 0) {
                    todayBox.innerHTML = '<div class="tw-empty">Không có buổi học nào khớp bộ lọc đang chọn.</div>';
                } else {
                    todayBox.innerHTML = '';
                    todayBox.appendChild(buildTimelineList(filteredToday, false));
                }
            }

            // Mặc định (bộ lọc "Tất cả"): KHÔNG hiện cancelled/completed trong "Buổi sắp tới" (mục 10).
            // Khi đang lọc theo 1 trạng thái cụ thể: hiện đúng các buổi khớp trạng thái đó.
            var upcoming = (todayFilterStatus === 'all'
                ? upcomingAll.filter(function(i) { return i.status !== 'cancelled' && i.status !== 'completed'; })
                : upcomingAll.filter(function(i) { return i.status === todayFilterStatus; })
            ).slice(0, 5);

            var upcomingBox = document.getElementById('tw-upcoming-list');
            if (upcomingBox) {
                if (upcoming.length === 0) {
                    upcomingBox.innerHTML = '<div class="tw-empty">Không có buổi học sắp tới.</div>';
                } else {
                    upcomingBox.innerHTML = '';
                    upcoming.forEach(function(item) { upcomingBox.appendChild(buildTodaysWorkCard(item, true)); });
                }
            }

            // Nếu trang "Lịch dạy" đang mở, đồng bộ luôn calendar + danh sách ngày đang chọn.
            // Fix regression (mục 10/17): phải render đúng theo tpCalMainView đang chọn — nếu đang ở
            // Week View mà chỉ gọi renderTpCalendar() (Month), buổi học mới tạo/sửa/xoá sẽ KHÔNG cập
            // nhật trên Week View đang hiển thị, làm Week View và Month View lệch dữ liệu.
            if (tpCurrentPage === 'calendar') {
                if (tpCalMainView === 'week') { renderTpWeekView(); } else { renderTpCalendar(); }
            }
        }

        // Card "BUỔI TIẾP THEO" (mục 9) — ưu tiên buổi CHƯA hoàn thành/chưa huỷ gần nhất trong hôm
        // nay; nếu hôm nay đã xong hết hoặc không có buổi nào, tìm tiếp trong upcomingAll (đã tính
        // sẵn ở renderTodaysWork, KHÔNG lặp lại vòng lặp ngày). Chỉ đọc dữ liệu có sẵn, không insert gì.
        function renderNextLessonCard(now, todayItems, upcomingAll) {
            var box = document.getElementById('tw-next-lesson-box');
            if (!box) return;

            var nextToday = todayItems.find(function(i) { return i.status !== 'completed' && i.status !== 'cancelled'; });

            if (nextToday) {
                var c = nextToday.student;
                var endTime = nextToday.startTime ? computeScheduleEndTime(nextToday.startTime, nextToday.duration) : null;
                var timeText = nextToday.startTime ? (nextToday.startTime + (endTime ? ' – ' + endTime : '')) : '—';
                var countdownHtml = '';
                if (nextToday.startTime) {
                    var parts = nextToday.startTime.split(':');
                    var lessonDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0);
                    var diffMin = Math.round((lessonDate.getTime() - now.getTime()) / 60000);
                    if (diffMin > 0) {
                        var hh = Math.floor(diffMin / 60), mm = diffMin % 60;
                        countdownHtml = '<div class="tw-next-countdown">⏳ Còn ' + (hh > 0 ? hh + ' giờ ' : '') + mm + ' phút</div>';
                    } else {
                        countdownHtml = '<div class="tw-next-countdown">🔴 Đã đến giờ học</div>';
                    }
                }
                box.innerHTML = '<div class="tw-next-label">Buổi tiếp theo</div>'
                    + '<div class="tw-next-time">🕐 ' + escapeHtml(timeText) + '</div>'
                    + '<div class="tw-next-student">🎓 ' + escapeHtml(c.name || '') + '</div>'
                    + '<div class="tw-next-subject">📘 ' + escapeHtml(c.subject || '') + '</div>'
                    + countdownHtml
                    + '<button type="button" class="tw-next-view-btn">Xem buổi học</button>';
                box.querySelector('.tw-next-view-btn').addEventListener('click', function() {
                    openLessonDetailModal(c, nextToday.isoDate, nextToday.dayName);
                });
                return;
            }

            // Hôm nay hết buổi (hoặc không có buổi nào) -> tìm buổi gần nhất trong các ngày tới.
            var doneMsgHtml = todayItems.length > 0
                ? '<div class="tw-next-done-msg">🎉 Bạn đã hoàn thành tất cả buổi học hôm nay.</div>'
                : '<div class="tw-next-done-msg">🎉 Hôm nay không có buổi học.</div>';

            var nextUpcoming = upcomingAll.find(function(i) { return i.status !== 'completed' && i.status !== 'cancelled'; });
            if (!nextUpcoming) {
                box.innerHTML = doneMsgHtml;
                return;
            }

            var c2 = nextUpcoming.student;
            var dateParts2 = nextUpcoming.isoDate.split('-');
            box.innerHTML = doneMsgHtml
                + '<div class="tw-next-sub-label">Buổi tiếp theo</div>'
                + '<div class="tw-next-time">🗓️ ' + escapeHtml(nextUpcoming.dayName) + ' · ' + dateParts2[2] + '/' + dateParts2[1] + (nextUpcoming.startTime ? ' · ' + escapeHtml(nextUpcoming.startTime) : '') + '</div>'
                + '<div class="tw-next-student">🎓 ' + escapeHtml(c2.name || '') + '</div>'
                + '<div class="tw-next-subject">📘 ' + escapeHtml(c2.subject || '') + '</div>'
                + '<button type="button" class="tw-next-view-btn">Xem buổi học</button>';
            box.querySelector('.tw-next-view-btn').addEventListener('click', function() {
                openLessonDetailModal(c2, nextUpcoming.isoDate, nextUpcoming.dayName);
            });
        }

        // Mini lịch tháng HIỆN TẠI trên trang "Hôm nay" (mục 10) — LUÔN là tháng thực tế (không có
        // điều hướng ‹›, khác với tpCalYear/tpCalMonth của trang "Lịch dạy" đầy đủ). Chỉ đếm số buổi
        // mỗi ngày bằng getLessonItemsForDate() có sẵn — không gọi thêm Supabase. Click 1 ngày -> nhảy
        // sang trang "Lịch dạy" đúng ngày đó (goToCalendarDate()).
        function renderTwMiniCalendar(now) {
            var grid = document.getElementById('tw-mini-cal-grid');
            if (!grid) return;
            var y = now.getFullYear(), m = now.getMonth();
            var viMonths = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
            var titleEl = document.getElementById('tw-mini-cal-title');
            if (titleEl) titleEl.innerText = viMonths[m] + ' ' + y;

            grid.innerHTML = '';
            var firstDay = new Date(y, m, 1).getDay();
            var startOffset = (firstDay === 0) ? 6 : firstDay - 1;
            var daysInMonth = new Date(y, m + 1, 0).getDate();
            var todayIso = getLocalIsoDate(now);

            for (var i = 0; i < startOffset; i++) {
                var blank = document.createElement('div');
                blank.className = 'tw-mini-cal-cell tw-mc-blank';
                grid.appendChild(blank);
            }
            for (var day = 1; day <= daysInMonth; day++) {
                var d = new Date(y, m, day);
                var isoDate = getLocalIsoDate(d);
                var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
                var items = getLessonItemsForDate(isoDate, dayName);

                var cell = document.createElement('div');
                cell.className = 'tw-mini-cal-cell' + (isoDate === todayIso ? ' tw-mc-today' : '');
                cell.setAttribute('data-iso', isoDate);
                var numSpan = document.createElement('span');
                numSpan.innerText = day;
                cell.appendChild(numSpan);
                if (items.length > 0) {
                    var dotsWrap = document.createElement('div');
                    dotsWrap.className = 'tw-mini-cal-dots';
                    items.slice(0, 3).forEach(function() { dotsWrap.appendChild(document.createElement('span')); });
                    cell.appendChild(dotsWrap);
                }
                cell.addEventListener('click', function() { goToCalendarDate(this.getAttribute('data-iso')); });
                grid.appendChild(cell);
            }
        }

        // Nhảy từ Today/Mini-calendar sang trang "Lịch dạy" đúng ngày đã click (mục 10) — tái sử dụng
        // switchTutorPage()/renderTpCalendar() hiện có, không tạo route mới.
        function goToCalendarDate(isoDate) {
            var parts = isoDate.split('-');
            tpCalYear = parseInt(parts[0], 10);
            tpCalMonth = parseInt(parts[1], 10) - 1;
            tpCalSelectedIso = isoDate;
            // Fix regression (mục 17): hành vi gốc của thao tác này là mở Month View + panel
            // "danh sách buổi của ngày" (day-list card, chỉ hiển thị ở Month View). Nếu người dùng
            // đang ở Week View lúc bấm từ mini-calendar/Today, phải đưa về Month View trước để giữ
            // đúng hành vi cũ, tránh mở "Lịch dạy" mà day-list card lại đang bị ẩn.
            if (tpCalMainView !== 'month') { switchTpCalMainView('month'); }
            switchTutorPage('calendar');
        }

        // Nhảy từ Action Center ("Ngày mai") sang trang "Lịch dạy" ở đúng Week View chứa isoDate —
        // tái sử dụng switchTpCalMainView('week', isoDate) + switchTutorPage('calendar') hiện có,
        // KHÔNG tạo Calendar/route mới (mục D "TOMORROW PREVIEW").
        function goToCalendarDateAsWeek(isoDate) {
            switchTpCalMainView('week', isoDate);
            switchTutorPage('calendar');
        }

        // goToAddStudent() đã tách sang js/students/students.js (STEP 7C). Không đổi behavior.


        // Sidebar/bottom-nav "📊 Báo cáo" — DASHBOARD/REPORTS SEPARATION V1: mở trang Báo cáo RIÊNG
        // BIỆT (#reports-page-view/openReportsPage()), KHÔNG còn mở lại Finance Dashboard rồi cuộn
        // như trước (section phân tích đã được chuyển hẳn khỏi Finance Dashboard — xem mục 5/6).
        async function openTutorReports() {
            await openReportsPage();
        }

        // Bọc danh sách card thành timeline (chấm tròn + đường nối dọc bên trái) — dùng cho khối
        // "Hôm nay". "Buổi sắp tới" và Calendar vẫn dùng danh sách phẳng như cũ (buildTodaysWorkCard).
        function buildTimelineList(items, showDate) {
            var wrap = document.createElement('div');
            wrap.className = 'tw-timeline';
            items.forEach(function(item) {
                var row = document.createElement('div');
                row.className = 'tw-tl-row';
                var rail = document.createElement('div');
                rail.className = 'tw-tl-rail';
                var dot = document.createElement('div');
                dot.className = 'tw-tl-dot st-' + (item.status || 'scheduled');
                var line = document.createElement('div');
                line.className = 'tw-tl-line';
                rail.appendChild(dot);
                rail.appendChild(line);
                var body = document.createElement('div');
                body.className = 'tw-tl-body';
                body.appendChild(buildTodaysWorkCard(item, showDate));
                row.appendChild(rail);
                row.appendChild(body);
                wrap.appendChild(row);
            });
            return wrap;
        }

        // Đổi bộ lọc trạng thái ở trang "Hôm nay" — chỉ set state UI rồi render lại, KHÔNG gọi Supabase.
        function setTodayFilter(status) {
            todayFilterStatus = status;
            document.querySelectorAll('.tw-filter-btn[data-tw-filter]').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tw-filter') === status);
            });
            renderTodaysWork();
        }

        // Chuyển trang trong sidebar Tutor (today/calendar/students/schedule) — chỉ show/hide các
        // page đã có sẵn trong DOM, KHÔNG tạo route mới, KHÔNG gọi lại Supabase khi chuyển page
        // (dữ liệu đã có sẵn trong classList/lessonsCacheByStudent).
        function switchTutorPage(page) {
            document.querySelectorAll('.tp-nav-btn[data-tp-page], .tp-bottom-nav-btn[data-tp-page]').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tp-page') === page);
            });
            document.querySelectorAll('.tp-page').forEach(function(el) {
                el.classList.toggle('active', el.id === 'tp-page-' + page);
            });
            tpCurrentPage = page;
            if (page === 'today') renderTodaysWork();
            else if (page === 'calendar') {
                // Fix regression: trang "Lịch dạy" phải render ĐÚNG view đang chọn (Month/Week) khi
                // quay lại trang, không được luôn ép về renderTpCalendar() (mục 17 — nếu không, khi
                // rời trang lúc đang ở Week View rồi quay lại, Week View sẽ hiển thị dữ liệu CŨ vì
                // không được render lại, dù Month grid ẩn bên dưới vẫn âm thầm cập nhật).
                applyTpCalMainViewDisplay();
                if (tpCalMainView === 'week') { renderTpWeekView(); } else { renderTpCalendar(); }
            }
            else if (page === 'settings') renderSettingsPage();
            else if (page === 'students') applyScheduleDefaultsToAddForm(); // mục 5: chỉ set giá trị mặc định cho form thêm mới, không đổi dữ liệu cũ
            else if (page === 'group-classes') loadGroupClassesIfNeeded(); // STEP 11E: load Supabase 1 lần rồi renderGroupClassList(), KHÔNG query lại mỗi lần chuyển tab
        }

        // Áp "Thời lượng mặc định" đã lưu trong Settings vào select-duration của form "Thêm Lớp Mới"
        // (mục 5) — chỉ đổi lựa chọn MẶC ĐỊNH khi mở form, KHÔNG đụng lịch/học sinh đã có.
        function applyScheduleDefaultsToAddForm() {
            var sel = document.getElementById('select-duration');
            if (sel) sel.value = getTutorSettings().defaultDuration || '2';
        }

        // ================================================================================
        // ===== TRANG "CÀI ĐẶT GIA SƯ" (tp-page-settings) =====
        // Preference cá nhân CHƯA có cột riêng trên Supabase (compact/defaultDuration/
        // weekStart/bio) -> lưu localStorage theo key gsm_tutor_settings_<tutorId|currentUser>, đúng
        // cơ chế đã dùng cho theme/notif/last-sync trong app (KHÔNG tạo cơ chế storage thứ hai).
        // Tên hiển thị + số điện thoại THÌ ĐÃ có cột thật trên Supabase (tutors.display_name,
        // tutors.phone) nên ghi thẳng vào đó cho phiên Supabase — xem saveSettingsProfile().
        // ================================================================================
        var SETTINGS_DEFAULTS = { compact: false, defaultDuration: '2', weekStart: '1', bio: '' };

        function getTutorSettingsKey() {
            return 'gsm_tutor_settings_' + (activeTutorId || currentUser || 'guest');
        }
        function getTutorSettings() {
            try {
                var raw = localStorage.getItem(getTutorSettingsKey());
                return raw ? Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(raw)) : Object.assign({}, SETTINGS_DEFAULTS);
            } catch (e) {
                return Object.assign({}, SETTINGS_DEFAULTS);
            }
        }
        function saveTutorSettingsPatch(patch) {
            var merged = Object.assign({}, getTutorSettings(), patch);
            localStorage.setItem(getTutorSettingsKey(), JSON.stringify(merged));
            return merged;
        }

        // Ngày mặc định khi mở "Lịch rảnh hàng tuần" (mục 5 — chỉ ảnh hưởng lựa chọn MẶC ĐỊNH, KHÔNG
        // đổi dữ liệu lịch cũ). Dùng để thay các chỗ trước đây hard-code toggleDay('Thứ 2').
        function getDefaultDayView() {
            return getTutorSettings().weekStart === '0' ? 'Chủ Nhật' : 'Thứ 2';
        }

        // Badge tự động lưu (mục 4 nâng cấp Settings) — khi 1 preference local thay đổi, hiện "✓ Đã lưu"
        // trong ~1.2s rồi quay lại text mặc định "✓ Tự động lưu". Không có nút Save riêng cho các
        // preference này (compact/defaultDuration/weekStart/bio) vì đã autosave.
        function flashAutosaveBadge() {
            var badge = document.getElementById('settings-autosave-badge');
            if (!badge) return;
            badge.innerText = '✓ Đã lưu';
            badge.style.opacity = '1';
            clearTimeout(flashAutosaveBadge._t);
            flashAutosaveBadge._t = setTimeout(function() {
                badge.style.opacity = '0';
                setTimeout(function() { badge.innerText = '✓ Tự động lưu'; }, 300);
            }, 1300);
        }

        // Áp compact mode ngay khi vào app (mục 3) — đọc setting đã lưu, KHÔNG cần vào trang Settings.
        function applyCompactModeFromSettings() {
            document.body.classList.toggle('compact-mode', !!getTutorSettings().compact);
        }

        function settingsSetTheme(mode) {
            var isLight = document.body.classList.contains('light-mode');
            if ((mode === 'light') !== isLight) toggleTheme(); // tái sử dụng toggleTheme() hiện có, không tạo hệ theme thứ hai
            updateSettingsThemeButtons();
        }
        function updateSettingsThemeButtons() {
            var isLight = document.body.classList.contains('light-mode');
            var darkBtn = document.getElementById('settings-theme-dark-btn');
            var lightBtn = document.getElementById('settings-theme-light-btn');
            if (darkBtn) darkBtn.classList.toggle('active', !isLight);
            if (lightBtn) lightBtn.classList.toggle('active', isLight);
        }

        function settingsSetCompact(checked) {
            document.body.classList.toggle('compact-mode', checked);
            saveTutorSettingsPatch({ compact: checked });
            flashAutosaveBadge();
        }

        // ================================================================================
        // ===== ACTION CENTER V1 (trang "Hôm nay" — mục "Cần xử lý") =====
        // Tổng hợp các việc CẦN XỬ LÝ NGAY từ dữ liệu đã có sẵn trong bộ nhớ: todayItems (đã tính
        // trong renderTodaysWork), lessonsCacheByStudent/paymentsCacheByStudent (đã nạp sẵn từ
        // loadTutorClassList() lúc đăng nhập, qua getMoneyRemainingInMonth()), getLessonItemsForDate().
        // KHÔNG tạo bảng/cột Supabase mới, KHÔNG query Supabase riêng cho từng card (không N+1),
        // KHÔNG tạo Lesson Detail/Finance/Calendar/design system mới — mọi CTA đều mở lại đúng
        // modal/trang hiện có. V1 chỉ hỗ trợ 4 loại action (mục 2 A-D); CONFLICT (mục E) CHƯA
        // implement trong task này.
        // ================================================================================

        // Ngưỡng "sắp bắt đầu" (mục 2A) — tái sử dụng ĐÚNG cấu hình thông báo trình duyệt đã có
        // (gsm_notif_<user>.minutesBefore, mặc định 60 phút — xem toggleBrowserNotif()), không tạo
        // hằng số ngưỡng riêng cho Action Center.
        function acGetSoonThresholdMinutes() {
            try {
                var cfg = JSON.parse(localStorage.getItem('gsm_notif_' + currentUser) || '{}');
                return (typeof cfg.minutesBefore === 'number' && cfg.minutesBefore > 0) ? cfg.minutesBefore : 60;
            } catch (e) { return 60; }
        }

        // Mục 2C OUTSTANDING PAYMENT — dùng ĐÚNG getMoneyRemainingInMonth() đã có (đọc
        // lessonsCacheByStudent + paymentsCacheByStudent qua getPeriodTotalPaid()), không tạo logic
        // tính tiền mới. Chỉ tính tháng hiện tại — đúng khái niệm "còn phải thu" mà Finance Dashboard
        // đang dùng (fin-cur-month-unpaid).
        function acGetOutstandingPaymentItems(now) {
            var curMonthKey = getMonthKey(now.getFullYear(), now.getMonth());
            var out = [];
            classList.filter(function(c) { return c._supabaseSource; }).forEach(function(student) {
                var remainingVnd = getMoneyRemainingInMonth(student, curMonthKey);
                if (remainingVnd > 0) out.push({ student: student, remainingVnd: remainingVnd });
            });
            out.sort(function(a, b) { return b.remainingVnd - a.remainingVnd; });
            return out;
        }

        // Mục 2D TOMORROW PREVIEW — đọc getLessonItemsForDate() đã có cho đúng 1 ngày (ngày mai),
        // không tính lịch/nguồn dữ liệu mới. Bỏ qua buổi đã huỷ (giống cách tính KPI "Buổi hôm nay").
        function acGetTomorrowPreview(now) {
            var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            var isoDate = getLocalIsoDate(d);
            var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
            var items = getLessonItemsForDate(isoDate, dayName).filter(function(i) { return i.status !== 'cancelled'; });
            if (items.length === 0) return null;
            var totalHours = 0;
            items.forEach(function(i) { totalHours += Number(i.duration) || 0; });
            return { isoDate: isoDate, dayName: dayName, count: items.length, totalHours: totalHours };
        }

        // Dựng 1 action card DOM — tái sử dụng bố cục/màu sắc đã có trong app (block card + button
        // dạng .tw-quick-btn), chỉ thêm 1 dải màu "priority indicator" bên trái (mục 4), KHÔNG tạo
        // design system mới. opts.lines nhận HTML đã escape sẵn ở nơi gọi.
        function acBuildCard(opts) {
            var card = document.createElement('div');
            card.className = 'ac-card';
            card.style.borderLeftColor = opts.accentColor || 'var(--accent)';
            var body = document.createElement('div');
            body.className = 'ac-card-body';
            var titleEl = document.createElement('div');
            titleEl.className = 'ac-card-title';
            titleEl.innerHTML = (opts.icon ? opts.icon + ' ' : '') + escapeHtml(opts.title);
            body.appendChild(titleEl);
            (opts.lines || []).forEach(function(line) {
                var lineEl = document.createElement('div');
                lineEl.className = 'ac-card-line';
                lineEl.innerHTML = line;
                body.appendChild(lineEl);
            });
            card.appendChild(body);
            if (opts.ctaLabel) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ac-card-btn';
                btn.innerText = opts.ctaLabel;
                btn.addEventListener('click', opts.onClick);
                card.appendChild(btn);
            }
            return card;
        }

        // Tổng hợp + sắp xếp theo mục 3 (1.lesson sắp bắt đầu 2.payment còn thiếu 3.tomorrow preview)
        // + render — gọi từ CUỐI phần tính todayItems trong renderTodaysWork() nên LUÔN cập nhật mỗi
        // khi Today page render lại (complete lesson / ghi payment đều gọi lại renderTodaysWork() sẵn
        // có) — KHÔNG cần realtime subscription mới (mục 7).
        function renderActionCenter(now, todayItems) {
            var wrap = document.getElementById('ac-section');
            var list = document.getElementById('ac-list');
            if (!wrap || !list) return;

            var threshold = acGetSoonThresholdMinutes();
            var cards = [];

            // ---- A. UPCOMING LESSON: buổi hôm nay chưa hoàn thành/huỷ, còn <= ngưỡng phút ----
            var upcomingSoon = todayItems.filter(function(i) {
                if (i.status === 'completed' || i.status === 'cancelled' || !i.startTime) return false;
                var parts = i.startTime.split(':');
                var lessonDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0);
                i._acDiffMin = Math.round((lessonDate.getTime() - now.getTime()) / 60000);
                return i._acDiffMin > 0 && i._acDiffMin <= threshold;
            }).sort(function(a, b) { return a._acDiffMin - b._acDiffMin; });

            upcomingSoon.forEach(function(item) {
                var c = item.student;
                var hh = Math.floor(item._acDiffMin / 60), mm = item._acDiffMin % 60;
                var countdownText = (hh > 0 ? hh + ' giờ ' : '') + mm + ' phút';
                cards.push(acBuildCard({
                    icon: '🔴', title: 'Buổi học sắp bắt đầu',
                    lines: [
                        '<strong>' + escapeHtml(c.name || '') + '</strong>' + (c.subject ? ' · ' + escapeHtml(c.subject) : '') + ' · ' + escapeHtml(item.startTime),
                        'Còn ' + countdownText
                    ],
                    ctaLabel: 'Mở buổi học', accentColor: '#ef4444',
                    onClick: function() { openLessonDetailModal(c, item.isoDate, item.dayName); }
                }));
            });

            // ---- C. OUTSTANDING PAYMENT (group nếu nhiều) ----
            var paymentDue = acGetOutstandingPaymentItems(now);
            if (paymentDue.length > 0) {
                var firstP = paymentDue[0];
                var extraP = paymentDue.length > 1 ? ' (và ' + (paymentDue.length - 1) + ' học sinh khác)' : '';
                cards.push(acBuildCard({
                    icon: '💰', title: 'Còn phải thu',
                    lines: [
                        '<strong>' + escapeHtml(firstP.student.name || '') + '</strong>' + extraP,
                        firstP.remainingVnd.toLocaleString('vi-VN') + ' đ'
                    ],
                    ctaLabel: 'Xem tài chính', accentColor: '#00cca3',
                    onClick: function() { openFinanceDashboard(); }
                }));
            }

            // ---- D. TOMORROW PREVIEW ----
            var tomorrow = acGetTomorrowPreview(now);
            if (tomorrow) {
                cards.push(acBuildCard({
                    icon: '📅', title: 'Ngày mai',
                    lines: [tomorrow.count + ' buổi · ' + (tomorrow.totalHours % 1 === 0 ? tomorrow.totalHours : tomorrow.totalHours.toFixed(1)) + ' giờ dạy'],
                    ctaLabel: 'Xem lịch', accentColor: '#38bdf8',
                    onClick: function() { goToCalendarDateAsWeek(tomorrow.isoDate); }
                }));
            }

            // ---- Render: giữ đúng thứ tự ưu tiên A→D vừa push, giới hạn tối đa 6 card để Today page
            // không quá dài (mục 3). Section luôn hiển thị: có action -> danh sách card; không có ->
            // empty state nhẹ (mục 1). ----
            list.innerHTML = '';
            wrap.style.display = '';
            if (cards.length === 0) {
                list.innerHTML = '<div class="tw-empty">🎉 Bạn không có việc nào cần xử lý.</div>';
                return;
            }
            cards.slice(0, 6).forEach(function(c) { list.appendChild(c); });
        }

        // Tìm trong cài đặt (mục 11) — chỉ highlight + scrollIntoView tới đúng block-card, KHÔNG ẩn/lọc
        // card nào. Đọc data-settings-keywords đã gắn sẵn trên từng block-card trong tp-page-settings.
        function settingsSearchHandle(query) {
            clearTimeout(settingsSearchHandle._t);
            var q = (query || '').trim().toLowerCase();
            if (!q) return;
            settingsSearchHandle._t = setTimeout(function() {
                var cards = document.querySelectorAll('#tp-page-settings [data-settings-section]');
                var best = null;
                cards.forEach(function(card) {
                    var kw = (card.getAttribute('data-settings-keywords') || '') + ' ' + card.innerText.toLowerCase();
                    if (!best && kw.toLowerCase().indexOf(q) !== -1) best = card;
                });
                if (best) {
                    best.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    best.classList.remove('settings-section-highlight');
                    void best.offsetWidth; // restart animation nếu tìm lại cùng section
                    best.classList.add('settings-section-highlight');
                }
            }, 150); // realtime nhưng debounce nhẹ để không giật khi gõ nhanh
        }

        // Đặt lại cài đặt (mục 12) — CHỈ reset preference local (compact/defaultDuration/
        // weekStart/bio) + theme về mặc định. KHÔNG đụng tới students/lessons/payments/schedule/account/
        // Supabase data. Confirm 2 bước theo đúng yêu cầu.
        function settingsResetToDefaults() {
            if (!confirm('Bạn có chắc muốn đặt lại các tuỳ chọn giao diện và preference về mặc định?')) return;
            if (!confirm('Xác nhận lần cuối: thao tác này sẽ đặt lại giao diện, thông báo và tuỳ chọn lịch về mặc định trên thiết bị này. Dữ liệu học sinh, lịch học và tài chính sẽ KHÔNG bị ảnh hưởng. Tiếp tục?')) return;

            localStorage.setItem(getTutorSettingsKey(), JSON.stringify(SETTINGS_DEFAULTS));
            document.body.classList.remove('compact-mode');
            // Theme mặc định của app là "dark" — chỉ đổi nếu đang light, tái sử dụng toggleTheme() hiện có.
            if (document.body.classList.contains('light-mode')) toggleTheme();

            renderSettingsPage();
            showToast('✅', 'Đã đặt lại cài đặt', 'Giao diện và preference đã về mặc định.');
        }

        // Vẽ toàn bộ trang Settings từ dữ liệu hiện có (Supabase currentTutor/profiles khi là phiên
        // Supabase, gsm_users khi là tài khoản local cũ) + tutor settings (localStorage).
        function renderSettingsPage() {
            var s = getTutorSettings();
            var displayName, email, phone;
            var searchInput = document.getElementById('settings-search-input');
            if (searchInput) searchInput.value = '';

            if (isSupabaseTutorSession) {
                displayName = (currentTutor && currentTutor.display_name) || '';
                phone = (currentTutor && currentTutor.phone) || '';
                email = currentTutorAuthEmail || '';
            } else {
                var users = getUsers();
                var info = users[currentUser] || {};
                displayName = info.displayName || currentUser || '';
                phone = info.phone || '';
                email = currentUser || '';
            }

            document.getElementById('settings-input-name').value = displayName;
            document.getElementById('settings-input-phone').value = phone;
            document.getElementById('settings-input-bio').value = s.bio || '';
            document.getElementById('settings-account-email').innerText = email || '—';
            document.getElementById('settings-profile-name-preview').innerText = displayName || '(Chưa đặt tên)';
            document.getElementById('settings-profile-email-preview').innerText = email || '';
            document.getElementById('settings-profile-error').style.display = 'none';

            // Avatar preview — tái sử dụng ĐÚNG dữ liệu avatar (emoji/màu) của hệ thống avatar hiện có.
            var users2 = getUsers(); var avInfo = users2[currentUser] || {};
            var avPrev = document.getElementById('settings-avatar-preview');
            if (avInfo.avatarEmoji) { avPrev.innerText = avInfo.avatarEmoji; avPrev.style.background = '#1a2a3a'; }
            else { avPrev.innerText = (displayName || currentUser || '?').charAt(0).toUpperCase(); avPrev.style.background = avInfo.avatarColor || AVATAR_COLORS[0]; }

            updateSettingsThemeButtons();
            document.getElementById('settings-compact-toggle').checked = !!s.compact;
            document.getElementById('settings-default-duration').value = s.defaultDuration || '2';
            document.getElementById('settings-week-start').value = s.weekStart || '1';

            // Trạng thái thông báo trình duyệt — đọc ĐÚNG cfg đã dùng bởi requestBrowserNotification()/
            // toggleBrowserNotif(), không tạo cờ trạng thái riêng.
            var notifStatusEl = document.getElementById('settings-browser-notif-status');
            var notifBtn = document.getElementById('settings-browser-notif-btn');
            if (!('Notification' in window)) {
                notifStatusEl.innerText = '⚠️ Trình duyệt không hỗ trợ'; notifStatusEl.style.color = 'var(--text-sub)';
                notifBtn.style.display = 'none';
            } else if (Notification.permission === 'denied') {
                notifStatusEl.innerText = '🚫 Đã bị chặn — bật lại trong Cài đặt trình duyệt'; notifStatusEl.style.color = '#ef4444';
                notifBtn.style.display = 'none';
            } else {
                var notifCfg = JSON.parse(localStorage.getItem('gsm_notif_' + currentUser) || '{"enabled":false}');
                var isOn = Notification.permission === 'granted' && notifCfg.enabled;
                notifStatusEl.innerText = isOn ? '✓ Đang bật' : 'Đang tắt';
                notifStatusEl.style.color = isOn ? '#10b981' : 'var(--text-sub)';
                notifBtn.innerText = isOn ? '🔕 Tắt thông báo' : '🔔 Bật thông báo';
                notifBtn.style.display = 'inline-block';
            }

            // Trạng thái Telegram — tái sử dụng getTgConfig() hiện có, không đọc/ghi config riêng.
            var tgCfg = getTgConfig();
            document.getElementById('settings-tg-status-desc').innerText = (tgCfg.botToken && tgCfg.chatId && tgCfg.enabled)
                ? '✓ Đã kết nối — nhắc trước ' + tgCfg.minutesBefore + ' phút'
                : (tgCfg.botToken ? 'Đã nhập token nhưng chưa bật' : 'Chưa kết nối.');

            // Lần đồng bộ gần nhất — ĐÚNG key đã dùng bởi syncToCloud()/exportBackup(), không tạo cờ mới.
            var lastSync = localStorage.getItem('gsm_last_sync_' + currentUser);
            document.getElementById('settings-last-sync').innerText = lastSync ? 'Lần đồng bộ gần nhất: ' + lastSync : 'Chưa từng sao lưu.';

            // Ẩn nút đổi mật khẩu kiểu local nếu là phiên Supabase — phiên Supabase dùng modal riêng
            // (xem settingsOpenChangePassword()).
        }

        // Lưu "Hồ sơ gia sư" (mục 2). Với phiên Supabase: UPDATE tutors.display_name/phone. Bảng
        // `tutors` ĐÃ CÓ policy "Tutors can update own tutor profile" (USING/WITH CHECK: user_id =
        // auth.uid()), cộng với trigger chặn Tutor tự đổi id/user_id/status/created_at — nên Tutor tự
        // sửa display_name/phone của chính mình hoạt động bình thường. Vẫn giữ RELOAD lại tutors sau
        // khi UPDATE để xác nhận thật (không giả vờ đã lưu thành công nếu vì lý do gì đó dữ liệu không
        // đổi — an toàn hơn là tin tưởng mù kết quả UPDATE). bio KHÔNG có cột trên Supabase -> luôn lưu
        // localStorage (tutor settings).
        async function saveSettingsProfile() {
            var name = document.getElementById('settings-input-name').value.trim();
            var phone = document.getElementById('settings-input-phone').value.trim();
            var bio = document.getElementById('settings-input-bio').value.trim();
            var errEl = document.getElementById('settings-profile-error');
            var saveBtn = document.getElementById('settings-save-profile-btn');
            errEl.style.display = 'none';

            if (!name) { errEl.innerText = '⚠️ Vui lòng nhập tên hiển thị.'; errEl.style.display = 'block'; return; }

            saveTutorSettingsPatch({ bio: bio }); // bio: luôn localStorage, không có cột Supabase

            saveBtn.disabled = true;
            saveBtn.innerText = 'Đang lưu...';

            if (isSupabaseTutorSession && activeTutorId) {
                var result = await updateTutorProfileRow(activeTutorId, { display_name: name, phone: phone });
                saveBtn.disabled = false;
                saveBtn.innerText = '💾 Lưu hồ sơ';
                if (result.error) {
                    errEl.innerText = '⚠️ Không thể lưu hồ sơ.\n' + describeSupabaseError(result.error);
                    errEl.style.display = 'block';
                    return;
                }
                if (!result.confirmed) {
                    // UPDATE không báo lỗi nhưng dữ liệu trên Supabase KHÔNG đổi. Bảng tutors hiện ĐÃ
                    // có policy cho Tutor tự UPDATE hàng của mình, nên trường hợp này không còn do
                    // thiếu quyền như trước — có thể do lỗi mạng/đồng bộ tạm thời. Báo thật, không giả
                    // vờ đã lưu (mục 14: không tạo mock functionality).
                    errEl.innerText = '⚠️ Không lưu được lên hệ thống: dữ liệu chưa được cập nhật, vui lòng thử lại. Phần "Giới thiệu ngắn" đã được lưu trên thiết bị này.';
                    errEl.style.display = 'block';
                    return;
                }
                currentTutor.display_name = name;
                currentTutor.phone = phone;
                document.getElementById('nav-username-display').innerText = name;
                document.getElementById('nav-avatar-text').innerText = (name || 'T').charAt(0).toUpperCase();
                renderSettingsPage();
                showToast('✅', 'Đã lưu hồ sơ', name);
            } else {
                // AUTH 2.0 Phase 3: không còn phiên local-only nào được hỗ trợ — mọi phiên hợp lệ
                // giờ đều phải là Supabase (Tutor/Admin). Nếu rơi vào đây nghĩa là state bất thường
                // (ví dụ session đã hết hạn) — báo lỗi thay vì âm thầm ghi vào gsm_users.
                saveBtn.disabled = false;
                saveBtn.innerText = '💾 Lưu hồ sơ';
                errEl.innerText = '⚠️ Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.';
                errEl.style.display = 'block';
            }
        }

        // UPDATE 1 dòng tutors theo id, rồi RELOAD lại để xác nhận thật (xem giải thích ở
        // saveSettingsProfile). confirmed=true chỉ khi giá trị đọc lại KHỚP với giá trị vừa gửi.
        async function updateTutorProfileRow(tutorId, fields) {
            try {
                await supabaseClient.from('tutors').update(fields).eq('id', tutorId);
                const { data: reloaded, error: reloadError } = await supabaseClient
                    .from('tutors').select('*').eq('id', tutorId).maybeSingle();
                if (reloadError) return { error: reloadError, confirmed: false };
                var confirmed = !!reloaded && reloaded.display_name === fields.display_name && (reloaded.phone || '') === (fields.phone || '');
                if (confirmed) currentTutor = reloaded;
                return { error: null, confirmed: confirmed };
            } catch (err) {
                return { error: err, confirmed: false };
            }
        }

        // Đổi mật khẩu (mục 6) — PHẢI dùng đúng hệ auth hiện tại của phiên đang đăng nhập, KHÔNG tạo
        // auth mới: phiên Supabase -> supabaseClient.auth (modal riêng bên dưới); tài khoản local cũ ->
        // đúng modal/hàm openProfileSettings('password') đã có từ trước.
        function settingsOpenChangePassword() {
            if (isSupabaseTutorSession || isSupabaseAdminSession) {
                document.getElementById('sp-old-pw').value = '';
                document.getElementById('sp-new-pw').value = '';
                document.getElementById('sp-confirm-pw').value = '';
                document.getElementById('sp-error').style.display = 'none';
                document.getElementById('supabase-password-modal').classList.add('open');
            } else {
                openProfileSettings('password');
            }
        }
        function closeSupabasePasswordModal() {
            document.getElementById('supabase-password-modal').classList.remove('open');
        }
        async function saveSupabasePassword() {
            var oldPw = document.getElementById('sp-old-pw').value;
            var newPw = document.getElementById('sp-new-pw').value;
            var confirmPw = document.getElementById('sp-confirm-pw').value;
            var errEl = document.getElementById('sp-error');
            var saveBtn = document.getElementById('sp-save-btn');
            errEl.style.display = 'none';

            if (!oldPw || !newPw) { errEl.innerText = '⚠️ Vui lòng nhập đầy đủ.'; errEl.style.display = 'block'; return; }
            if (getPwStrength(newPw).score < 2) { errEl.innerText = '⚠️ Mật khẩu mới quá yếu.'; errEl.style.display = 'block'; return; }
            if (newPw !== confirmPw) { errEl.innerText = '⚠️ Mật khẩu xác nhận không khớp.'; errEl.style.display = 'block'; return; }

            saveBtn.disabled = true; saveBtn.innerText = 'Đang cập nhật mật khẩu...';
            try {
                const { data: sessionData } = await supabaseClient.auth.getSession();
                var email = sessionData && sessionData.session && sessionData.session.user ? sessionData.session.user.email : null;
                if (!email) { errEl.innerText = '⚠️ Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'; errEl.style.display = 'block'; saveBtn.disabled = false; saveBtn.innerText = '💾 Đổi mật khẩu'; return; }

                // Xác thực mật khẩu CŨ bằng cách re-authenticate qua đúng supabaseClient.auth hiện có
                // (không tạo cơ chế xác thực song song) trước khi đổi mật khẩu mới.
                const { error: reauthError } = await supabaseClient.auth.signInWithPassword({ email: email, password: oldPw });
                if (reauthError) {
                    errEl.innerText = '❌ Mật khẩu hiện tại không đúng.'; errEl.style.display = 'block';
                    saveBtn.disabled = false; saveBtn.innerText = '💾 Đổi mật khẩu'; return;
                }

                const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPw });
                saveBtn.disabled = false; saveBtn.innerText = '💾 Đổi mật khẩu';
                if (updateError) {
                    console.error('saveSupabasePassword: updateUser FAILED:', updateError.message);
                    errEl.innerText = '⚠️ Không thể đổi mật khẩu. Vui lòng thử lại.';
                    errEl.style.display = 'block';
                    return;
                }
                closeSupabasePasswordModal();
                showToast('🔑', 'Đổi mật khẩu thành công', 'Mật khẩu mới đã được lưu trên hệ thống.');
            } catch (err) {
                saveBtn.disabled = false; saveBtn.innerText = '💾 Đổi mật khẩu';
                errEl.innerText = '⚠️ Có lỗi xảy ra. Vui lòng thử lại.'; errEl.style.display = 'block';
                console.error('saveSupabasePassword exception:', err);
            }
        }

        // Dựng 1 card dùng CHUNG cho "Hôm nay", "Buổi sắp tới" và "Lịch dạy". Bấm [Xem buổi học] mở
        // lại ĐÚNG lesson-detail modal hiện có (openLessonDetailModal) — KHÔNG tạo modal mới. Nút
        // [✓ Hoàn thành] (mục 3/4) gọi thẳng setLessonStatusForDate() sẵn có — KHÔNG tạo flow đổi
        // status mới, KHÔNG xoá lesson/student/payment, chỉ UPDATE lessons.status = 'completed'.
        function buildTodaysWorkCard(item, showDate) {
            var c = item.student;
            var card = document.createElement('div');
            card.className = 'tw-card' + (item.status === 'completed' ? ' tw-card-done' : '');

            var endTime = item.startTime ? computeScheduleEndTime(item.startTime, item.duration) : null;
            var timeText = item.startTime ? (item.startTime + (endTime ? ' – ' + endTime : '')) : '—';
            var rateVnd = (Number(c.rate) || 0) * 1000;
            var meta = lessonStatusMeta[item.status] || lessonStatusMeta.scheduled;
            var icon = TODAYS_WORK_ICON[item.status] || TODAYS_WORK_ICON.scheduled;
            var pillColor = item.status === 'completed' ? '#10b981' : item.status === 'cancelled' ? '#ef4444' : item.status === 'absent' ? '#f59e0b' : 'var(--text-sub)';
            var canComplete = item.status !== 'completed' && item.status !== 'cancelled';
            var canReport = item.status === 'completed' && item.lesson && item.lesson.id;

            var dateParts = item.isoDate.split('-');
            var dateHtml = showDate ? '<div class="tw-card-date">' + escapeHtml(item.dayName) + ' - ' + dateParts[2] + '/' + dateParts[1] + '</div>' : '';

            card.innerHTML = '<div class="tw-card-main">'
                + dateHtml
                + '<div class="tw-card-time">🕐 ' + escapeHtml(timeText) + '</div>'
                + '<div class="tw-card-student">🎓 ' + escapeHtml(c.name || '') + '</div>'
                + '<div class="tw-card-subject">📘 ' + escapeHtml(c.subject || '') + '</div>'
                + '<div class="tw-card-duration">⏱️ ' + (item.duration != null ? item.duration + ' giờ' : '—') + '</div>'
                + '<div class="tw-card-fee">💰 ' + (rateVnd > 0 ? rateVnd.toLocaleString('vi-VN') + 'đ / buổi' : '—') + '</div>'
                + '</div>'
                + '<div class="tw-card-side">'
                + '<span class="tw-status-pill" style="color:' + pillColor + '">' + icon + ' ' + escapeHtml(meta.label) + '</span>'
                + '<div class="tw-card-side-btns">'
                + (canComplete ? '<button type="button" class="tw-complete-btn">✓ Hoàn thành</button>' : '')
                + (canReport ? '<button type="button" class="tw-report-btn">Báo cáo</button>' : '')
                + '<button type="button" class="tw-view-btn">Xem buổi học</button>'
                + '</div>'
                + '</div>';

            var completeBtn = card.querySelector('.tw-complete-btn');
            if (completeBtn) {
                completeBtn.addEventListener('click', async function() {
                    completeBtn.disabled = true;
                    completeBtn.innerText = 'Đang lưu...';
                    // setLessonStatusForDate là DUY NHẤT flow được phép đổi status (mục 15/16): thành
                    // công -> reload từ Supabase rồi tự renderTodaysWork(); thất bại -> alert lỗi và
                    // KHÔNG đổi UI. Gọi lại renderTodaysWork() ở đây để chắc chắn nút được vẽ lại đúng
                    // trạng thái thật (kể cả khi thất bại, tránh nút bị kẹt ở "Đang lưu...").
                    await setLessonStatusForDate(c, item.isoDate, item.dayName, 'completed', item.lesson);
                    renderTodaysWork();
                });
            }

            var reportBtn = card.querySelector('.tw-report-btn');
            if (reportBtn) {
                var reportContext = {
                    source_type: 'lesson',
                    tutor_id: window.activeTutorId,
                    student_id: c.id,
                    lesson_id: item.lesson.id,
                    session_date: item.isoDate,
                    student_name: c.name,
                    subject: c.subject,
                    session_label: timeText
                };
                reportBtn.addEventListener('click', function() {
                    if (window.openSessionReportForm) window.openSessionReportForm(reportContext);
                });
                if (window.getSessionReportByLesson) {
                    window.getSessionReportByLesson(item.lesson.id).then(function(result) {
                        if (!result.error && result.data) {
                            reportBtn.innerText = result.data.status === 'submitted' ? 'Đã báo cáo' : 'Báo cáo nháp';
                            reportBtn.classList.toggle('tw-report-btn-submitted', result.data.status === 'submitted');
                        }
                    }).catch(function() { /* Keep the default action label when status lookup fails. */ });
                }
            }

            card.querySelector('.tw-view-btn').addEventListener('click', function() {
                openLessonDetailModal(c, item.isoDate, item.dayName);
            });

            return card;
        }

        // ================================================================================
        // ===== TRANG "LỊCH DẠY" (calendar theo tháng, sidebar Tutor) — ĐÃ TÁCH SANG
        // js/calendar/calendar.js (STEP 7E). Toàn bộ Month View/Week View/Timeline/
        // navigation/mobile view/lưới điểm danh (renderAttendanceGrid/loadMonthAttendanceAndFee/
        // closeAllLessonStatusMenus) nằm trong module đó. Không đổi behavior — module tự
        // expose các hàm này qua window ở cuối file, script chính vẫn gọi được như cũ.

        function toggleMonthFeePaidStatus() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;

            var currentStatus = student.feePaidMonths[currentSelectedMonth] || false;
            student.feePaidMonths[currentSelectedMonth] = !currentStatus;
            saveData();
            loadMonthAttendanceAndFee();
        }

        // Nút trạng thái học phí trên trang hồ sơ: học sinh Supabase -> mở modal ghi nhận thanh toán
        // (payment là giao dịch thực tế, không phải 1 boolean để "toggle"); học sinh local-only -> giữ
        // hành vi toggle cũ để không phá vỡ luồng chưa chuyển sang Supabase.
        function handleFeeStatusBtnClick() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            if (student._supabaseSource) {
                openAddPaymentModal();
            } else {
                toggleMonthFeePaidStatus();
            }
        }

        // Cập nhật nút trạng thái học phí của kỳ đang chọn. Với học sinh Supabase, trạng thái được
        // TÍNH từ tổng payment (paid/partial) so với học phí phải thu của tháng — không hard-code
        // theo 1 boolean cũ (đúng mục 8 trong yêu cầu).
        function refreshFeeStatusUI(student) {
            var feeBtn = document.getElementById('fee-status-toggle-btn');
            if (!feeBtn) return;

            if (student._supabaseSource) {
                var lessonsThisMonth = getBillingLessonsInMonth(student, currentSelectedMonth);
                var billing = computeBillingStats(lessonsThisMonth, getPeriodPayments(student.id, currentSelectedMonth), (Number(student.rate) || 0) * 1000);
                var totalPaid = billing.collected;
                var status = computePeriodStatus(totalPaid, billing.expected);

                if (status === 'paid') {
                    feeBtn.innerText = "✓ Đã thu đủ";
                    feeBtn.className = "fee-toggle-status fee-paid";
                } else if (status === 'partial') {
                    feeBtn.innerText = "◐ Thu một phần (" + totalPaid.toLocaleString('vi-VN') + " đ)";
                    feeBtn.className = "fee-toggle-status fee-partial";
                } else {
                    feeBtn.innerText = "✕ Chưa thanh toán";
                    feeBtn.className = "fee-toggle-status fee-unpaid";
                }
            } else {
                var isPaid = student.feePaidMonths[currentSelectedMonth] || false;
                feeBtn.innerText = isPaid ? "✓ Đã thu phí" : "✕ Chưa thu phí";
                feeBtn.className = isPaid ? "fee-toggle-status fee-paid" : "fee-toggle-status fee-unpaid";
            }
        }

        // Lịch sử thanh toán (mục 9): chỉ áp dụng cho học sinh Supabase — hiển thị các payment của
        // ĐÚNG kỳ (tháng) đang chọn trên dropdown, kèm nút Sửa/Xóa.
        function renderPaymentHistory(student) {
            var section = document.getElementById('payment-history-section');
            var list = document.getElementById('payment-history-list');
            if (!section || !list) return;

            if (!student._supabaseSource) {
                section.style.display = 'none';
                return;
            }
            section.style.display = 'block';

            var payments = getPeriodPayments(student.id, currentSelectedMonth).slice().sort(function(a, b) {
                return (b.payment_date || '').localeCompare(a.payment_date || '');
            });

            if (payments.length === 0) {
                list.innerHTML = '<div style="color:var(--text-sub); font-size:13px; padding:10px; text-align:center;">Chưa có khoản thanh toán nào trong kỳ này.</div>';
                return;
            }

            var statusLabel = { paid: 'Đã thu đủ', partial: 'Thu một phần', pending: 'Chưa thanh toán', cancelled: 'Đã hủy' };
            var statusClass = { paid: 'badge-paid', partial: 'badge-partial', pending: 'badge-unpaid', cancelled: 'badge-cancelled' };

            list.innerHTML = payments.map(function(p) {
                var dateDisp = p.payment_date ? p.payment_date.split('-').reverse().join('/') : '';
                return '<div class="payment-history-item">'
                    + '<div style="min-width:0;">'
                    + '<div style="font-size:13px; font-weight:700; color:var(--text-main);">' + (Number(p.amount) || 0).toLocaleString('vi-VN') + ' đ '
                    + '<span class="' + (statusClass[p.status] || 'badge-unpaid') + '" style="margin-left:8px;">' + (statusLabel[p.status] || p.status) + '</span></div>'
                    + '<div style="font-size:12px; color:var(--text-sub); margin-top:3px;">📅 ' + dateDisp + (p.note ? ' · 📝 ' + escapeHtml(p.note) : '') + '</div>'
                    + '</div>'
                    + '<div style="display:flex; gap:6px; flex-shrink:0;">'
                    + '<button onclick="openEditPaymentModal(\'' + p.id + '\')" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:14px;" title="Sửa">✏️</button>'
                    + '<button onclick="deletePaymentEntry(\'' + p.id + '\')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px;" title="Xóa">🗑️</button>'
                    + '</div>'
                    + '</div>';
            }).join('');
        }

        // ===== MODAL GHI NHẬN / SỬA THANH TOÁN =====
        var editingPaymentId = null; // null = đang tạo payment mới

        function openAddPaymentModal() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student || !student._supabaseSource) return;
            editingPaymentId = null;
            document.getElementById('payment-modal-title').innerText = '💳 Ghi nhận thanh toán';
            document.getElementById('payment-amount').value = '';
            document.getElementById('payment-date').value = new Date().toISOString().slice(0, 10);
            document.getElementById('payment-period').value = currentSelectedMonth;
            document.getElementById('payment-status').value = 'paid';
            document.getElementById('payment-note').value = '';
            document.getElementById('payment-modal-error').style.display = 'none';
            document.getElementById('payment-modal').classList.add('open');
        }

        function openEditPaymentModal(paymentId) {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            var payment = (paymentsCacheByStudent[student.id] || []).find(function(p) { return p.id === paymentId; });
            if (!payment) return;
            editingPaymentId = paymentId;
            document.getElementById('payment-modal-title').innerText = '✏️ Sửa khoản thanh toán';
            document.getElementById('payment-amount').value = payment.amount;
            document.getElementById('payment-date').value = payment.payment_date;
            document.getElementById('payment-period').value = payment.period;
            document.getElementById('payment-status').value = payment.status;
            document.getElementById('payment-note').value = payment.note || '';
            document.getElementById('payment-modal-error').style.display = 'none';
            document.getElementById('payment-modal').classList.add('open');
        }

        function closePaymentModal() {
            document.getElementById('payment-modal').classList.remove('open');
            editingPaymentId = null;
        }

        async function savePaymentModal() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            var errEl = document.getElementById('payment-modal-error');
            errEl.style.display = 'none';

            var amountRaw = document.getElementById('payment-amount').value;
            var amount = parseFloat(amountRaw);
            var paymentDate = document.getElementById('payment-date').value;
            var period = document.getElementById('payment-period').value;
            var status = document.getElementById('payment-status').value;
            var note = document.getElementById('payment-note').value.trim();

            if (!amountRaw || isNaN(amount) || amount <= 0) {
                errEl.innerText = '⚠️ Vui lòng nhập số tiền hợp lệ.';
                errEl.style.display = 'block';
                return;
            }
            if (!paymentDate) {
                errEl.innerText = '⚠️ Vui lòng chọn ngày thanh toán.';
                errEl.style.display = 'block';
                return;
            }
            if (!period) {
                errEl.innerText = '⚠️ Thiếu thông tin kỳ thanh toán.';
                errEl.style.display = 'block';
                return;
            }

            var saveBtn = document.getElementById('payment-modal-save-btn');
            saveBtn.disabled = true; saveBtn.innerText = '⏳ Đang lưu...';

            var opResult;
            if (editingPaymentId) {
                opResult = await updatePayment(editingPaymentId, {
                    amount: amount, payment_date: paymentDate, period: period, status: status, note: note || null
                }, student.id);
            } else {
                opResult = await createPayment({
                    student_id: student.id, amount: amount, payment_date: paymentDate,
                    period: period, status: status, note: note || null
                });
            }

            saveBtn.disabled = false; saveBtn.innerText = '💾 Lưu';

            if (opResult.error) {
                // KHÔNG cập nhật UI giả khi Supabase báo lỗi.
                errEl.innerText = '⚠️ Không thể lưu thanh toán.\n' + describeSupabaseError(opResult.error);
                errEl.style.display = 'block';
                return;
            }

            closePaymentModal();
            showToast('✅', 'Đã lưu thanh toán', '');

            // Nạp lại từ Supabase để đảm bảo Supabase luôn là SOURCE OF TRUTH, rồi mới render lại UI.
            var reload = await loadStudentPayments(student.id);
            if (reload.error) {
                showToast('⚠️', 'Không tải lại được dữ liệu thanh toán', describeSupabaseError(reload.error));
            }
            refreshFeeStatusUI(student);
            renderPaymentHistory(student);
            refreshAdminDashboardStats(); // Mục 11: cập nhật lại "đã thu" nếu Admin Dashboard đang mở
            refreshFinanceDashboardIfOpen(student); // cập nhật Finance Dashboard ngay nếu đang mở
            refreshReportsPageIfOpen(student); // cập nhật Reports ngay nếu đang mở
            refreshStudentProfileExtras(student); // Student Profile 2.0
            renderTodaysWork(); // Action Center (mục 7): ghi payment xong, card "Còn phải thu" phải cập nhật/biến mất ngay, không cần F5
        }

        async function deletePaymentEntry(paymentId) {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            var result = await deletePayment(paymentId, student.id);
            if (result.cancelled) return;
            if (result.error) {
                // Xóa thất bại: giữ nguyên payment trên UI, hiển thị lỗi.
                alert('⚠️ Không thể xóa khoản thanh toán.\n' + describeSupabaseError(result.error));
                return;
            }
            showToast('✅', 'Đã xóa thanh toán', '');
            refreshFeeStatusUI(student);
            renderPaymentHistory(student);
            refreshAdminDashboardStats(); // Mục 11: cập nhật lại "đã thu" nếu Admin Dashboard đang mở
            refreshFinanceDashboardIfOpen(student); // cập nhật Finance Dashboard ngay nếu đang mở
            refreshReportsPageIfOpen(student); // cập nhật Reports ngay nếu đang mở
            refreshStudentProfileExtras(student); // Student Profile 2.0
        }

        // Cập nhật khu vực "Tiến độ học tập & Lộ trình" trên trang hồ sơ + khu vực tài liệu.
        // LƯU Ý: phần checklist "mục tiêu học tập" kiểu cũ (lesson-list-box/input-lesson-name) đã được
        // thay bằng trang Lộ trình (student.roadmap + renderRoadmap()) từ trước — các id đó không còn
        // tồn tại trong HTML nên KHÔNG được truy cập nữa (đây là nguyên nhân gây lỗi
        // "Cannot set properties of null"). Tái sử dụng renderRoadmap() để tính % tiến độ đúng nguồn
        // dữ liệu hiện tại (student.roadmap), tránh trùng lặp logic.
        function renderProfileDetails(student) {
            activeRoadmapId = student.id;
            renderRoadmap();

            var fileBox = document.getElementById('file-list-box'); if (!fileBox) return; fileBox.innerHTML = '';
            if (!student.files || student.files.length === 0) {
                fileBox.innerHTML = '<div style="color:#9ca3af; font-size:13px; text-align:center; padding:15px;">Chưa lưu giữ tài liệu nào.</div>';
            } else {
                student.files.forEach(function(file, index) {
                    var div = document.createElement('div'); div.className = 'file-item';
                    div.innerHTML = `
                        <a href="${file.url}" target="_blank" class="file-link" style="color:#38bdf8; text-decoration:none; font-weight:bold;">📄 ${file.title}</a>
                        <button onclick="deleteFileItem(${index})" style="background:none; border:none; color:#ef4444; cursor:pointer;">🗑️</button>
                    `;
                    fileBox.appendChild(div);
                });
            }
        }


        // STEP 8A DEAD CODE CLEANUP: đã xoá addLessonItem()/toggleLessonDone()/deleteLessonItem()
        // (checklist "mục tiêu học tập" kiểu cũ, đọc #input-lesson-name — id này không còn tồn tại
        // trong HTML từ khi thay bằng trang Lộ trình, xem comment renderProfileDetails() ở trên).
        // Audit STEP 8 xác nhận 0 call-site (không onclick, không window/global, không dynamic
        // invocation) trước khi xoá.

        function handleComputerFileSelect(inputElement) {
            var file = inputElement.files[0]; if (!file) return;
            document.getElementById('upload-status-text').innerText = "⏳ Đang xử lý lưu file...";
            setTimeout(() => {
                var student = classList.find(c => c.id === activeProfileClassId);
                if (student) {
                    if (!student.files) student.files = [];
                    student.files.push({ title: file.name, url: URL.createObjectURL(file) });
                    saveData(); renderProfileDetails(student);
                    document.getElementById('upload-status-text').innerText = "📁 Tải tài liệu trực tiếp từ máy tính";
                    inputElement.value = "";
                }
            }, 100);
        }

        function addFileLinkManual() {
            var titleInput = document.getElementById('input-file-title'); var urlInput = document.getElementById('input-file-url');
            var title = titleInput.value.trim(); var url = urlInput.value.trim();
            if (!title || !url) return;
            var student = classList.find(c => c.id === activeProfileClassId);
            if (student) {
                if (!student.files) student.files = [];
                student.files.push({ title: title, url: url });
                titleInput.value = ''; urlInput.value = ''; saveData(); renderProfileDetails(student);
            }
        }

        function deleteFileItem(index) {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (student) { student.files.splice(index, 1); saveData(); renderProfileDetails(student); }
        }

        // ============ FINANCE DASHBOARD ============
        // SOURCE OF TRUTH: public.lessons (status='completed') + public.payments (status paid/partial).
        // KHÔNG dùng student.attendance/feePaidMonths cho học sinh Supabase (_supabaseSource) nữa —
        // hai field đó chỉ còn là fallback cho học sinh local-only (chưa có Supabase).
        var finCalYear = new Date().getFullYear();
        var finCalMonth = new Date().getMonth(); // 0-based

        function fmt(n) { return (n * 1000).toLocaleString('vi-VN') + ' đ'; }

        function getMonthKey(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }

        // ================================================================================
        // ===== FINANCE CORE V1 (computeBillingStats) — ĐÃ CHUYỂN SANG js/core/billing.js
        // (STEP 8D) =====
        // ================================================================================
        // computeBillingStats() — SINGLE SOURCE OF TRUTH cho Expected/Collected/Outstanding
        // — không còn khai báo ở đây nữa, xem đầy đủ business rule + đơn vị + ghi chú Group
        // Class trong js/core/billing.js. Hàm vẫn dùng được y hệt như trước ở MỌI nơi trong
        // file này (bare identifier `computeBillingStats(...)`) vì billing.js là classic
        // script được nạp TRƯỚC thẻ <script> chính (ngay sau state.js) và gán
        // window.computeBillingStats — bao gồm cả lượt gọi NGAY LÚC PARSE bên dưới
        // (__verifyComputeBillingStats), không đổi behavior so với trước STEP 8D.
        //
        // ===== FINANCE CORE V1 — DEV VERIFICATION =====
        // KHÔNG chạy trên dữ liệu production, KHÔNG ghi/đọc Supabase, KHÔNG có test infrastructure
        // sẵn trong repo nên đây là 1 hàm dev-check nhỏ, tự chạy 1 lần khi script tải xong bằng dữ
        // liệu giả lập HOÀN TOÀN trong bộ nhớ (student_id giả '__test_billing_v1__', không trùng
        // UUID thật nào, được dọn sạch khỏi cache ngay sau khi test). FAIL chỉ console.warn — KHÔNG
        // throw, KHÔNG chặn app chạy tiếp.
        function __verifyComputeBillingStats() {
            var results = [];
            function check(name, actual, expected) {
                var pass = actual === expected;
                results.push({ name: name, pass: pass, actual: actual, expected: expected });
                if (!pass) console.warn('[FinanceCoreV1 TEST FAIL] ' + name + ': expected ' + expected + ', got ' + actual);
            }

            // CASE 1: 8 completed lessons, rate = 200.000 (VNĐ đầy đủ) -> Expected = 1.600.000
            var lessons8 = [];
            for (var i = 0; i < 8; i++) lessons8.push({ status: 'completed', duration: 1 });
            var c1 = computeBillingStats(lessons8, [], 200000);
            check('CASE1 Expected = 1.600.000', c1.expected, 1600000);

            // CASE 2: Expected 1.600.000, Collected 1.000.000 -> Outstanding 600.000
            var c2 = computeBillingStats(lessons8, [{ amount: 1000000, status: 'paid' }], 200000);
            check('CASE2 Collected = 1.000.000', c2.collected, 1000000);
            check('CASE2 Outstanding = 600.000', c2.outstanding, 600000);

            // CASE 3: lẫn thêm lesson cancelled -> KHÔNG được tính thêm tiền (giữ đúng rule hiện tại)
            var lessonsWithCancelled = lessons8.concat([{ status: 'cancelled', duration: 1 }]);
            var c3 = computeBillingStats(lessonsWithCancelled, [], 200000);
            check('CASE3 cancelled không tính tiền', c3.expected, 1600000);
            check('CASE3 completedLessonCount vẫn đúng 8', c3.completedLessonCount, 8);

            // CASE 4: lẫn thêm lesson scheduled -> KHÔNG được tính thêm tiền (giữ đúng rule hiện tại)
            var lessonsWithScheduled = lessons8.concat([{ status: 'scheduled', duration: 1 }]);
            var c4 = computeBillingStats(lessonsWithScheduled, [], 200000);
            check('CASE4 scheduled không tính tiền', c4.expected, 1600000);
            check('CASE4 completedLessonCount vẫn đúng 8', c4.completedLessonCount, 8);

            // CASE 5: payment status không hợp lệ (pending/cancelled) -> KHÔNG được cộng
            var c5 = computeBillingStats(lessons8, [
                { amount: 500000, status: 'pending' },
                { amount: 300000, status: 'cancelled' },
                { amount: 700000, status: 'paid' }
            ], 200000);
            check('CASE5 chỉ cộng payment paid/partial', c5.collected, 700000);

            // CASE 6: payment thuộc period khác KHÔNG được cộng nhầm — test ở tầng caller
            // (getPeriodPayments/getPeriodTotalPaid), vì computeBillingStats không tự biết "kỳ" là gì
            // (period filtering là trách nhiệm của data layer, đúng mục 4 của yêu cầu).
            var fakeId = '__test_billing_v1__';
            var hadBackup = Object.prototype.hasOwnProperty.call(paymentsCacheByStudent, fakeId);
            var backupCache = paymentsCacheByStudent[fakeId];
            paymentsCacheByStudent[fakeId] = [
                { student_id: fakeId, amount: 1000000, status: 'paid', period: '2026-01' },
                { student_id: fakeId, amount: 999999, status: 'paid', period: '2026-02' }
            ];
            var c6 = getPeriodTotalPaid(fakeId, '2026-01');
            check('CASE6 không cộng nhầm payment period khác', c6, 1000000);
            if (hadBackup) paymentsCacheByStudent[fakeId] = backupCache; else delete paymentsCacheByStudent[fakeId];

            // CASE 7: Collected >= Expected -> Outstanding không âm (clamp về 0, KHÔNG đổi business rule)
            var c7a = computeBillingStats(lessons8, [{ amount: 1600000, status: 'paid' }], 200000); // Collected = Expected
            check('CASE7a Outstanding = 0 khi Collected = Expected', c7a.outstanding, 0);
            var c7b = computeBillingStats(lessons8, [{ amount: 2000000, status: 'paid' }], 200000); // Collected > Expected
            check('CASE7b Outstanding clamp về 0 khi Collected > Expected', c7b.outstanding, 0);
            check('CASE7b Collected vẫn giữ giá trị thật, không bị clamp', c7b.collected, 2000000);

            // CASE 8: không có lessons/payments -> tất cả = 0
            var c8 = computeBillingStats([], [], 200000);
            check('CASE8 Expected = 0 khi không có lesson', c8.expected, 0);
            check('CASE8 Collected = 0 khi không có payment', c8.collected, 0);
            check('CASE8 Outstanding = 0 khi không có gì', c8.outstanding, 0);

            var failed = results.filter(function(r) { return !r.pass; });
            if (failed.length === 0) console.log('[FinanceCoreV1] ✅ Tất cả ' + results.length + ' test case PASS.');
            else console.warn('[FinanceCoreV1] ❌ ' + failed.length + '/' + results.length + ' test case FAIL — xem chi tiết ở trên.');
            return results;
        }
        try { __verifyComputeBillingStats(); } catch (e) { console.warn('[FinanceCoreV1] Lỗi khi chạy dev verification:', e); }

        // Lấy danh sách lesson THÔ (có field status) đã tính tiền được, dùng để đưa vào
        // computeBillingStats() — Supabase: đọc trực tiếp lessonsCacheByStudent (tươi nhất);
        // local-only: student.attendance chỉ lưu buổi ĐÃ HOÀN THÀNH (không có field status), nên
        // synthesize lại thành lesson giả với status:'completed' để dùng chung 1 công thức duy nhất.
        function getBillingLessonsInMonth(student, monthKey) {
            if (student._supabaseSource) {
                var cache = lessonsCacheByStudent[student.id] || [];
                return cache.filter(function(l) { return l.scheduled_date && l.scheduled_date.slice(0, 7) === monthKey; });
            }
            var days = (student.attendance && student.attendance[monthKey]) || [];
            return days.map(function() { return { status: 'completed', duration: 0 }; });
        }

        // Tính số buổi ĐÃ DẠY (status = 'completed') của 1 học sinh trong 1 tháng — dùng cho hiển thị
        // lịch/bảng (buildDayMap/renderFinanceTable), KHÔNG phải hàm tính tiền (xem computeBillingStats()
        // ở trên cho Expected/Collected/Outstanding). Trả về mảng "dd/MM" để tương thích UI hiện có.
        function getSessionsInMonth(student, monthKey) {
            if (student._supabaseSource) {
                var cache = lessonsCacheByStudent[student.id] || [];
                return cache
                    .filter(function(l) { return l.status === 'completed' && l.scheduled_date && l.scheduled_date.slice(0, 7) === monthKey; })
                    .map(function(l) {
                        var parts = l.scheduled_date.split('-'); // yyyy-mm-dd
                        return parts[2] + '/' + parts[1];
                    });
            }
            if (!student.attendance || !student.attendance[monthKey]) return [];
            return student.attendance[monthKey]; // mảng "dd/MM"
        }

        // Tiền PHẢI THU trong 1 tháng — công thức thật nay nằm DUY NHẤT trong computeBillingStats()
        // (Finance Core V1). Hàm này CHỈ còn là adapter giữ nguyên unit "nghìn đồng" như trước (rất
        // nhiều template Finance Dashboard đang tự nhân lại ×1000 qua fmt()/thủ công) — KHÔNG tự viết
        // công thức rate×count ở đây nữa. computeBillingStats() cần rate ở VNĐ đầy đủ nên phải nhân
        // ×1000 TRƯỚC khi gọi (students.rate lưu "nghìn đồng"), rồi chia lại ×1000 sau khi nhận kết
        // quả để giữ đúng unit "nghìn đồng" mà các caller cũ của hàm này đang mong đợi.
        function getMoneyInMonth(student, monthKey) {
            var lessons = getBillingLessonsInMonth(student, monthKey);
            var rateVnd = (Number(student.rate) || 0) * 1000;
            return computeBillingStats(lessons, [], rateVnd).expected / 1000;
        }

        // Tiền ĐÃ THU trong 1 kỳ (tháng) — delegate cho computeBillingStats() (Finance Core V1), giữ
        // đúng field payments.period qua getPeriodPayments() đã có sẵn. Học sinh local-only không có
        // payments -> luôn 0. Không liên quan rate nên không cần quy đổi unit.
        function getMoneyCollectedInMonth(student, monthKey) {
            if (!student._supabaseSource) return 0;
            return computeBillingStats([], getPeriodPayments(student.id, monthKey), 0).collected;
        }


        // Tiền CÒN PHẢI THU — delegate cho computeBillingStats() (Finance Core V1): Outstanding =
        // max(0, Expected - Collected), giữ nguyên clamp về 0 khi thu vượt (KHÔNG tự đổi rule).
        // rate phải quy đổi sang VNĐ đầy đủ (×1000) trước khi gọi — xem giải thích ở getMoneyInMonth().
        function getMoneyRemainingInMonth(student, monthKey) {
            var lessons = getBillingLessonsInMonth(student, monthKey);
            var payments = student._supabaseSource ? getPeriodPayments(student.id, monthKey) : [];
            var rateVnd = (Number(student.rate) || 0) * 1000;
            return computeBillingStats(lessons, payments, rateVnd).remaining;
        }

        // Lấy tất cả các ngày trong tháng mà có buổi dạy (gộp tất cả học sinh)
        // Trả về map: { "dd/MM": [{student, paid}] }
        function buildDayMap(year, month) {
            var monthKey = getMonthKey(year, month);
            var map = {};
            classList.forEach(function(st) {
                var sessions = getSessionsInMonth(st, monthKey);
                var status = getClassCardFeeStatus(st, monthKey, getMoneyInMonth(st, monthKey) * 1000);
                var paid = status === 'paid';
                sessions.forEach(function(dateStr) { // "dd/MM"
                    if (!map[dateStr]) map[dateStr] = [];
                    map[dateStr].push({ student: st, paid: paid, status: status });
                });
            });
            return map;
        }

        // Mở Finance Dashboard: LUÔN nạp lại lessons + payments của TẤT CẢ học sinh trong classList
        // hiện tại từ Supabase trước khi render — đảm bảo Finance Dashboard không phụ thuộc dữ liệu
        // cũ trong bộ nhớ (kể cả sau F5, vì trang này chỉ mở lại khi người dùng bấm vào, lúc đó luôn
        // nạp mới). Học sinh local-only không có gì để tải (bỏ qua, dùng attendance cũ như trước).
        async function openFinanceDashboard() {
            document.getElementById('main-page-view').style.display = 'none';
            document.getElementById('profile-page-view').style.display = 'none';
            document.getElementById('finance-dashboard-view').style.display = 'block';
            // Mobile UX QA: Tài chính không dùng switchTutorPage() (không phải tp-page) nên bottom nav
            // không tự đồng bộ active state — set thủ công ở đây để nút "💰 Tài chính" sáng đúng khi mở,
            // và các nút khác tắt active (không đổi route/logic gì khác).
            document.querySelectorAll('.tp-bottom-nav-btn[data-tp-page]').forEach(function (btn) { btn.classList.remove('active'); });
            var finBtn = document.querySelector('.tp-bottom-nav-btn[onclick="openFinanceDashboard()"]');
            if (finBtn) finBtn.classList.add('active');
            finCalYear = new Date().getFullYear();
            finCalMonth = new Date().getMonth();

            var studentIds = classList.filter(function(c) { return c._supabaseSource; }).map(function(c) { return c.id; });
            if (studentIds.length > 0) {
                var errBox = document.getElementById('fin-load-error');
                var lessonsResult = await fetchLessonsMapForStudents(studentIds);
                await fetchPaymentsMapForStudents(studentIds); // đồng bộ lại payments mới nhất, không chỉ dùng cache cũ
                if (errBox) {
                    if (lessonsResult.error) {
                        errBox.innerText = '⚠️ Không tải được đầy đủ dữ liệu buổi học từ Supabase — số liệu bên dưới có thể chưa đúng.\n' + describeSupabaseError(lessonsResult.error);
                        errBox.style.display = 'block';
                    } else {
                        errBox.style.display = 'none';
                    }
                }
            }

            renderFinanceDashboard();
        }

        function closeFinanceDashboard() {
            document.getElementById('finance-dashboard-view').style.display = 'none';
            document.getElementById('main-page-view').style.display = 'flex';
            // Mobile UX QA: khôi phục lại đúng nút tp-page đang thực sự hiển thị (tpCurrentPage, biến đã
            // có sẵn từ switchTutorPage) thay vì chỉ tắt "💰 Tài chính" — trước đó openFinanceDashboard()
            // tắt active của TẤT CẢ nút tp-page nên nếu không set lại ở đây, không nút nào sáng sau khi
            // đóng Tài chính dù người dùng đang ở đúng trang trước đó (VD: Học sinh).
            document.querySelectorAll('.tp-bottom-nav-btn[data-tp-page]').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tp-page') === tpCurrentPage);
            });
        }

        // Gọi sau khi lesson/payment/rate của MỘT học sinh thay đổi (đánh dấu buổi học, thêm/sửa/xóa
        // payment, sửa học phí) — nếu Finance Dashboard đang mở thì nạp lại lessons+payments của ĐÚNG
        // học sinh đó rồi render lại ngay, KHÔNG cần F5. Nếu Finance Dashboard đang đóng thì bỏ qua
        // (giống hệt cách refreshAdminDashboardStats() đã làm cho Admin Dashboard).
        async function refreshFinanceDashboardIfOpen(student) {
            var view = document.getElementById('finance-dashboard-view');
            if (!view || view.style.display === 'none') return;
            if (student && student._supabaseSource) {
                await loadStudentLessons(student.id); // ghi thẳng vào lessonsCacheByStudent (cache DÙNG CHUNG)
                await loadStudentPayments(student.id); // ghi thẳng vào paymentsCacheByStudent (cache DÙNG CHUNG)
            }
            renderFinanceDashboard();
        }

        // ===== TRANG BÁO CÁO (REPORTS) — TUTOR — DASHBOARD/REPORTS SEPARATION V1 =====
        // Mở/đóng #reports-page-view, cùng pattern hệt openFinanceDashboard()/closeFinanceDashboard()
        // (full-page overlay, ẩn main-page-view/profile-page-view). Dùng lại ĐÚNG data layer đã có
        // (fetchLessonsMapForStudents/fetchPaymentsMapForStudents, cache DÙNG CHUNG với Finance
        // Dashboard) — KHÔNG gọi Supabase query mới, KHÔNG tạo bảng mới (mục 6).
        async function openReportsPage() {
            document.getElementById('main-page-view').style.display = 'none';
            document.getElementById('profile-page-view').style.display = 'none';
            var finView = document.getElementById('finance-dashboard-view');
            if (finView) finView.style.display = 'none';
            document.getElementById('reports-page-view').style.display = 'block';
            // Đồng bộ active state bottom nav giống hệt openFinanceDashboard() làm cho nút "Tài chính".
            document.querySelectorAll('.tp-bottom-nav-btn[data-tp-page]').forEach(function (btn) { btn.classList.remove('active'); });
            var repBtn = document.querySelector('.tp-bottom-nav-btn[onclick="openReportsPage()"]');
            if (repBtn) repBtn.classList.add('active');

            var studentIds = classList.filter(function(c) { return c._supabaseSource; }).map(function(c) { return c.id; });
            if (studentIds.length > 0) {
                var errBox = document.getElementById('rpt-tutor-load-error');
                var lessonsResult = await fetchLessonsMapForStudents(studentIds);
                await fetchPaymentsMapForStudents(studentIds); // đồng bộ lại payments mới nhất, không chỉ dùng cache cũ
                if (errBox) {
                    if (lessonsResult.error) {
                        errBox.innerText = '⚠️ Không tải được đầy đủ dữ liệu buổi học từ Supabase — số liệu bên dưới có thể chưa đúng.\n' + describeSupabaseError(lessonsResult.error);
                        errBox.style.display = 'block';
                    } else {
                        errBox.style.display = 'none';
                    }
                }
            }

            renderTutorAnalytics();
        }

        function closeReportsPage() {
            document.getElementById('reports-page-view').style.display = 'none';
            document.getElementById('main-page-view').style.display = 'flex';
            // Khôi phục lại đúng nút tp-page đang thực sự hiển thị (giống hệt closeFinanceDashboard()).
            document.querySelectorAll('.tp-bottom-nav-btn[data-tp-page]').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tp-page') === tpCurrentPage);
            });
        }

        // Gọi song song với refreshFinanceDashboardIfOpen() ở mọi nơi lesson/payment/rate của MỘT học
        // sinh thay đổi — nếu Reports đang mở thì nạp lại đúng dữ liệu học sinh đó rồi render lại ngay,
        // KHÔNG cần F5 (cùng cache dùng chung, KHÔNG query Supabase riêng).
        async function refreshReportsPageIfOpen(student) {
            var view = document.getElementById('reports-page-view');
            if (!view || view.style.display === 'none') return;
            if (student && student._supabaseSource) {
                await loadStudentLessons(student.id);
                await loadStudentPayments(student.id);
            }
            renderTutorAnalytics();
        }

        function finCalPrevMonth() {
            finCalMonth--;
            if (finCalMonth < 0) { finCalMonth = 11; finCalYear--; }
            renderFinanceDashboard();
        }

        function finCalNextMonth() {
            finCalMonth++;
            if (finCalMonth > 11) { finCalMonth = 0; finCalYear++; }
            renderFinanceDashboard();
        }

        function renderFinanceDashboard() {
            var now = new Date();
            var curMonthKey = getMonthKey(now.getFullYear(), now.getMonth());
            var viMonths = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

            // --- 4 thẻ tổng quan (tháng hiện tại) ---
            var totalMonth = 0, paidMonth = 0, unpaidMonth = 0, paidCount = 0, unpaidCount = 0;
            classList.forEach(function(st) {
                var money = getMoneyInMonth(st, curMonthKey);
                totalMonth += money;
                var status = getClassCardFeeStatus(st, curMonthKey, money * 1000);
                if (status === 'paid') { paidMonth += money; paidCount++; }
                else { unpaidMonth += money; unpaidCount++; }
            });
            document.getElementById('fin-cur-month-total').innerText = fmt(totalMonth);
            document.getElementById('fin-cur-month-label').innerText = viMonths[now.getMonth()] + ' ' + now.getFullYear();
            document.getElementById('fin-cur-month-paid').innerText = fmt(paidMonth);
            document.getElementById('fin-cur-paid-count').innerText = paidCount + ' lớp đã thu';
            document.getElementById('fin-cur-month-unpaid').innerText = fmt(unpaidMonth);
            document.getElementById('fin-cur-unpaid-count').innerText = unpaidCount + ' lớp chưa thu';

            // --- Tổng năm ---
            var selYear = parseInt((document.getElementById('fin-year-select').value) || now.getFullYear());
            var yearTotal = 0;
            for (var m = 0; m < 12; m++) {
                var mk = getMonthKey(selYear, m);
                classList.forEach(function(st) { yearTotal += getMoneyInMonth(st, mk); });
            }
            document.getElementById('fin-year-total').innerText = fmt(yearTotal);
            document.getElementById('fin-year-label').innerText = 'Năm ' + selYear;

            // --- Dropdown chọn năm ---
            // Lấy năm có dữ liệu: học sinh Supabase -> từ lessonsCacheByStudent (scheduled_date thật);
            // học sinh local-only -> giữ nguyên attendance cũ.
            var yearSel = document.getElementById('fin-year-select');
            var oldVal = yearSel.value;
            yearSel.innerHTML = '';
            var years = new Set();
            years.add(now.getFullYear()); years.add(now.getFullYear() - 1); years.add(finCalYear);
            classList.forEach(function(st) {
                if (st._supabaseSource) {
                    (lessonsCacheByStudent[st.id] || []).forEach(function(l) {
                        if (l.scheduled_date) years.add(parseInt(l.scheduled_date.slice(0, 4)));
                    });
                } else if (st.attendance) {
                    Object.keys(st.attendance).forEach(function(k) { years.add(parseInt(k.split('-')[0])); });
                }
            });
            Array.from(years).sort().reverse().forEach(function(y) {
                var o = document.createElement('option'); o.value = y; o.text = 'Năm ' + y;
                if (y == (oldVal || now.getFullYear())) o.selected = true;
                yearSel.appendChild(o);
            });

            // --- Biểu đồ 12 tháng ---
            var yearForBar = parseInt(yearSel.value);
            var monthAmounts = [];
            var maxAmt = 0;
            for (var m = 0; m < 12; m++) {
                var mk = getMonthKey(yearForBar, m);
                var amt = 0;
                classList.forEach(function(st) { amt += getMoneyInMonth(st, mk); });
                monthAmounts.push(amt);
                if (amt > maxAmt) maxAmt = amt;
            }
            var barsDiv = document.getElementById('fin-year-bars');
            barsDiv.innerHTML = '';
            monthAmounts.forEach(function(amt, i) {
                var pct = maxAmt > 0 ? Math.max(3, Math.round((amt / maxAmt) * 100)) : 0;
                var isNow = (i === now.getMonth() && yearForBar === now.getFullYear());
                var row = document.createElement('div'); row.className = 'year-bar-item';
                row.innerHTML = '<div class="year-bar-label" style="' + (isNow ? 'color:#00cca3;' : '') + '">T' + (i + 1) + '</div>'
                    + '<div class="year-bar-track"><div class="year-bar-fill" style="width:' + pct + '%;' + (isNow ? 'background:linear-gradient(90deg,#00cca3,#00b38f);' : '') + '">'
                    + (amt > 0 ? '<span>' + fmt(amt) + '</span>' : '') + '</div></div>'
                    + '<div class="year-bar-amount">' + (amt > 0 ? fmt(amt) : '<span style="color:var(--text-sub);font-size:12px;">—</span>') + '</div>';
                barsDiv.appendChild(row);
            });

            // --- Lịch tháng ---
            renderFinCalendar();

            // --- Bảng chi tiết học sinh theo tháng hiện tại lịch ---
            renderFinanceTable();
        }

        function renderFinCalendar() {
            var y = finCalYear, m = finCalMonth;
            var viMonths = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
            document.getElementById('fin-cal-title').innerText = viMonths[m] + ' ' + y;
            document.getElementById('fin-table-month-label').innerText = viMonths[m] + ' ' + y;

            var grid = document.getElementById('fin-calendar-grid');
            grid.innerHTML = '';

            var dayMap = buildDayMap(y, m);
            var firstDay = new Date(y, m, 1).getDay(); // 0=CN
            // Chuyển sang bắt đầu từ T2: 0=T2..6=CN
            var startOffset = (firstDay === 0) ? 6 : firstDay - 1;
            var daysInMonth = new Date(y, m + 1, 0).getDate();

            // Ô trống đầu tháng
            for (var i = 0; i < startOffset; i++) {
                var blank = document.createElement('div');
                blank.style.cssText = 'min-height:70px;border-radius:8px;background:transparent;';
                grid.appendChild(blank);
            }

            var today = new Date();
            for (var day = 1; day <= daysInMonth; day++) {
                var dateStr = String(day).padStart(2, '0') + '/' + String(m + 1).padStart(2, '0');
                var entries = dayMap[dateStr] || [];
                var isToday = (day === today.getDate() && m === today.getMonth() && y === today.getFullYear());
                var hasPaid = entries.some(function(e) { return e.paid; });
                var hasUnpaid = entries.some(function(e) { return !e.paid; });
                var hasAny = entries.length > 0;

                var bgColor = 'var(--bg-card-sub)';
                var borderColor = 'var(--border-color)';
                if (hasAny) {
                    if (hasPaid && !hasUnpaid) { bgColor = 'rgba(16,185,129,0.12)'; borderColor = '#10b981'; }
                    else if (hasUnpaid) { bgColor = 'rgba(239,68,68,0.08)'; borderColor = '#ef4444'; }
                    else { bgColor = 'rgba(0,204,163,0.12)'; borderColor = '#00cca3'; }
                }

                var cell = document.createElement('div');
                cell.style.cssText = 'min-height:70px; border-radius:8px; padding:6px; background:' + bgColor + '; border:1px solid ' + borderColor + '; font-size:12px; overflow:hidden; position:relative;'
                    + (isToday ? 'box-shadow:0 0 0 2px #00cca3;' : '');

                var dayLabel = document.createElement('div');
                dayLabel.style.cssText = 'font-weight:bold; font-size:13px; margin-bottom:4px; color:' + (isToday ? '#00cca3' : 'var(--text-main)') + ';';
                dayLabel.innerText = day;
                cell.appendChild(dayLabel);

                if (entries.length > 0) {
                    var totalDay = 0;
                    entries.forEach(function(e) { totalDay += e.student.rate; });
                    var totalDiv = document.createElement('div');
                    totalDiv.style.cssText = 'font-size:11px; font-weight:bold; color:' + (hasPaid && !hasUnpaid ? '#10b981' : '#ef4444') + '; margin-bottom:3px;';
                    totalDiv.innerText = fmt(totalDay);
                    cell.appendChild(totalDiv);

                    entries.forEach(function(e) {
                        var tag = document.createElement('div');
                        tag.style.cssText = 'font-size:10px; color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
                        tag.innerText = '• ' + e.student.name + ' (' + e.student.subject + ')';
                        cell.appendChild(tag);
                    });
                }

                grid.appendChild(cell);
            }
        }

        function renderFinanceTable() {
            var y = finCalYear, m = finCalMonth;
            var monthKey = getMonthKey(y, m);
            var tbody = document.getElementById('fin-table-body');
            tbody.innerHTML = '';
            // Tính bằng đơn vị đồng thật (VND) để cộng đúng với payments.amount (KHÔNG lẫn đơn vị
            // "nghìn đồng" của money/rate) — tránh lỗi cộng sai đơn vị giữa "tiền dạy" và "tiền đã thu".
            var grandTaughtVnd = 0, grandCollectedVnd = 0;

            classList.forEach(function(st) {
                var sessions = getSessionsInMonth(st, monthKey);
                var money = getMoneyInMonth(st, monthKey); // đơn vị nghìn đồng, giống các nơi khác trong Finance Dashboard
                var taughtVnd = money * 1000;
                var collectedVnd = getMoneyCollectedInMonth(st, monthKey); // đã là đồng thật (public.payments.amount)
                var status = getClassCardFeeStatus(st, monthKey, taughtVnd);

                grandTaughtVnd += taughtVnd;
                grandCollectedVnd += collectedVnd;

                var statusBadgeClass = { paid: 'badge-paid', partial: 'badge-partial', pending: 'badge-unpaid' }[status] || 'badge-unpaid';
                var statusBadgeLabel = { paid: '✓ Đã thu', partial: '◐ Một phần', pending: '✗ Chưa thu' }[status] || '✗ Chưa thu';

                var days = st.days ? st.days.join(', ') : st.day;
                var tr = document.createElement('tr');
                tr.innerHTML = '<td><strong>' + st.name + '</strong></td>'
                    + '<td>' + st.subject + '</td>'
                    + '<td><span style="font-size:12px;color:#38bdf8;">' + days + ' ' + st.startTime + '</span></td>'
                    + '<td style="text-align:center;">' + sessions.length + ' buổi</td>'
                    + '<td>' + (st.rate * 1000).toLocaleString('vi-VN') + ' đ</td>'
                    + '<td><strong style="color:' + (money > 0 ? '#00cca3' : 'var(--text-sub)') + ';">' + fmt(money) + '</strong></td>'
                    + '<td><span class="' + statusBadgeClass + '">' + statusBadgeLabel + '</span></td>';
                tbody.appendChild(tr);
            });

            if (classList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-sub); padding:30px;">Chưa có học sinh nào.</td></tr>';
            }

            // "Đã thu" = tổng THẬT của public.payments (paid+partial), không phải suy ra từ badge
            // paid/chưa-paid như trước (bug cũ: bỏ sót tiền đã thu một phần "partial").
            // "Còn phải thu" = max(0, phải thu - đã thu), không cho về âm.
            var grandRemainingVnd = Math.max(0, grandTaughtVnd - grandCollectedVnd);
            var summary = document.getElementById('fin-table-summary');
            summary.innerHTML = '<div style="font-size:14px; color:var(--text-sub);">Tổng <strong style="color:var(--text-main);">' + classList.length + '</strong> học sinh</div>'
                + '<div style="display:flex; gap:24px; flex-wrap:wrap;">'
                + '<span>Phải thu: <strong style="color:#00cca3;">' + grandTaughtVnd.toLocaleString('vi-VN') + ' đ</strong></span>'
                + '<span>Đã thu: <strong style="color:#10b981;">' + grandCollectedVnd.toLocaleString('vi-VN') + ' đ</strong></span>'
                + '<span>Còn phải thu: <strong style="color:#ef4444;">' + grandRemainingVnd.toLocaleString('vi-VN') + ' đ</strong></span>'
                + '</div>';

            // STEP 11I-K: đúng 1 hook point duy nhất — renderFinanceTable() là hàm CUỐI CÙNG được gọi
            // bởi renderFinanceDashboard() ở MỌI đường vào (mở dashboard, đổi tháng lịch, đổi năm biểu
            // đồ, refreshFinanceDashboardIfOpen), nên đặt hook ở đây thay vì rải ở từng nơi gọi
            // renderFinanceDashboard() đảm bảo Group Class Finance LUÔN đồng bộ đúng tháng (y, m) đang
            // xem — không tự viết lại logic tính "đã thu 1-to-1" ở gc-finance.js (truyền sẵn
            // grandCollectedVnd vừa tính ở trên cho khối "Tổng cộng"). KHÔNG await (fire-and-forget) —
            // gc-finance.js tự quản lý loading state/lỗi trong #gc-finance-section, không chặn phần
            // Finance 1-to-1 đã render xong ở trên.
            if (window.gcRefreshFinanceSection) { window.gcRefreshFinanceSection(y, m, grandCollectedVnd); }
        }

        // Rate limiting: max 5 lần sai → khóa 15 phút
        var MAX_ATTEMPTS = 5;
        var LOCKOUT_MS = 15 * 60 * 1000;

        function getLockoutData(username) {
            return JSON.parse(localStorage.getItem('gsm_lock_' + username) || '{"attempts":0,"lockedUntil":0}');
        }
        function saveLockoutData(username, data) {
            localStorage.setItem('gsm_lock_' + username, JSON.stringify(data));
        }
        // STEP 8A DEAD CODE CLEANUP: đã xoá recordFailedAttempt()/isLocked() (0 call-site — chưa
        // từng được nối vào doLogin()/luồng đăng nhập thật). GIỮ NGUYÊN getLockoutData()/
        // saveLockoutData()/clearLockout()/MAX_ATTEMPTS/LOCKOUT_MS (ngoài phạm vi STEP 8A) dù các
        // hàm này hiện cũng không còn nơi nào gọi tới — xem mục E (warning) trong báo cáo STEP 8A.
        function clearLockout(username) {
            localStorage.removeItem('gsm_lock_' + username);
        }

        function clearLoginError() {
            document.getElementById('login-error').style.display = 'none';
        }

        // ===== AUTH SYSTEM =====
        // currentUser / currentTutor / currentTutorAuthEmail / isSupabaseTutorSession /
        // currentAdminProfile / isSupabaseAdminSession / activeTutorId / isAdminManagingTutor /
        // adminManagedTutorInfo: STEP 8B đã chuyển khai báo sang js/core/state.js (mục A —
        // SESSION/AUTH, state dùng chung TOÀN BỘ app: Admin, Settings, Students, Lessons,
        // Calendar, Finance, Reports đều cần biết đang đăng nhập là ai). Giá trị khởi tạo giữ
        // nguyên 100% — window.currentUser, window.activeTutorId, v.v. đã sẵn sàng từ trước khi
        // dòng này chạy (state.js là classic script, nạp trước script chính).

        // Schema THẬT của public.student_schedules đã được xác nhận: id, student_id, day_of_week, start_time,
        // duration, created_at. KHÔNG có cột end_time — giờ kết thúc chỉ TÍNH từ start_time + duration.
        // Dùng chung bởi addNewClass/removeClass/saveEditClass (Tutor) và openTutorWorkspaceAsAdmin (Admin).
        var SCHEDULE_FIELDS = { day: 'day_of_week', start: 'start_time', duration: 'duration' };
        function computeScheduleEndTime(startTime, durationHours) {
            if (!startTime || durationHours == null || isNaN(parseFloat(durationHours))) return null;
            var parts = startTime.split(':');
            var startMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            var endMins = Math.round(startMins + parseFloat(durationHours) * 60);
            endMins = ((endMins % 1440) + 1440) % 1440; // qua nửa đêm thì vòng lại trong ngày
            var h = Math.floor(endMins / 60), m = endMins % 60;
            return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        }

        // Lấy lịch học của một danh sách student_id, gom theo student, dùng chung cho cả luồng Tutor tự đăng nhập
        // và luồng Admin mở quản lý một Tutor — CHỈ MỘT nơi đọc student_schedules để tránh lệch logic.
        async function fetchScheduleMapForStudents(studentIds) {
            var scheduleMap = {};
            if (!studentIds || studentIds.length === 0) return scheduleMap;
            var result = await supabaseClient
                .from('student_schedules')
                .select('*')
                .in('student_id', studentIds);
            if (result.error) {
                console.warn('Không lấy được student_schedules:', result.error.message);
                return scheduleMap;
            }
            (result.data || []).forEach(function(row) {
                var sid = row.student_id;
                if (!scheduleMap[sid]) scheduleMap[sid] = { days: [], startTimes: [], duration: row.duration };
                if (row.day_of_week) scheduleMap[sid].days.push(row.day_of_week);
                if (row.start_time) scheduleMap[sid].startTimes.push(row.start_time);
            });
            return scheduleMap;
        }

        // Tra ĐÚNG một dòng student_schedules theo student_id + day_of_week (dùng khi cần start_time/duration
        // CHÍNH XÁC của một ngày cụ thể để INSERT vào public.lessons — không suy ra/hard-code từ nơi khác,
        // vì start_time và duration trong lessons là NOT NULL). Trả về null nếu không có lịch cho ngày đó.
        async function findScheduleRowForDay(studentId, dayOfWeekName) {
            if (!studentId || !dayOfWeekName) return { data: null, error: null };
            try {
                const { data, error } = await supabaseClient
                    .from('student_schedules')
                    .select('*')
                    .eq('student_id', studentId)
                    .eq('day_of_week', dayOfWeekName);
                if (error) {
                    console.error('findScheduleRowForDay lỗi:', error);
                    return { data: null, error: error };
                }
                return { data: (data && data.length) ? data[0] : null, error: null };
            } catch (err) {
                console.error('findScheduleRowForDay exception:', err);
                return { data: null, error: err };
            }
        }

        // ===== HÀM DÙNG CHUNG: tải classList (học sinh + lịch học) của MỘT Tutor từ Supabase =====
        // Dùng chung cho CẢ HAI luồng: (1) Tutor tự đăng nhập, (2) Admin mở "Xem chi tiết" một Tutor.
        // Đây là nơi DUY NHẤT đọc bảng students theo tutor_id — tránh lặp code giữa hai luồng.
        async function loadTutorClassList(tutorId) {
            const { data: students, error: studentsError } = await supabaseClient
                .from('students')
                .select('*')
                .eq('tutor_id', tutorId);
            console.log('[LOAD SUPABASE] students của tutor_id=' + tutorId + ':', students, studentsError);

            if (studentsError) {
                return { classList: [], error: studentsError };
            }

            var studentIds = (students || []).map(function(s) { return s.id; });
            var scheduleMap = await fetchScheduleMapForStudents(studentIds);
            await fetchPaymentsMapForStudents(studentIds); // nạp payments cho toàn bộ học sinh của Tutor này
            // Nạp SẴN lessons (public.lessons) cho toàn bộ học sinh của Tutor này TRƯỚC KHI classList
            // được dựng lại và renderClassList() chạy — để Student Card không bao giờ hiện tạm "0 buổi"
            // giả do lessonsCacheByStudent chưa có dữ liệu (renderClassList luôn chạy SAU await này).
            var lessonsResult = await fetchLessonsMapForStudents(studentIds);
            if (lessonsResult.error) {
                console.warn('loadTutorClassList: không tải được lessons (bulk), số buổi/tiền trên Student Card có thể chưa đúng:', lessonsResult.error);
            }

            var list = (students || []).map(function(s) {
                console.log('[LOAD STUDENT] student from Supabase:', s);
                console.log('[LOAD STUDENT] rate from Supabase:', s.rate);
                return mapSupabaseStudentToClass(s, scheduleMap[s.id]);
            });
            console.log('[LOAD SUPABASE] classList dựng lại từ Supabase:', list);

            return { classList: list, error: null };
        }

        // ================================================================
        // ===== MODULE public.lessons (BUỔI HỌC / ĐIỂM DANH THỰC TẾ) =====
        // ================================================================
        // Nguồn dữ liệu CHÍNH: bảng public.lessons trên Supabase.
        // student_schedules = lịch học ĐỊNH KỲ (cố định theo ngày trong tuần) — KHÔNG đổi ở đây.
        // lessons           = từng BUỔI HỌC THỰC TẾ (ngày cụ thể, có status/notes riêng).
        // Dùng chung cho CẢ Tutor và Admin (Admin quản lý hộ Tutor qua RLS hiện tại, không cần
        // function riêng "adminLessons"). Mọi operation đều kiểm tra error, KHÔNG cập nhật UI giả
        // khi có lỗi, và KHÔNG nuốt lỗi bằng catch rỗng.
        //
        // loadStudentLessons/createLesson/updateLesson/deleteLesson/findLessonForDate đã tách sang
        // js/lessons/lessons.js (STEP 7D) — vẫn accessible như global qua window.* (xem lessons.js).
        // describeSupabaseError (bên dưới) CHỦ Ý giữ lại ở đây vì là helper lỗi dùng chung toàn app
        // (Students/Calendar/Finance/Payments/Admin...), không phải riêng của Lessons.

        // Diễn giải lỗi Supabase thành thông báo dễ hiểu cho người dùng (403/RLS, 404, PGRST204, network...)
        function describeSupabaseError(error) {
            if (!error) return 'Lỗi không xác định';
            var msg = error.message || String(error);
            var code = error.code || '';
            if (code === 'PGRST204') return 'Không có dữ liệu trả về (PGRST204): ' + msg;
            if (error.status === 403 || /rls|row-level security|permission denied/i.test(msg)) {
                return 'Không có quyền truy cập (RLS/403): ' + msg;
            }
            if (error.status === 404) return 'Không tìm thấy dữ liệu (404): ' + msg;
            if (/network|fetch|failed to fetch/i.test(msg)) return 'Lỗi kết nối mạng, vui lòng kiểm tra Internet: ' + msg;
            return msg + (code ? ' [mã lỗi: ' + code + ']' : '');
        }

        // Dựng lại object student.attendance {thang: ["dd/MM", ...]} TỪ cache lessons (status = 'completed').
        // Giữ tương thích với các nơi khác trong code đang đọc student.attendance/student.sessions
        // (ví dụ: renderClassList, admin panel, thông báo Telegram, dashboard tài chính...) — những nơi
        // đó chỉ ĐỌC, nên không cần sửa lại, chỉ cần cache này luôn được đồng bộ từ Supabase.
        function rebuildAttendanceBridgeFromLessons(student) {
            var cache = lessonsCacheByStudent[student.id] || [];
            var attendance = {};
            cache.forEach(function(l) {
                if (l.status === 'completed' && l.scheduled_date) {
                    var parts = l.scheduled_date.split('-'); // yyyy-mm-dd
                    var mk = parts[0] + '-' + parts[1];
                    var dStr = parts[2] + '/' + parts[1];
                    if (!attendance[mk]) attendance[mk] = [];
                    if (attendance[mk].indexOf(dStr) === -1) attendance[mk].push(dStr);
                }
            });
            student.attendance = attendance;
            var now = new Date();
            var activeMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
            student.sessions = (attendance[activeMonthKey] || []).length;
        }

        // Cập nhật hiển thị số buổi/tiền của tháng đang xem, không cần gọi lại Supabase.
        // Học phí là GIÁ CỐ ĐỊNH THEO BUỔI (nhãn "Học phí/buổi (nghìn đồng)"), KHÔNG phải theo giờ —
        // nên tiền mỗi buổi hoàn thành = rate × 1.000, không nhân thêm số giờ/buổi. Số giờ chỉ hiển thị
        // để tham khảo (tổng thời lượng đã dạy), không dùng để tính tiền.
        function refreshMonthMoneyDisplay(student) {
            var moneyEl = document.getElementById('profile-month-money');
            var countEl = document.getElementById('profile-month-session-count');
            var rateVnd = (Number(student.rate) || 0) * 1000;

            if (student._supabaseSource) {
                var monthLessons = getBillingLessonsInMonth(student, currentSelectedMonth);
                var billing = computeBillingStats(monthLessons, [], rateVnd);
                var doneCount = billing.completedCount, totalHours = billing.hours;
                var totalMoney = billing.expected;
                if (moneyEl) moneyEl.innerText = totalMoney.toLocaleString('vi-VN') + ' đ';
                if (countEl) countEl.innerText = "(" + doneCount + " buổi · " + totalHours + " giờ đã dạy"
                    + (doneCount > 0 ? " · " + rateVnd.toLocaleString('vi-VN') + "đ × " + doneCount + " buổi" : "") + ")";
                renderAlltimeTeachingStats(student);
            } else {
                var doneCountLocal = (student.attendance[currentSelectedMonth] || []).length;
                var totalMoneyLocal = computeBillingStats(
                    Array.from({ length: doneCountLocal }, function() { return { status: 'completed', duration: 0 }; }),
                    [], rateVnd
                ).expected;
                if (moneyEl) moneyEl.innerText = totalMoneyLocal.toLocaleString('vi-VN') + ' đ';
                if (countEl) countEl.innerText = "(" + doneCountLocal + " buổi đã dạy"
                    + (doneCountLocal > 0 ? " · " + rateVnd.toLocaleString('vi-VN') + "đ × " + doneCountLocal + " buổi" : "") + ")";
                var altBox = document.getElementById('profile-alltime-stats');
                if (altBox) altBox.style.display = 'none';
            }
        }

        // Mục 2 + 6 + 7: Thống kê TOÀN BỘ (không giới hạn theo tháng đang xem) để Tutor biết "đã dạy bao
        // nhiêu tiền tính đến hiện tại" — chỉ tính lesson.status = 'completed', KHÔNG tính scheduled/
        // absent/cancelled, KHÔNG lấy từ payments (payments = tiền phụ huynh đã trả, khác khái niệm).
        // Tiền = rate cố định theo buổi × số buổi completed (KHÔNG nhân theo giờ — xem giải thích ở trên).
        function renderAlltimeTeachingStats(student) {
            var box = document.getElementById('profile-alltime-stats');
            if (!box) return;
            var cache = lessonsCacheByStudent[student.id] || [];
            var rateVnd = (Number(student.rate) || 0) * 1000;
            // Mục 4 (TỔNG QUAN TÀI CHÍNH): "Đã thu" = tổng amount của TẤT CẢ payments (mọi kỳ, không
            // chỉ tháng đang xem) có status 'paid' hoặc 'partial' — lấy từ public.payments qua cache
            // đã nạp sẵn (paymentsCacheByStudent), KHÔNG hard-code. "Còn phải thu" = Tiền đã dạy - Đã
            // thu, không cho về âm (nếu thu vượt tiền đã dạy thì hiển thị 0, không phải số âm gây hiểu nhầm).
            // STEP 11I-I (Phase 15 audit finding): đọc thẳng cache thay vì qua getPeriodPayments()
            // (hàm này lấy TOÀN BỘ mọi kỳ, không lọc theo period) — cùng lý do phải tự loại trừ
            // Group Class payment (group_class_id IS NOT NULL) ở đây để "Tổng quan tài chính"
            // all-time của Student Profile 1-1 không bị cộng nhầm tiền Group Class.
            var paymentsAll = (paymentsCacheByStudent[student.id] || []).filter(function(p) { return !p.group_class_id; });
            // STEP 8D: TRƯỚC ĐÂY hàm này tự tính sessions/money/collected/remaining bằng vòng lặp
            // thủ công (duplicate công thức với computeBillingStats() — cùng rule "chỉ completed
            // tính tiền" / "chỉ paid+partial tính đã thu" / "clamp outstanding >= 0" nhưng viết lại
            // 2 lần). Nay delegate 100% cho Billing Core (Finance Core V1) — kết quả toán học giống
            // hệt bản gốc, chỉ còn 1 công thức duy nhất trong toàn app (đúng mục 3/6 STEP 8D).
            var billing = computeBillingStats(cache, paymentsAll, rateVnd);
            var sessions = billing.completedCount, hours = billing.hours, money = billing.expected,
                collected = billing.collected, remaining = billing.remaining;
            document.getElementById('profile-alltime-sessions').innerText = sessions;
            document.getElementById('profile-alltime-hours').innerText = hours;
            document.getElementById('profile-alltime-money').innerText = money.toLocaleString('vi-VN') + ' đ';

            var collectedEl = document.getElementById('profile-alltime-collected');
            var remainingEl = document.getElementById('profile-alltime-remaining');
            if (collectedEl) collectedEl.innerText = collected.toLocaleString('vi-VN') + ' đ';
            if (remainingEl) remainingEl.innerText = remaining.toLocaleString('vi-VN') + ' đ';

            box.style.display = 'flex';
        }

        // ================================================================================
        // ===== STUDENT PROFILE 2.0 — module mới, DERIVE toàn bộ dữ liệu từ cache đã có sẵn
        // (lessonsCacheByStudent/paymentsCacheByStudent/scheduleRowsCacheByStudent), KHÔNG gọi thêm
        // Supabase khi render (đúng mục PERFORMANCE), KHÔNG tạo Lesson Detail modal thứ hai
        // (mọi thao tác mở buổi học đều gọi lại openLessonDetailModal() đã có).
        // ================================================================================
        var spCurrentTab = 'overview';
        var spHistoryFilterState = 'all';
        var spHistorySearchState = '';

        function getActiveProfileStudent() {
            return classList.find(function(c) { return c.id === activeProfileClassId; });
        }

        // Điểm vào DUY NHẤT để vẽ lại toàn bộ phần Student Profile 2.0 — gọi sau mỗi lần dữ liệu
        // lessons/payments thay đổi (đổi status, ghi/xóa thanh toán, đổi tháng xem).
        function refreshStudentProfileExtras(student) {
            if (!student) return;
            renderStudentHero(student);
            renderStudentKPIs(student);
            renderOverviewTab(student);
            renderStudentHistoryTab(student);
            renderStudentReportsTab(student);
            renderStudentProgressTab(student);
        }

        function switchStudentProfileTab(tab) {
            spCurrentTab = tab;
            document.querySelectorAll('.sp-tab-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-sp-tab') === tab);
            });
            ['overview', 'history', 'reports', 'progress', 'tuition'].forEach(function(t) {
                var panel = document.getElementById('sp-tab-' + t);
                if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
            });
        }

        async function renderStudentReportsTab(student) {
            var box = document.getElementById('sp-session-reports-list');
            if (!box || !student) return;
            box.innerHTML = '<div class="sp-empty-state">Đang tải báo cáo...</div>';
            if (!window.getSessionReportsByStudent) {
                box.innerHTML = '<div class="sp-empty-state">Chưa sẵn sàng tải báo cáo.</div>';
                return;
            }

            var result = await window.getSessionReportsByStudent(student.id);
            if (result.error) {
                box.innerHTML = '<div class="sp-empty-state">Không thể tải báo cáo.</div>';
                return;
            }
            var reports = result.data || [];
            if (!reports.length) {
                box.innerHTML = '<div class="sp-empty-state">Chưa có báo cáo học tập nào.</div>';
                return;
            }

            box.innerHTML = reports.map(function(report) {
                var isGroup = report.source_type === 'group_session';
                var statusLabel = report.status === 'submitted' ? 'Đã báo cáo' : 'Nháp';
                var contextLabel = isGroup ? 'Lớp nhóm' : (student.subject || 'Buổi 1-1');
                var preview = (report.content || '').trim();
                if (preview.length > 160) preview = preview.slice(0, 157) + '...';
                var dateLabel = report.session_date ? formatDate(report.session_date) : '—';
                return '<button type="button" class="sp-session-report-card" data-session-report-id="' + escapeHtml(report.id) + '">' +
                    '<div class="sp-session-report-card-head">' +
                        '<span class="sp-session-report-date">' + escapeHtml(dateLabel) + '</span>' +
                        '<span class="sp-session-report-status ' + (report.status === 'submitted' ? 'is-submitted' : 'is-draft') + '">' + escapeHtml(statusLabel) + '</span>' +
                    '</div>' +
                    '<div class="sp-session-report-context">' + escapeHtml(contextLabel) + '</div>' +
                    '<div class="sp-session-report-preview">' + escapeHtml(preview || 'Chưa có nội dung.') + '</div>' +
                '</button>';
            }).join('');

            box.querySelectorAll('[data-session-report-id]').forEach(function(card) {
                card.addEventListener('click', function() {
                    var report = reports.find(function(item) { return item.id === card.getAttribute('data-session-report-id'); });
                    if (!report || !window.openSessionReportForm) return;
                    window.openSessionReportForm({
                        source_type: report.source_type,
                        tutor_id: report.tutor_id,
                        student_id: report.student_id,
                        lesson_id: report.lesson_id,
                        group_session_id: report.group_session_id,
                        attendance_id: report.attendance_id,
                        session_date: report.session_date,
                        student_name: student.name,
                        subject: student.subject,
                        session_label: report.source_type === 'group_session' ? 'Lớp nhóm' : 'Buổi 1-1'
                    });
                });
            });
        }

        window.renderStudentReportsTab = renderStudentReportsTab;
        window.refreshActiveStudentReports = function() {
            var student = getActiveProfileStudent();
            if (student) renderStudentReportsTab(student);
        };

        // ================================================================================
        // ===== WEEKLY REPORT v1 (Báo cáo tuần gửi phụ huynh) — TÁI SỬ DỤNG
        // getSessionReportsByStudent(studentId, {status, fromDate, toDate}) đã có sẵn (Session Report
        // v1 data layer), KHÔNG tạo bảng/Supabase query mới, KHÔNG đổi hành vi Session Report hiện có.
        // Chỉ gộp báo cáo status='submitted' — báo cáo nháp KHÔNG xuất hiện trong báo cáo phụ huynh.
        // Tổng số giờ derive từ lessonsCacheByStudent đã nạp sẵn cho Student Profile (khớp lesson_id),
        // KHÔNG gọi thêm query nào cho việc này (đúng nguyên tắc tránh N+1).
        // ================================================================================
        var activeWeeklyReport = null;

        // Khoảng Thứ 2 - Chủ Nhật của TUẦN CHỨA dateStr (cùng thuật toán với spWeekRange(), nhưng neo
        // theo ngày được chọn thay vì "hôm nay" — spWeekRange() không dùng được thẳng ở đây).
        function wrWeekRangeForDate(dateStr) {
            var base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
            if (isNaN(base.getTime())) base = new Date();
            var dow = (base.getDay() + 6) % 7; // 0 = Thứ 2
            var monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow);
            var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
            return { start: getLocalIsoDate(monday), end: getLocalIsoDate(sunday) };
        }

        function wrSessionLabel(report) {
            return report.source_type === 'group_session' ? 'Lớp nhóm' : 'Buổi 1-1';
        }

        // Chuỗi HTML cho MỘT buổi báo cáo (dùng chung cho preview trong app VÀ file xuất HTML).
        function wrSessionBlockHtml(report, student) {
            var fields = [
                ['Nội dung đã học', report.content],
                ['Mức độ tiếp thu', report.assessment],
                ['Điểm mạnh', report.strengths],
                ['Cần cải thiện', report.improvements],
                ['Bài tập về nhà', report.homework],
                ['Nhận xét cho phụ huynh', report.parent_note],
                ['Định hướng buổi tới', report.next_focus]
            ];
            var fieldsHtml = fields.filter(function(f) { return f[1]; }).map(function(f) {
                return '<div class="wr-session-field"><strong>' + escapeHtml(f[0]) + ':</strong> ' + escapeHtml(f[1]) + '</div>';
            }).join('');
            var context = report.source_type === 'group_session' ? 'Lớp nhóm' : (student.subject || 'Buổi 1-1');
            return '<div class="wr-session-block">'
                + '<div class="wr-session-head"><span>' + escapeHtml(formatDate(report.session_date)) + ' · ' + escapeHtml(context) + '</span></div>'
                + fieldsHtml
                + '</div>';
        }

        // ===== WEEKLY REPORT V2 — PHẦN TỔNG KẾT TUẦN (đặt TRƯỚC danh sách từng buổi) =====
        // Toàn bộ dữ liệu suy ra TỪ CHÍNH danh sách "reports" đã lọc status='submitted' trong tuần
        // (không gọi thêm Supabase, không đổi Session Report V1 / logic 1-1 / Group Class).
        function wrCollectUnique(reports, field) {
            var seen = {};
            var out = [];
            reports.forEach(function(r) {
                var v = (r[field] || '').trim();
                if (v && !seen[v]) { seen[v] = true; out.push({ date: r.session_date, text: v }); }
            });
            return out;
        }

        function wrBuildWeeklySummary(reports) {
            var highlights = reports
                .map(function(r) { return { date: r.session_date, text: (r.content || '').trim() }; })
                .filter(function(h) { return h.text; });

            var assessmentTally = {};
            reports.forEach(function(r) {
                var v = (r.assessment || '').trim();
                if (v) assessmentTally[v] = (assessmentTally[v] || 0) + 1;
            });

            // Định hướng tuần tới: lấy next_focus của buổi GẦN NHẤT có giá trị — reports đã được sắp
            // xếp tăng dần theo ngày ở generateWeeklyReport(), nên duyệt ngược để tìm buổi mới nhất.
            var nextFocus = null;
            for (var i = reports.length - 1; i >= 0; i--) {
                var v = (reports[i].next_focus || '').trim();
                if (v) { nextFocus = v; break; }
            }

            return {
                highlights: highlights,
                assessmentTally: assessmentTally,
                strengths: wrCollectUnique(reports, 'strengths'),
                improvements: wrCollectUnique(reports, 'improvements'),
                homework: wrCollectUnique(reports, 'homework'),
                parentNotes: wrCollectUnique(reports, 'parent_note'),
                nextFocus: nextFocus
            };
        }

        function wrBulletListHtml(items, emptyText) {
            if (!items.length) return '<div class="wr-summary-empty">' + escapeHtml(emptyText) + '</div>';
            return '<ul class="wr-bullet-list">' + items.map(function(it) {
                return '<li><span class="wr-bullet-date">' + escapeHtml(formatDate(it.date)) + '</span> ' + escapeHtml(it.text) + '</li>';
            }).join('') + '</ul>';
        }

        function wrAssessmentTallyHtml(tally) {
            var keys = Object.keys(tally);
            if (!keys.length) return '<div class="wr-summary-empty">Chưa có đánh giá mức độ tiếp thu.</div>';
            return '<div class="wr-tally-row">' + keys.map(function(k) {
                return '<span class="wr-tally-chip">' + escapeHtml(k) + ': ' + tally[k] + '</span>';
            }).join('') + '</div>';
        }

        // Khối tổng kết tuần (mục 2-8 của Weekly Report V2) — DÙNG CHUNG cho preview trong app VÀ file
        // xuất HTML, giống nguyên tắc của wrSessionBlockHtml() với danh sách từng buổi.
        function wrWeeklySummaryHtml(summary) {
            return '<div class="wr-summary-block">'
                + '<div class="wr-summary-section"><div class="wr-summary-title">📝 Nội dung đã học nổi bật</div>' + wrBulletListHtml(summary.highlights, 'Chưa có nội dung.') + '</div>'
                + '<div class="wr-summary-section"><div class="wr-summary-title">📊 Mức độ tiếp thu</div>' + wrAssessmentTallyHtml(summary.assessmentTally) + '</div>'
                + '<div class="wr-summary-section"><div class="wr-summary-title">💪 Điểm mạnh</div>' + wrBulletListHtml(summary.strengths, 'Chưa ghi nhận điểm mạnh nổi bật.') + '</div>'
                + '<div class="wr-summary-section"><div class="wr-summary-title">🎯 Cần cải thiện</div>' + wrBulletListHtml(summary.improvements, 'Chưa ghi nhận điểm cần cải thiện.') + '</div>'
                + '<div class="wr-summary-section"><div class="wr-summary-title">📚 Bài tập về nhà</div>' + wrBulletListHtml(summary.homework, 'Không có bài tập về nhà trong tuần.') + '</div>'
                + '<div class="wr-summary-section"><div class="wr-summary-title">💬 Nhận xét cho phụ huynh</div>' + wrBulletListHtml(summary.parentNotes, 'Chưa có nhận xét cho phụ huynh.') + '</div>'
                + '<div class="wr-summary-section"><div class="wr-summary-title">🔭 Định hướng tuần tới</div>'
                + (summary.nextFocus ? '<div class="wr-summary-text">' + escapeHtml(summary.nextFocus) + '</div>' : '<div class="wr-summary-empty">Chưa xác định định hướng tuần tới.</div>')
                + '</div>'
                + '</div>';
        }

        async function generateWeeklyReport() {
            var student = getActiveProfileStudent();
            var box = document.getElementById('wr-preview-box');
            var exportBtn = document.getElementById('wr-export-btn');
            if (!box || !student) return;

            activeWeeklyReport = null;
            if (exportBtn) exportBtn.style.display = 'none';

            var pickInput = document.getElementById('wr-pick-date');
            var pickedDate = (pickInput && pickInput.value) || getLocalIsoDate(new Date());
            if (pickInput && !pickInput.value) pickInput.value = pickedDate;
            var range = wrWeekRangeForDate(pickedDate);

            box.innerHTML = '<div class="sp-empty-state">Đang tải báo cáo tuần...</div>';

            if (!window.getSessionReportsByStudent) {
                box.innerHTML = '<div class="sp-empty-state">Chưa sẵn sàng tải báo cáo.</div>';
                return;
            }

            var result = await window.getSessionReportsByStudent(student.id, {
                status: 'submitted',
                fromDate: range.start,
                toDate: range.end
            });
            if (result.error) {
                box.innerHTML = '<div class="sp-empty-state">Không thể tải báo cáo tuần.</div>';
                return;
            }

            // Trình bày báo cáo tuần theo trình tự thời gian (cũ → mới), khác thứ tự "mới nhất trước"
            // của danh sách lịch sử phía trên — phù hợp hơn cho tường thuật một tuần học.
            var reports = (result.data || []).slice().sort(function(a, b) {
                return (a.session_date || '').localeCompare(b.session_date || '');
            });

            var lessonCache = lessonsCacheByStudent[student.id] || [];

            // group_sessions.duration lưu theo PHÚT (khác lessons.duration lưu theo GIỜ — xem ghi chú
            // đơn vị PHÚT ở js/calendar/calendar.js:206). Lấy MỘT LẦN theo danh sách group_session_id
            // xuất hiện trong tuần (KHÔNG query riêng từng report — vẫn tránh N+1), rồi chia /60 khi
            // cộng vào totalHours để tổng giờ luôn đúng đơn vị GIỜ.
            var groupSessionIds = Array.from(new Set(
                reports
                    .filter(function(r) { return r.source_type === 'group_session' && r.group_session_id; })
                    .map(function(r) { return r.group_session_id; })
            ));
            var groupSessionDurationById = {};
            if (groupSessionIds.length) {
                var gsResult = await supabaseClient.from('group_sessions').select('id, duration').in('id', groupSessionIds);
                if (!gsResult.error && gsResult.data) {
                    gsResult.data.forEach(function(gs) { groupSessionDurationById[gs.id] = gs.duration; });
                }
            }

            var totalHours = 0;
            var hasUntimedSession = false;
            reports.forEach(function(r) {
                if (r.source_type === 'lesson') {
                    var lesson = lessonCache.find(function(l) { return l.id === r.lesson_id; });
                    if (lesson && lesson.duration != null) totalHours += Number(lesson.duration) || 0; // lessons.duration: GIỜ
                    else hasUntimedSession = true;
                } else if (r.source_type === 'group_session') {
                    var gsDuration = groupSessionDurationById[r.group_session_id];
                    if (gsDuration != null) totalHours += (Number(gsDuration) || 0) / 60; // group_sessions.duration: PHÚT -> GIỜ
                    else hasUntimedSession = true;
                } else {
                    hasUntimedSession = true;
                }
            });

            var groupCount = reports.filter(function(r) { return r.source_type === 'group_session'; }).length;
            var oneOnOneCount = reports.length - groupCount;
            var contextParts = [];
            if (oneOnOneCount > 0) contextParts.push(student.subject || 'Buổi 1-1');
            if (groupCount > 0) contextParts.push('Lớp nhóm');
            var contextLabel = contextParts.length ? contextParts.join(' · ') : (student.subject || '—');

            // Điểm danh: session_reports không lưu trạng thái điểm danh trực tiếp, nhưng trigger DB đã
            // đảm bảo báo cáo lớp nhóm submitted CHỈ tồn tại khi điểm danh present/late (session_reports_v1.sql),
            // nên có thể tóm tắt mà KHÔNG cần thêm query. Với buổi 1-1 không có khái niệm điểm danh riêng
            // nên phần này CHỈ hiển thị "khi có" (when available) buổi lớp nhóm trong tuần.
            var attendanceSummary = groupCount > 0
                ? groupCount + ' buổi lớp nhóm đã điểm danh có mặt/đi trễ'
                : null;

            activeWeeklyReport = {
                student: student,
                range: range,
                reports: reports,
                totalHours: totalHours,
                hasUntimedSession: hasUntimedSession,
                contextLabel: contextLabel,
                attendanceSummary: attendanceSummary
            };

            box.innerHTML = wrRenderPreview(activeWeeklyReport);
            if (exportBtn) exportBtn.style.display = '';
        }

        function wrRenderPreview(data) {
            var metaHtml = '<div class="wr-summary-title">🧭 Tổng quan tuần</div>'
                + '<div class="wr-meta-row">'
                + '<div class="wr-meta-item"><div class="lbl">Học sinh</div><div class="val">' + escapeHtml(data.student.name) + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Môn học / Lớp</div><div class="val">' + escapeHtml(data.contextLabel) + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Tuần</div><div class="val" style="font-size:13px;">' + escapeHtml(formatDate(data.range.start)) + ' – ' + escapeHtml(formatDate(data.range.end)) + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Số buổi</div><div class="val">' + data.reports.length + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Tổng số giờ</div><div class="val">' + (data.totalHours > 0 ? data.totalHours.toLocaleString('vi-VN') + ' giờ' : '—') + (data.hasUntimedSession ? '*' : '') + '</div></div>'
                + '</div>';
            var attendanceHtml = data.attendanceSummary
                ? '<div class="wr-session-field" style="margin-bottom:12px;"><strong>Điểm danh:</strong> ' + escapeHtml(data.attendanceSummary) + '</div>'
                : '';
            var noteHtml = data.hasUntimedSession
                ? '<div class="wr-session-field" style="margin-bottom:12px;">*Một số buổi chưa có dữ liệu thời lượng nên chưa tính vào tổng số giờ.</div>'
                : '';

            if (!data.reports.length) {
                return metaHtml + '<div class="sp-empty-state">Không có báo cáo đã hoàn thành nào trong tuần này.</div>';
            }

            // Weekly Report V2: khối tổng kết tuần (mục 2-8) đặt TRƯỚC danh sách từng buổi.
            var summaryHtml = wrWeeklySummaryHtml(wrBuildWeeklySummary(data.reports));
            var sessionsHtml = data.reports.map(function(r) { return wrSessionBlockHtml(r, data.student); }).join('');
            return metaHtml + attendanceHtml + noteHtml + summaryHtml + sessionsHtml;
        }

        window.generateWeeklyReport = generateWeeklyReport;

        // ---- XUẤT HTML BÁO CÁO TUẦN (A4, in được, UTF-8 tiếng Việt) ----
        function exportWeeklyReportHtml() {
            if (!activeWeeklyReport) return;
            var data = activeWeeklyReport;
            var now = new Date();
            var dateStr = now.toLocaleDateString('vi-VN');

            // Weekly Report V2: khối tổng kết tuần (mục 2-8) đặt TRƯỚC danh sách từng buổi.
            var summaryHtml = data.reports.length ? wrWeeklySummaryHtml(wrBuildWeeklySummary(data.reports)) : '';
            var sessionsHtml = data.reports.length
                ? data.reports.map(function(r) { return wrSessionBlockHtml(r, data.student); }).join('')
                : '<div class="wr-empty">Không có báo cáo đã hoàn thành nào trong tuần này.</div>';
            var attendanceHtml = data.attendanceSummary
                ? '<div class="wr-note"><strong>Điểm danh:</strong> ' + escapeHtml(data.attendanceSummary) + '</div>'
                : '';
            var hoursNote = data.hasUntimedSession
                ? '<div class="wr-note">*Một số buổi chưa có dữ liệu thời lượng nên chưa tính vào tổng số giờ.</div>'
                : '';

            var html = '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">'
                + '<meta name="viewport" content="width=device-width, initial-scale=1">'
                + '<title>Báo cáo tuần – ' + escapeHtml(data.student.name) + '</title>'
                + '<style>'
                + '@page { size: A4; margin: 18mm 16mm; }'
                + 'body{font-family:Arial,"Segoe UI",Helvetica,sans-serif;background:#f4f5f7;color:#1a1a2e;margin:0;padding:24px;}'
                + '.wr-wrap{max-width:760px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 18px rgba(0,0,0,0.08);overflow:hidden;}'
                + '.wr-header{background:#134e38;padding:28px 36px;}'
                + '.wr-header h1{margin:0 0 4px;font-size:22px;color:#fff;font-weight:800;}'
                + '.wr-header p{margin:0;font-size:13px;color:rgba(255,255,255,0.75);}'
                + '.wr-body{padding:28px 36px;}'
                + '.wr-meta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px;}'
                + '.wr-meta-item{flex:1;min-width:130px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;}'
                + '.wr-meta-item .lbl{font-size:9.5px;font-weight:700;letter-spacing:.5px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;}'
                + '.wr-meta-item .val{font-size:14px;font-weight:800;color:#1a1a2e;}'
                + '.wr-note{font-size:11.5px;color:#6b7280;margin-bottom:14px;}'
                + '.wr-empty{padding:16px;text-align:center;color:#6b7280;font-size:13px;border:1px dashed #e5e7eb;border-radius:8px;}'
                + '.wr-session-block{border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:12px;background:#fff;page-break-inside:avoid;}'
                + '.wr-session-head{font-weight:700;font-size:13.5px;margin-bottom:8px;color:#134e38;border-bottom:1px solid #f0f0f0;padding-bottom:6px;}'
                + '.wr-session-field{font-size:12.5px;color:#374151;margin-top:5px;line-height:1.5;}'
                + '.wr-session-field strong{color:#111827;}'
                + '.wr-summary-block{margin-bottom:18px;}'
                + '.wr-summary-section{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:10px;background:#fbfcfe;page-break-inside:avoid;}'
                + '.wr-summary-title{font-weight:700;font-size:13px;color:#134e38;margin-bottom:6px;}'
                + '.wr-summary-text{font-size:12.5px;color:#374151;line-height:1.5;}'
                + '.wr-summary-empty{font-size:12px;color:#9ca3af;font-style:italic;}'
                + '.wr-bullet-list{margin:0;padding-left:18px;}'
                + '.wr-bullet-list li{font-size:12.5px;color:#374151;margin-bottom:4px;line-height:1.5;}'
                + '.wr-bullet-date{font-size:11px;color:#6b7280;font-weight:700;margin-right:4px;}'
                + '.wr-tally-row{display:flex;gap:8px;flex-wrap:wrap;}'
                + '.wr-tally-chip{background:#eef2ff;color:#3730a3;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;}'
                + '.wr-footer{background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 36px;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between;}'
                + '@media print{body{background:#fff;padding:0;}.wr-wrap{box-shadow:none;border-radius:0;max-width:none;}}'
                + '</style>'
                + '</head><body><div class="wr-wrap">'
                + '<div class="wr-header"><h1>📋 Báo cáo tuần học tập</h1><p>Tuần ' + escapeHtml(formatDate(data.range.start)) + ' – ' + escapeHtml(formatDate(data.range.end)) + ' · GiaSu Manager Pro</p></div>'
                + '<div class="wr-body">'
                + '<div class="wr-meta-row">'
                + '<div class="wr-meta-item"><div class="lbl">Học sinh</div><div class="val">' + escapeHtml(data.student.name) + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Môn học / Lớp</div><div class="val">' + escapeHtml(data.contextLabel) + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Số buổi</div><div class="val">' + data.reports.length + '</div></div>'
                + '<div class="wr-meta-item"><div class="lbl">Tổng số giờ</div><div class="val">' + (data.totalHours > 0 ? data.totalHours.toLocaleString('vi-VN') + ' giờ' : '—') + (data.hasUntimedSession ? '*' : '') + '</div></div>'
                + '</div>'
                + attendanceHtml + hoursNote
                + summaryHtml
                + sessionsHtml
                + '</div>'
                + '<div class="wr-footer"><span>GiaSu Manager Pro · Báo cáo tự động</span><span>Xuất ngày ' + dateStr + '</span></div>'
                + '</div></bo' + 'dy></ht' + 'ml>';

            var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'BaoCao_Tuan_' + data.student.name.replace(/\s+/g, '_') + '_' + data.range.start + '_' + data.range.end + '.html';
            a.click();
        }

        window.exportWeeklyReportHtml = exportWeeklyReportHtml;

        // Tìm buổi học TƯƠNG LAI gần nhất (status scheduled, ngày+giờ >= hiện tại). Nếu không có lesson
        // nào trong tương lai, fallback sang student_schedules (lịch cố định) để TÍNH lịch dự kiến —
        // KHÔNG tạo lesson giả, chỉ hiển thị thông tin dự kiến.
        function computeNextLesson(student) {
            var now = new Date();
            var cache = (lessonsCacheByStudent[student.id] || []).slice();
            var future = cache.filter(function(l) {
                if (l.status !== 'scheduled' || !l.scheduled_date) return false;
                var dt = new Date(l.scheduled_date + 'T' + (l.start_time || '00:00'));
                return dt.getTime() >= now.setHours(0,0,0,0) && (l.scheduled_date > getLocalIsoDate(now) || (l.scheduled_date === getLocalIsoDate(now)));
            });
            future.sort(function(a, b) {
                return (a.scheduled_date + (a.start_time || '')).localeCompare(b.scheduled_date + (b.start_time || ''));
            });
            if (future.length) return { type: 'lesson', lesson: future[0] };

            // Fallback: student_schedules — tìm occurrence gần nhất trong 14 ngày tới theo day_of_week.
            var rows = scheduleRowsCacheByStudent[student.id] || [];
            if (!rows.length) return null;
            var todayRef = new Date();
            for (var i = 0; i <= 14; i++) {
                var d = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate() + i);
                var dayName = DAY_NUMBER_TO_NAME[d.getDay()];
                var match = rows.find(function(r) { return r.day_of_week === dayName; });
                if (match) {
                    return { type: 'schedule', isoDate: getLocalIsoDate(d), dayName: dayName, start_time: match.start_time, duration: match.duration };
                }
            }
            return null;
        }

        function renderStudentHero(student) {
            var avatar = document.getElementById('sp-hero-avatar');
            if (avatar) avatar.innerText = (student.name || '?').charAt(0).toUpperCase();
            var nameEl = document.getElementById('sp-hero-name'); if (nameEl) nameEl.innerText = student.name || '—';
            var metaEl = document.getElementById('sp-hero-meta');
            if (metaEl) metaEl.innerText = [student.grade, student.subject].filter(Boolean).join(' · ') || (student.subject || '—');
            var statusEl = document.getElementById('sp-hero-status');
            if (statusEl) {
                var isActive = !student.status || student.status === 'active' || student.status === 'Đang học';
                statusEl.innerHTML = isActive ? '<span style="color:#10b981;">🟢 Đang học</span>' : '<span style="color:var(--text-sub);">⚪ ' + escapeHtml(student.status) + '</span>';
            }
            var nextEl = document.getElementById('sp-hero-next');
            var next = computeNextLesson(student);
            if (nextEl) {
                if (!next) {
                    nextEl.innerHTML = 'Chưa có buổi học sắp tới.';
                } else if (next.type === 'lesson') {
                    var l = next.lesson;
                    var dp = l.scheduled_date.split('-');
                    nextEl.innerHTML = '📅 Buổi tiếp theo: <strong>' + dp[2] + '/' + dp[1] + ' · ' + (l.start_time || '—') + '</strong>';
                } else {
                    nextEl.innerHTML = '📅 Buổi tiếp theo (dự kiến theo lịch cố định): <strong>' + next.dayName + ' · ' + (next.start_time || '—') + '</strong>';
                }
            }
        }

        // KPI overview — TOÀN BỘ số liệu tính từ lessonsCacheByStudent/paymentsCacheByStudent thật,
        // không hard-code. Nếu chưa có lesson nào -> hiển thị "—" theo đúng yêu cầu.
        function computeStudentStats(student) {
            var cache = lessonsCacheByStudent[student.id] || [];
            var total = cache.length;
            var completed = 0, cancelled = 0, absent = 0, scheduled = 0;
            var thisMonth = getLocalIsoDate(new Date()).slice(0, 7);
            var tuitionThisMonth = 0;
            var rateVnd = (Number(student.rate) || 0) * 1000;
            cache.forEach(function(l) {
                if (l.status === 'completed') {
                    completed++;
                    if (l.scheduled_date && l.scheduled_date.slice(0, 7) === thisMonth) tuitionThisMonth += rateVnd;
                } else if (l.status === 'cancelled') cancelled++;
                else if (l.status === 'absent') absent++;
                else scheduled++;
            });
            var concluded = completed + cancelled + absent;
            var attendanceRate = concluded > 0 ? Math.round((completed / concluded) * 1000) / 10 : null;
            return {
                total: total, completed: completed, cancelled: cancelled, absent: absent, scheduled: scheduled,
                attendanceRate: attendanceRate, tuitionThisMonth: tuitionThisMonth
            };
        }

        function renderStudentKPIs(student) {
            if (!student._supabaseSource) {
                ['sp-kpi-total','sp-kpi-completed','sp-kpi-attendance','sp-kpi-tuition'].forEach(function(id) {
                    var el = document.getElementById(id); if (el) el.innerText = '—';
                });
                return;
            }
            var s = computeStudentStats(student);
            document.getElementById('sp-kpi-total').innerText = s.total;
            document.getElementById('sp-kpi-completed').innerText = s.completed;
            document.getElementById('sp-kpi-attendance').innerText = s.attendanceRate === null ? '—' : (s.attendanceRate + '%');
            document.getElementById('sp-kpi-tuition').innerText = s.tuitionThisMonth.toLocaleString('vi-VN') + 'đ';
        }

        function spEmptyState(icon, title, desc) {
            return '<div class="sp-empty-state"><div class="sp-empty-state-icon">' + icon + '</div>'
                + '<div class="sp-empty-state-title">' + escapeHtml(title) + '</div>'
                + '<div class="sp-empty-state-desc">' + escapeHtml(desc) + '</div></div>';
        }

        function spFormatLessonDate(isoDate) {
            var p = isoDate.split('-');
            return p[2] + '/' + p[1];
        }

        function renderOverviewTab(student) {
            var nextBox = document.getElementById('sp-next-lesson-box');
            var actBox = document.getElementById('sp-recent-activity-box');
            if (!nextBox || !actBox) return;

            if (!student._supabaseSource) {
                nextBox.innerHTML = spEmptyState('📚', 'Chưa có dữ liệu', 'Học sinh local (chưa liên kết Supabase) chưa có dữ liệu buổi học chi tiết.');
                actBox.innerHTML = '';
                return;
            }

            // ----- Buổi học tiếp theo -----
            var next = computeNextLesson(student);
            if (!next) {
                nextBox.innerHTML = spEmptyState('📅', 'Chưa có buổi học sắp tới', '');
            } else if (next.type === 'lesson') {
                var l = next.lesson;
                var dayName = DAY_NUMBER_TO_NAME[new Date(l.scheduled_date + 'T00:00:00').getDay()];
                var endTime = '';
                if (l.start_time && l.duration != null) {
                    var hm = l.start_time.split(':'); var startMin = parseInt(hm[0]) * 60 + parseInt(hm[1] || 0);
                    var endMin = startMin + Math.round(Number(l.duration) * 60);
                    endTime = ' – ' + String(Math.floor(endMin / 60) % 24).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
                }
                nextBox.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--text-main);">' + dayName + ' · ' + (l.start_time || '—') + endTime + '</div>'
                    + '<div style="font-size:12px;color:var(--text-sub);margin-top:4px;">' + escapeHtml(student.subject || '') + (l.duration != null ? ' · ' + l.duration + ' giờ' : '') + '</div>'
                    + '<button type="button" class="btn-secondary" style="padding:6px 12px;font-size:11.5px;margin-top:10px;" onclick="openLessonDetailModal(getActiveProfileStudent(),\'' + l.scheduled_date + '\',\'' + dayName + '\')">Mở buổi học</button>';
            } else {
                nextBox.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--text-main);">' + next.dayName + ' · ' + (next.start_time || '—') + ' <span style="font-weight:400;color:var(--text-sub);font-size:11.5px;">(dự kiến theo lịch cố định)</span></div>'
                    + '<div style="font-size:12px;color:var(--text-sub);margin-top:4px;">' + escapeHtml(student.subject || '') + (next.duration != null ? ' · ' + next.duration + ' giờ' : '') + '</div>';
            }

            // ----- Hoạt động gần đây (5 lessons gần nhất) -----
            var cache = (lessonsCacheByStudent[student.id] || []).slice().sort(function(a, b) {
                return (b.scheduled_date + (b.start_time || '')).localeCompare(a.scheduled_date + (a.start_time || ''));
            });
            if (!cache.length) {
                actBox.innerHTML = spEmptyState('📚', 'Chưa có buổi học', 'Lịch sử học tập sẽ xuất hiện sau buổi học đầu tiên.');
            } else {
                actBox.innerHTML = cache.slice(0, 5).map(function(l) {
                    var dayName = DAY_NUMBER_TO_NAME[new Date(l.scheduled_date + 'T00:00:00').getDay()];
                    var meta = lessonStatusMeta[l.status] || lessonStatusMeta.scheduled;
                    return '<div class="sp-activity-item" onclick="openLessonDetailModal(getActiveProfileStudent(),\'' + l.scheduled_date + '\',\'' + dayName + '\')">'
                        + '<div class="sp-activity-date">' + spFormatLessonDate(l.scheduled_date) + '</div>'
                        + '<div class="sp-activity-mid">📚 ' + escapeHtml(student.subject || '') + '</div>'
                        + '<div class="sp-activity-status">' + (lessonStatusIcon[l.status] || '') + ' ' + meta.label + '</div>'
                        + '</div>';
                }).join('');
            }
        }

        function spSetHistoryFilter(f) {
            spHistoryFilterState = f;
            document.querySelectorAll('#sp-history-filter-row .sp-filter-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-sp-history-filter') === f);
            });
            renderStudentHistoryTab(getActiveProfileStudent());
        }

        // Tab "Lịch sử học" — timeline mới nhất -> cũ nhất, có filter + search realtime (client-side,
        // KHÔNG gọi Supabase). Click 1 buổi -> mở đúng Lesson Detail hiện có (KHÔNG tạo modal thứ hai).
        function renderStudentHistoryTab(student) {
            var box = document.getElementById('sp-history-list-box');
            if (!box || !student) return;
            if (!student._supabaseSource) {
                box.innerHTML = spEmptyState('📚', 'Chưa có dữ liệu', 'Học sinh local chưa có dữ liệu buổi học chi tiết.');
                return;
            }
            var cache = (lessonsCacheByStudent[student.id] || []).slice().sort(function(a, b) {
                return (b.scheduled_date + (b.start_time || '')).localeCompare(a.scheduled_date + (a.start_time || ''));
            });
            if (!cache.length) {
                box.innerHTML = spEmptyState('📚', 'Chưa có buổi học', 'Lịch sử học tập sẽ xuất hiện sau buổi học đầu tiên.');
                return;
            }

            var q = (spHistorySearchState || '').trim().toLowerCase();
            var filtered = cache.filter(function(l) {
                if (spHistoryFilterState === 'completed' && l.status !== 'completed') return false;
                if (spHistoryFilterState === 'scheduled' && l.status !== 'scheduled') return false;
                if (spHistoryFilterState === 'cancelled' && l.status !== 'cancelled') return false;
                if (q) {
                    var hay = [l.scheduled_date, student.subject].join(' ').toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                return true;
            });

            if (!filtered.length) {
                box.innerHTML = spEmptyState('🔍', 'Không tìm thấy kết quả', 'Thử đổi bộ lọc hoặc từ khóa tìm kiếm khác.');
                return;
            }

            box.innerHTML = filtered.map(function(l) {
                var dayName = DAY_NUMBER_TO_NAME[new Date(l.scheduled_date + 'T00:00:00').getDay()];
                var dp = l.scheduled_date.split('-');
                var meta = lessonStatusMeta[l.status] || lessonStatusMeta.scheduled;
                var endTime = '';
                if (l.start_time && l.duration != null) {
                    var hm = l.start_time.split(':'); var startMin = parseInt(hm[0]) * 60 + parseInt(hm[1] || 0);
                    var endMin = startMin + Math.round(Number(l.duration) * 60);
                    endTime = ' → ' + String(Math.floor(endMin / 60) % 24).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
                }
                var actionBtn = '<button type="button" class="btn-secondary" style="padding:6px 12px;font-size:11.5px;" onclick="openLessonDetailModal(getActiveProfileStudent(),\'' + l.scheduled_date + '\',\'' + dayName + '\')">Mở chi tiết</button>';
                return '<div class="sp-timeline-item">'
                    + '<div class="sp-timeline-top"><span class="sp-timeline-subject">📚 ' + escapeHtml(student.subject || '') + '</span>'
                    + '<span class="sp-timeline-time">' + dp[2] + '/' + dp[1] + '/' + dp[0] + ' · ' + (l.start_time || '—') + endTime + '</span></div>'
                    + '<div style="font-size:12px;font-weight:700;">' + (lessonStatusIcon[l.status] || '') + ' ' + meta.label + '</div>'
                    + '<div class="sp-timeline-actions">' + actionBtn + '</div>'
                    + '</div>';
            }).join('');
        }

        // Tab "Tiến độ" — thống kê + chart CSS đơn giản (không cần thư viện mới) + streak. Tất cả tính
        // từ lessonsCacheByStudent thật; nếu dữ liệu không đủ để tính chuỗi thì báo đúng thực tế.
        function renderStudentProgressTab(student) {
            var statsRow = document.getElementById('sp-progress-stats-row');
            var chartBox = document.getElementById('sp-progress-chart-box');
            var streakBox = document.getElementById('sp-progress-streak-box');
            if (!statsRow || !chartBox || !streakBox) return;

            if (!student._supabaseSource) {
                statsRow.innerHTML = ''; chartBox.innerHTML = spEmptyState('📈', 'Chưa có dữ liệu', 'Học sinh local chưa có dữ liệu buổi học chi tiết.'); streakBox.innerHTML = '—';
                return;
            }

            var s = computeStudentStats(student);
            statsRow.innerHTML = ''
                + '<div class="sp-progress-stat"><div class="sp-progress-stat-val">' + s.total + '</div><div class="sp-progress-stat-lbl">Tổng buổi</div></div>'
                + '<div class="sp-progress-stat"><div class="sp-progress-stat-val" style="color:#10b981;">' + s.completed + '</div><div class="sp-progress-stat-lbl">Hoàn thành</div></div>'
                + '<div class="sp-progress-stat"><div class="sp-progress-stat-val" style="color:#ef4444;">' + s.cancelled + '</div><div class="sp-progress-stat-lbl">Đã huỷ</div></div>'
                + '<div class="sp-progress-stat"><div class="sp-progress-stat-val" style="color:#f59e0b;">' + s.scheduled + '</div><div class="sp-progress-stat-lbl">Chưa học</div></div>';

            // Chart: số buổi học theo tháng, 6 tháng gần nhất tính đến tháng hiện tại.
            var cache = lessonsCacheByStudent[student.id] || [];
            var now = new Date();
            var months = [];
            for (var i = 5; i >= 0; i--) {
                var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
            }
            var counts = months.map(function(mk) {
                return cache.filter(function(l) { return l.scheduled_date && l.scheduled_date.slice(0, 7) === mk; }).length;
            });
            var maxCount = Math.max.apply(null, counts.concat([1]));
            if (counts.every(function(c) { return c === 0; })) {
                chartBox.innerHTML = spEmptyState('📊', 'Chưa có dữ liệu', 'Chưa có buổi học nào trong 6 tháng gần đây.');
            } else {
                chartBox.innerHTML = months.map(function(mk, idx) {
                    var pct = Math.round((counts[idx] / maxCount) * 100);
                    var label = 'Th' + parseInt(mk.split('-')[1], 10);
                    return '<div class="sp-chart-row"><div class="sp-chart-label">' + label + '</div>'
                        + '<div class="sp-chart-track"><div class="sp-chart-fill" style="width:' + pct + '%;"></div></div>'
                        + '<div class="sp-chart-count">' + counts[idx] + '</div></div>';
                }).join('');
            }

            // Streak: số TUẦN liên tiếp (Thứ 2 - Chủ Nhật) có ít nhất 1 buổi completed, đếm lùi từ tuần
            // hiện tại. Nếu tuần hiện tại chưa có completed, bắt đầu đếm từ tuần gần nhất có dữ liệu.
            var completedDates = cache.filter(function(l) { return l.status === 'completed' && l.scheduled_date; })
                .map(function(l) { return l.scheduled_date; }).sort();
            if (!completedDates.length) {
                streakBox.innerHTML = 'Chưa có buổi học hoàn thành nào để tính chuỗi.';
            } else {
                function isoWeekKey(dateStr) {
                    var d = new Date(dateStr + 'T00:00:00');
                    var day = (d.getDay() + 6) % 7; // 0 = Thứ 2
                    d.setDate(d.getDate() - day);
                    return getLocalIsoDate(d);
                }
                var weekSet = {};
                completedDates.forEach(function(ds) { weekSet[isoWeekKey(ds)] = true; });
                var lastWeekStart = new Date(isoWeekKey(completedDates[completedDates.length - 1]) + 'T00:00:00');
                var streak = 0;
                var cursor = new Date(lastWeekStart);
                while (weekSet[getLocalIsoDate(cursor)]) {
                    streak++;
                    cursor.setDate(cursor.getDate() - 7);
                }
                streakBox.innerHTML = streak >= 2
                    ? '🔥 <strong>' + streak + ' tuần liên tiếp</strong> có buổi học hoàn thành.'
                    : (streak === 1 ? 'Mới có 1 tuần có buổi học hoàn thành — chưa đủ để tính chuỗi liên tiếp.' : 'Chưa có buổi học hoàn thành nào để tính chuỗi.');
            }
        }

        // setLessonStatusForDate/removeLessonForDate và Lesson Detail Modal (open/close/render)
        // đã tách sang js/lessons/lessons.js (STEP 7D). Các hàm này vẫn accessible như global qua
        // window.* (xem lessons.js) — không đổi cách gọi ở bất kỳ đâu khác trong file này.

        // ================================================================
        // ===== MODULE public.payments (GIAO DỊCH HỌC PHÍ) =====
        // ================================================================
        // Nguồn dữ liệu CHÍNH: bảng public.payments trên Supabase — KHÔNG dùng student.feePaidMonths
        // (boolean cũ) làm nguồn chính nữa cho học sinh Supabase (_supabaseSource = true).
        // Mỗi payment là MỘT giao dịch thực tế (không ghi đè) — nhiều payment có thể cùng student_id + period.
        // student_schedules = lịch học định kỳ, lessons = buổi học thực tế, payments = giao dịch học phí:
        // ba module này KHÔNG trộn lẫn. Dùng chung cho cả Tutor và Admin (RLS đã đảm bảo phân quyền).

        // Nạp toàn bộ payments của MỘT học sinh từ Supabase (mới nhất trước). Hàm DUY NHẤT đọc bảng
        // payments theo student_id — dùng chung cho Tutor và Admin.
        async function loadStudentPayments(studentId) {
            if (!studentId) return { data: [], error: null };
            try {
                const { data, error } = await supabaseClient
                    .from('payments')
                    .select('*')
                    .eq('student_id', studentId)
                    .order('payment_date', { ascending: false });
                if (error) {
                    console.error('loadStudentPayments lỗi:', error);
                    return { data: null, error: error };
                }
                paymentsCacheByStudent[studentId] = data || [];
                return { data: data || [], error: null };
            } catch (err) {
                console.error('loadStudentPayments exception:', err);
                return { data: null, error: err };
            }
        }

        // Nạp payments cho NHIỀU học sinh cùng lúc (dùng khi tải danh sách lớp của một Tutor), để
        // renderClassList/Finance Dashboard có dữ liệu thanh toán mà không cần mở từng hồ sơ học sinh.
        async function fetchPaymentsMapForStudents(studentIds) {
            if (!studentIds || studentIds.length === 0) return;
            try {
                const { data, error } = await supabaseClient
                    .from('payments')
                    .select('*')
                    .in('student_id', studentIds)
                    .order('payment_date', { ascending: false });
                if (error) {
                    console.warn('Không lấy được payments:', error.message);
                    return;
                }
                var grouped = {};
                studentIds.forEach(function(id) { grouped[id] = []; });
                (data || []).forEach(function(p) {
                    if (!grouped[p.student_id]) grouped[p.student_id] = [];
                    grouped[p.student_id].push(p);
                });
                Object.keys(grouped).forEach(function(id) { paymentsCacheByStudent[id] = grouped[id]; });
            } catch (err) {
                console.warn('fetchPaymentsMapForStudents exception:', err);
            }
        }

        // Nạp lessons cho NHIỀU học sinh cùng lúc từ public.lessons — dùng cho Finance Dashboard
        // (cần biết buổi completed của TẤT CẢ học sinh trong classList, không chỉ học sinh đang mở
        // hồ sơ). Đây KHÔNG phải bản sao của loadStudentLessons() (hàm đó chỉ tải 1 học sinh, dùng
        // cho trang hồ sơ) — hàm này bổ sung cho trường hợp cần tải NHIỀU học sinh trong 1 lần gọi,
        // ghi thẳng vào CÙNG một cache lessonsCacheByStudent để mọi nơi đọc cache đều thấy dữ liệu
        // mới nhất, không tạo cache song song.
        async function fetchLessonsMapForStudents(studentIds) {
            if (!studentIds || studentIds.length === 0) return { error: null };
            try {
                const { data, error } = await supabaseClient
                    .from('lessons')
                    .select('*')
                    .in('student_id', studentIds);
                if (error) {
                    console.warn('Không lấy được lessons (bulk):', error.message);
                    return { error: error };
                }
                var grouped = {};
                studentIds.forEach(function(id) { grouped[id] = []; });
                (data || []).forEach(function(l) {
                    if (!grouped[l.student_id]) grouped[l.student_id] = [];
                    grouped[l.student_id].push(l);
                });
                Object.keys(grouped).forEach(function(id) { lessonsCacheByStudent[id] = grouped[id]; });
                return { error: null };
            } catch (err) {
                console.warn('fetchLessonsMapForStudents exception:', err);
                return { error: err };
            }
        }

        // Tạo một payment mới (giao dịch thực tế) trong public.payments. KHÔNG gửi id/created_at
        // để database tự sinh UUID và timestamp.
        async function createPayment(payload) {
            try {
                var row = {
                    student_id: payload.student_id,
                    amount: payload.amount,
                    payment_date: payload.payment_date,
                    period: payload.period,
                    status: payload.status,
                    note: payload.note || null
                };
                const { data, error } = await supabaseClient
                    .from('payments')
                    .insert(row)
                    .select()
                    .single();
                if (error) {
                    console.error('createPayment lỗi:', error);
                    return { data: null, error: error };
                }
                if (!paymentsCacheByStudent[payload.student_id]) paymentsCacheByStudent[payload.student_id] = [];
                paymentsCacheByStudent[payload.student_id].unshift(data);
                return { data: data, error: null };
            } catch (err) {
                console.error('createPayment exception:', err);
                return { data: null, error: err };
            }
        }

        // Sửa một payment đã có, luôn UPDATE theo id (KHÔNG bao giờ theo student_id).
        async function updatePayment(paymentId, fields, studentId) {
            try {
                const { data, error } = await supabaseClient
                    .from('payments')
                    .update(fields)
                    .eq('id', paymentId)
                    .select()
                    .single();
                if (error) {
                    console.error('updatePayment lỗi:', error);
                    return { data: null, error: error };
                }
                if (studentId && paymentsCacheByStudent[studentId]) {
                    var idx = paymentsCacheByStudent[studentId].findIndex(function(p) { return p.id === paymentId; });
                    if (idx > -1) paymentsCacheByStudent[studentId][idx] = data;
                }
                return { data: data, error: null };
            } catch (err) {
                console.error('updatePayment exception:', err);
                return { data: null, error: err };
            }
        }

        // Xóa một payment — LUÔN confirm trước khi xóa thật trên Supabase.
        async function deletePayment(paymentId, studentId) {
            if (!confirm('Bạn có chắc muốn xóa khoản thanh toán này? Hành động này không thể hoàn tác.')) {
                return { data: null, error: null, cancelled: true };
            }
            try {
                const { error } = await supabaseClient
                    .from('payments')
                    .delete()
                    .eq('id', paymentId);
                if (error) {
                    console.error('deletePayment lỗi:', error);
                    return { data: null, error: error };
                }
                if (studentId && paymentsCacheByStudent[studentId]) {
                    paymentsCacheByStudent[studentId] = paymentsCacheByStudent[studentId].filter(function(p) { return p.id !== paymentId; });
                }
                return { data: true, error: null };
            } catch (err) {
                console.error('deletePayment exception:', err);
                return { data: null, error: err };
            }
        }

        // Lấy các payment (từ cache) của một học sinh khớp đúng 1 kỳ (period = "YYYY-MM").
        // STEP 11I-I (Phase 15 — LEGACY 1-to-1 ISOLATION, audit finding): hàm này là chokepoint
        // DUY NHẤT nuôi Finance Dashboard/Reports/Action Center/Student Profile (mọi nơi gọi
        // computeBillingStats cho 1-1 đều đi qua getPeriodPayments/getPeriodTotalPaid) — TRƯỚC
        // STEP này hàm KHÔNG loại trừ payments.group_class_id IS NOT NULL, nên 1 khi Group Class
        // payment (STEP 11I-I) tồn tại và trùng student_id + period (rất dễ xảy ra, xem PHASE 17
        // đề bài "SAME MONTH"), nó sẽ BỊ CỘNG NHẦM vào tổng 1-1. Thêm điều kiện loại trừ
        // group_class_id IS NOT NULL ở ĐÚNG 1 nơi duy nhất này để mọi caller phía trên tự động
        // được cách ly — KHÔNG sửa từng nơi gọi riêng lẻ, KHÔNG đổi computeBillingStats().
        function getPeriodPayments(studentId, periodKey) {
            var payments = paymentsCacheByStudent[studentId] || [];
            return payments.filter(function(p) { return p.period === periodKey && !p.group_class_id; });
        }

        // Tổng đã thu của 1 kỳ — delegate cho computeBillingStats() (Finance Core V1): chỉ cộng
        // payment có status 'paid' hoặc 'partial' ('cancelled'/'pending' KHÔNG được cộng).
        function getPeriodTotalPaid(studentId, periodKey) {
            return computeBillingStats([], getPeriodPayments(studentId, periodKey), 0).collected;
        }

        // Trạng thái TỔNG HỢP của một kỳ (tính từ payment data, không hard-code theo 1 boolean cũ):
        // - totalPaid <= 0                       -> 'pending'  (chưa thanh toán)
        // - 0 < totalPaid < expectedAmount        -> 'partial'  (thu một phần)
        // - totalPaid >= expectedAmount (hoặc expectedAmount <= 0 nhưng đã có tiền vào) -> 'paid' (đã thu đủ)
        function computePeriodStatus(totalPaid, expectedAmount) {
            if (totalPaid <= 0) return 'pending';
            if (expectedAmount > 0 && totalPaid < expectedAmount) return 'partial';
            return 'paid';
        }

        function getUsers() {
            return JSON.parse(localStorage.getItem('gsm_users') || '{}');
        }
        function saveUsers(users) {
            localStorage.setItem('gsm_users', JSON.stringify(users));
        }
        function getUserData(username) {
            return JSON.parse(localStorage.getItem('gsm_data_' + username) || '{"classList":[],"freeSchedule":{}}');
        }
        function saveUserData(username, data) {
            localStorage.setItem('gsm_data_' + username, JSON.stringify(data));
        }

        function switchAuthTab(tab) {
            document.getElementById('tab-login').classList.toggle('active', tab === 'login');
            document.getElementById('tab-register').classList.toggle('active', tab === 'register');
            document.getElementById('panel-login').classList.toggle('active', tab === 'login');
            document.getElementById('panel-register').classList.toggle('active', tab === 'register');
            document.getElementById('login-error').style.display = 'none';
            document.getElementById('register-error').style.display = 'none';
            document.getElementById('register-success-box').style.display = 'none';
            document.getElementById('register-form-inner').style.display = 'block';
            if (tab === 'register') { genCaptcha(); }
        }

        // ===== ADAPTER: Chuyển student từ Supabase sang cấu trúc classList hiện tại (CHỈ TRONG BỘ NHỚ) =====
        // Không sửa schema Supabase — hàm này chỉ ánh xạ dữ liệu để tái sử dụng UI/logic hiện có.
        // scheduleForStudent (tùy chọn): { days: [...], startTimes: [...] } lấy từ bảng public.student_schedules,
        // dùng khi 1 học sinh có NHIỀU ngày với giờ học khác nhau. Nếu không có, dùng field trực tiếp trên students.
        // KHÔNG hard-code "Thứ 2"/"18:00" — nếu dữ liệu thật sự không có lịch thì để trống, không bịa mặc định.
        function mapSupabaseStudentToClass(student, scheduleForStudent) {
            var days, day, startTime, startTimes;

            if (scheduleForStudent && scheduleForStudent.days && scheduleForStudent.days.length) {
                days = scheduleForStudent.days;
                startTimes = scheduleForStudent.startTimes;
                day = days[0];
                startTime = startTimes && startTimes[0];
            } else {
                days = student.days || (student.day ? [student.day] : []);
                day = student.day || (student.days && student.days[0]);
                startTimes = student.start_times || student.startTimes || (student.start_time || student.startTime ? [student.start_time || student.startTime] : []);
                startTime = student.start_time || student.startTime || (startTimes && startTimes[0]);
            }

            return {
                id: student.id,
                name: student.name || 'Không tên',
                subject: student.subject || '',
                rate: student.rate != null ? student.rate : 0,
                // BUG FIX: duration của lịch cố định nằm ở public.student_schedules.duration
                // (scheduleForStudent.duration), KHÔNG phải public.students.duration (cột này
                // luôn NULL với học sinh Supabase). Trước đây đọc nhầm student.duration khiến
                // getOccupiedClass() luôn nhận duration = null -> endTime = NaN -> không bao giờ
                // phát hiện được BUSY. Ưu tiên scheduleForStudent.duration, chỉ fallback về
                // student.duration cho nhánh tài khoản local cũ (không có scheduleForStudent).
                duration: (scheduleForStudent && scheduleForStudent.duration != null) ? scheduleForStudent.duration : student.duration,
                days: days,
                day: day,
                startTimes: startTimes,
                startTime: startTime,
                attendance: student.attendance || {},
                feePaidMonths: student.fee_paid_months || student.feePaidMonths || {},
                monthEvals: student.month_evals || student.monthEvals || {},
                sessions: student.sessions || 0,
                parent_phone: student.parent_phone || '',
                // Mục SEARCH+FILTER: school/parent_name/status đều là cột CÓ SẴN trên public.students
                // (không thêm cột mới) — bổ sung vào mapping để phục vụ tìm kiếm/lọc học sinh, các nơi
                // khác trong code không đọc field này nên không ảnh hưởng hành vi cũ.
                school: student.school || '',
                parent_name: student.parent_name || '',
                status: student.status || '',
                email: student.email || '',
                _supabaseSource: true
            };
        }

        // ================================================================================
        // ===== Dựng UI cho một phiên Supabase (Admin/Tutor) — DÙNG CHUNG cho 2 nơi: =====
        //   1) doLogin() khi user vừa đăng nhập bằng email/mật khẩu
        //   2) restoreSupabaseSessionIfAny() khi F5/tải lại trang mà JWT Supabase vẫn còn hạn
        // Tách ra đây để 2 luồng KHÔNG bị lệch logic với nhau (đây chính là loại bug khiến trạng
        // thái "đúng trước refresh, sai sau refresh": nếu chỉ doLogin() biết dựng lại state còn
        // lúc refresh không có hàm tương đương thì toàn bộ classList/currentTutor/... bị mất).
        // ================================================================================
        function enterAdminSessionUI(authUserId, profile) {
            currentUser = authUserId;
            currentAdminProfile = profile;
            isSupabaseAdminSession = true;
            document.getElementById('login-view').style.display = 'none';
            openAdminPanel();
        }

        async function enterTutorSessionUI(authUserId, tutor, authUserEmail) {
            var loadResult = await loadTutorClassList(tutor.id);
            console.log('[LOAD SUPABASE] loadTutorClassList:', loadResult);
            if (loadResult.error) {
                return { error: loadResult.error };
            }

            currentUser = authUserId;
            currentTutor = tutor;
            currentTutorAuthEmail = authUserEmail || null;
            isSupabaseTutorSession = true;
            isAdminManagingTutor = false;
            activeTutorId = tutor.id; // từ đây addNewClass/removeClass/saveEditClass sẽ ghi lên đúng Tutor này

            classList = loadResult.classList;
            freeSchedule = { "Thứ 2":[],"Thứ 3":[],"Thứ 4":[],"Thứ 5":[],"Thứ 6":[],"Thứ 7":[],"Chủ Nhật":[] };

            document.getElementById('login-view').style.display = 'none';
            document.getElementById('main-page-view').style.display = 'flex';
            var tutorDisplayName = tutor.display_name || authUserEmail;
            document.getElementById('nav-avatar-text').innerText = (tutorDisplayName || 'T').charAt(0).toUpperCase();
            document.getElementById('nav-username-display').innerText = tutorDisplayName;

            toggleDay(getDefaultDayView()); applyCompactModeFromSettings();
            updateTimeSelectOptions();
            renderClassList();
            restartReminderLoop();
            return { error: null };
        }

        async function doLogin() {
            // AUTH 2.0: Email là identifier chính (mục 3/4). Trước đây đọc nhầm id
            // 'login-username' — input thật trong HTML là 'login-email' — khiến doLogin() luôn
            // ném TypeError (getElementById trả về null) và Login KHÔNG BAO GIỜ chạy được.
            var u = document.getElementById('login-email').value.trim().toLowerCase();
            var p = document.getElementById('login-password').value;
            var err = document.getElementById('login-error');
            var hint = document.getElementById('login-attempts-hint');
            var lockBar = document.getElementById('login-lockout-bar');
            hint.style.display = 'none';
            lockBar.style.display = 'none';

            if (!u || !p) { err.innerText = '⚠️ Vui lòng nhập đầy đủ thông tin'; err.style.display = 'block'; return; }

            // AUTH 2.0 / mục 19: KHÔNG còn nhánh admin cục bộ với credential viết cứng trong frontend.
            // Tài khoản Admin thật đã tồn tại trong Supabase Auth (profiles.role = 'admin') và đăng
            // nhập qua đúng luồng bên dưới — không cần và không được phép có "cửa sau" cục bộ song song.
            var loginBtn = document.getElementById('login-btn');
            err.style.display = 'none';
            if (loginBtn) { loginBtn.disabled = true; loginBtn.innerText = 'Đang đăng nhập...'; }

            // ===== ĐĂNG NHẬP QUA SUPABASE AUTH (dùng chung cho Admin và Tutor) =====
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: u,
                password: p
            });

            if (error) {
                console.error('Supabase Login FAILED:', error.message);
                if (loginBtn) { loginBtn.disabled = false; loginBtn.innerText = 'Đăng nhập'; }
                // Mục 5: không tiết lộ email tồn tại hay không / lý do kỹ thuật cho user.
                var msg = (error.message || '').toLowerCase();
                if (msg.indexOf('email not confirmed') !== -1 || msg.indexOf('email_not_confirmed') !== -1) {
                    err.innerText = '⚠️ Vui lòng xác minh email trước khi đăng nhập.';
                } else {
                    err.innerText = '⚠️ Email hoặc mật khẩu không đúng.';
                }
                err.style.display = 'block';
                document.getElementById('login-password').value = '';
                return;
            }
            if (loginBtn) { loginBtn.disabled = false; loginBtn.innerText = 'Đăng nhập'; }

            const authUser = data.user;
            const authUserId = authUser.id;
            // Debug an toàn — KHÔNG log password / access_token / secret key
            console.log('AUTH USER ID:', authUserId);
            console.log('AUTH USER EMAIL:', authUser.email);

            // ----- BƯỚC KẾ TIẾP: xác định vai trò qua bảng profiles -----
            // maybeSingle() thay vì single(): nếu 0 dòng khớp sẽ trả null thay vì lỗi 406.
            const { data: profile, error: profileError } =
                await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', authUserId)
                    .maybeSingle();

            if (profileError) {
                console.error('Profile fetch FAILED:', profileError);
                await supabaseClient.auth.signOut();
                err.innerText = '⚠️ Không thể tải hồ sơ tài khoản. Vui lòng thử lại.'; err.style.display = 'block';
                return;
            }
            console.log('PROFILE:', profile);
            console.log('PROFILE ROLE:', profile ? profile.role : null);

            if (!profile) {
                await supabaseClient.auth.signOut();
                err.innerText = '⚠️ Tài khoản chưa có hồ sơ (profile) trong hệ thống.'; err.style.display = 'block';
                return;
            }

            // ===== NHÁNH ADMIN: role === 'admin' trong bảng profiles =====
            if (profile.role === 'admin') {
                err.style.display = 'none';
                enterAdminSessionUI(authUserId, profile);
                return;
            }

            // ===== NHÁNH TUTOR — tìm hồ sơ trong bảng tutors theo user_id =====
            const { data: tutor, error: tutorError } =
                await supabaseClient
                    .from('tutors')
                    .select('*')
                    .eq('user_id', authUserId)
                    .maybeSingle(); // maybeSingle: 0 dòng -> null, KHÔNG ném lỗi 406 như .single()

            if (tutorError) {
                console.error('Tutor lookup FAILED:', tutorError);
                await supabaseClient.auth.signOut();
                err.innerText = '⚠️ Không thể tải hồ sơ gia sư. Vui lòng thử lại.'; err.style.display = 'block';
                return;
            }
            if (!tutor) {
                await supabaseClient.auth.signOut();
                err.innerText = '⚠️ Tài khoản chưa được liên kết với hồ sơ gia sư.'; err.style.display = 'block';
                return;
            }
            console.log('TUTOR:', tutor);

            // Tải học sinh + lịch học của Tutor này từ Supabase, rồi dựng UI — dùng chung
            // enterTutorSessionUI() với luồng khôi phục phiên sau F5 (xem restoreSupabaseSessionIfAny()).
            var enterResult = await enterTutorSessionUI(authUserId, tutor, authUser.email);
            if (enterResult.error) {
                await supabaseClient.auth.signOut();
                err.innerText = '⚠️ Không thể tải danh sách học sinh. Vui lòng thử lại.'; err.style.display = 'block';
                return;
            }
        }

        // Email cuối cùng đã đăng ký thành công, dùng cho nút "Gửi lại email xác minh".
        var lastRegisteredEmail = null;
        var resendCooldownTimer = null;

        // AUTH 2.0 (mục 9/10): Đăng ký PUBLIC dùng supabaseClient.auth.signUp() làm nguồn xác thực
        // DUY NHẤT — không còn tạo tài khoản trong localStorage (gsm_users/sha256/salt).
        // KHÔNG gửi role trong metadata: DB đã có sẵn trigger public.handle_new_user() (SECURITY
        // DEFINER, chạy trên auth.users AFTER INSERT) tự tạo profiles.role = 'tutor' (hard-code,
        // KHÔNG đọc role từ client) và tự tạo tutors row tương ứng — REUSE đúng cơ chế server-side
        // đã có, không tạo trigger/Edge Function mới (mục 10/26). Admin KHÔNG BAO GIỜ được tạo qua
        // đường này.
        async function doRegister() {
            var displayName = document.getElementById('reg-displayname').value.trim();
            var email = document.getElementById('reg-email').value.trim().toLowerCase();
            var p = document.getElementById('reg-password').value;
            var c = document.getElementById('reg-confirm').value;
            var captchaAns = document.getElementById('captcha-ans').value.trim();
            var termsEl = document.getElementById('reg-terms');
            var err = document.getElementById('register-error');
            var registerBtn = document.getElementById('register-btn');
            err.style.display = 'none';

            if (!displayName) { err.innerText = '⚠️ Vui lòng nhập họ tên'; err.style.display = 'block'; return; }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.innerText = '⚠️ Email không hợp lệ'; err.style.display = 'block'; return; }

            var strength = getPwStrength(p);
            if (strength.score < 2) { err.innerText = '⚠️ Mật khẩu quá yếu. Cần ít nhất 8 ký tự, có chữ hoa và số.'; err.style.display = 'block'; return; }
            if (p !== c) { err.innerText = '⚠️ Mật khẩu xác nhận không khớp'; err.style.display = 'block'; return; }
            if (parseInt(captchaAns) !== captchaAnswer) { err.innerText = '⚠️ Kết quả CAPTCHA sai. Hãy thử lại.'; err.style.display = 'block'; genCaptcha(); return; }
            if (termsEl && !termsEl.checked) { err.innerText = '⚠️ Vui lòng đồng ý với Điều khoản sử dụng'; err.style.display = 'block'; return; }

            if (registerBtn) { registerBtn.disabled = true; registerBtn.innerText = 'Đang tạo tài khoản...'; }

            // emailRedirectTo: đưa user quay lại đúng deployment URL hiện tại
            // (https://giasumanager.edgeone.app/) sau khi bấm link xác minh, thay vì rơi về
            // Site URL mặc định trên Supabase Dashboard (đang là http://localhost:3000) —
            // cùng pattern đã dùng ở resetPasswordForEmail(). URL này PHẢI có trong Redirect
            // URLs allow-list trên Supabase Dashboard thì mới hoạt động.
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: p,
                options: {
                    data: { full_name: displayName },
                    // KHÔNG gửi "role" — role được server (trigger) quyết định, không tin client.
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });

            if (registerBtn) { registerBtn.disabled = false; registerBtn.innerText = 'Tạo tài khoản'; }

            if (error) {
                console.error('Supabase signUp FAILED:', error.message);
                var msg = (error.message || '').toLowerCase();
                if (msg.indexOf('already registered') !== -1 || msg.indexOf('already exists') !== -1 || msg.indexOf('user already') !== -1) {
                    err.innerText = '⚠️ Email này đã được sử dụng.';
                } else if (msg.indexOf('password') !== -1) {
                    err.innerText = '⚠️ Mật khẩu không hợp lệ. Vui lòng thử mật khẩu khác.';
                } else {
                    err.innerText = '⚠️ Không thể tạo tài khoản. Vui lòng thử lại.';
                }
                err.style.display = 'block';
                genCaptcha();
                return;
            }

            lastRegisteredEmail = email;

            // Supabase Dashboard đang bật "Confirm email": signUp() thành công sẽ KHÔNG trả về
            // session ngay (data.session === null) — user phải bấm link xác minh trong email trước
            // khi đăng nhập được. Nếu dự án tắt xác minh email, data.session sẽ có giá trị và user
            // coi như đã đăng nhập luôn — xử lý cả 2 trường hợp, không giả định cứng cái nào.
            document.getElementById('register-form-inner').style.display = 'none';
            document.getElementById('register-success-box').style.display = 'block';

            if (data.session) {
                // Email confirmation đang TẮT trên dự án này — signUp() đã tự đăng nhập luôn.
                document.getElementById('register-verify-box').style.display = 'none';
                document.getElementById('register-success-icon').innerText = '🎉';
                document.getElementById('register-success-title').innerText = 'Tài khoản đã được tạo';
                document.getElementById('register-success-msg').innerText = 'Chào mừng ' + displayName + '! Tài khoản của bạn đã sẵn sàng và đã đăng nhập.';
            } else {
                document.getElementById('register-verify-box').style.display = 'block';
                document.getElementById('register-verify-email').innerText = email;
                document.getElementById('register-success-icon').innerText = '🎉';
                document.getElementById('register-success-title').innerText = 'Tài khoản đã được tạo';
                document.getElementById('register-success-msg').innerText = 'Chỉ còn một bước nữa thôi, ' + displayName + '!';
            }
            document.getElementById('login-email').value = email;
        }

        // Mục 12 — Gửi lại email xác minh, có cooldown chống spam request.
        async function resendVerificationEmail() {
            if (!lastRegisteredEmail) return;
            var btn = document.getElementById('resend-verify-btn');
            var hint = document.getElementById('resend-verify-hint');
            if (btn && btn.disabled) return;

            if (btn) { btn.disabled = true; }
            // emailRedirectTo: PHẢI giống hệt signUp() ở doRegister() — nếu không, email resend
            // sẽ rơi về Site URL mặc định trên Dashboard thay vì đúng trang hiện tại, gây lệch
            // hành vi giữa email đầu tiên và email gửi lại (vi phạm yêu cầu "phải hoạt động giống
            // email đầu tiên").
            var { error } = await supabaseClient.auth.resend({
                type: 'signup',
                email: lastRegisteredEmail,
                options: { emailRedirectTo: window.location.origin + window.location.pathname }
            });

            if (error) {
                console.error('Resend verification FAILED:', error.message);
                if (hint) hint.innerText = '⚠️ Không gửi được, vui lòng thử lại sau.';
                if (btn) btn.disabled = false;
                return;
            }

            var seconds = 30;
            if (hint) hint.innerText = 'Đã gửi lại! Thử lại sau ' + seconds + 's';
            if (resendCooldownTimer) clearInterval(resendCooldownTimer);
            resendCooldownTimer = setInterval(function() {
                seconds--;
                if (seconds <= 0) {
                    clearInterval(resendCooldownTimer);
                    if (hint) hint.innerText = '';
                    if (btn) btn.disabled = false;
                } else if (hint) {
                    hint.innerText = 'Đã gửi lại! Thử lại sau ' + seconds + 's';
                }
            }, 1000);
        }

        // ===== MỤC 13: QUÊN MẬT KHẨU =====
        function openForgotPasswordModal() {
            document.getElementById('fp-email').value = document.getElementById('login-email').value.trim();
            document.getElementById('fp-error').style.display = 'none';
            document.getElementById('fp-form-body').style.display = 'flex';
            document.getElementById('fp-success-body').style.display = 'none';
            document.getElementById('fp-footer').style.display = 'flex';
            document.getElementById('forgot-password-modal').classList.add('open');
        }
        function closeForgotPasswordModal() {
            document.getElementById('forgot-password-modal').classList.remove('open');
        }
        async function sendPasswordResetEmail() {
            var email = document.getElementById('fp-email').value.trim().toLowerCase();
            var errEl = document.getElementById('fp-error');
            var btn = document.getElementById('fp-send-btn');
            errEl.style.display = 'none';
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errEl.innerText = '⚠️ Vui lòng nhập email hợp lệ.'; errEl.style.display = 'block'; return;
            }
            btn.disabled = true; btn.innerText = 'Đang gửi...';
            // redirectTo lấy từ deployment URL hiện tại (mục 13) — KHÔNG hard-code localhost, để
            // Supabase đưa user quay lại đúng trang này (kèm token) sau khi bấm link trong email.
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });
            btn.disabled = false; btn.innerText = 'Gửi liên kết';
            // Mục 5: KHÔNG tiết lộ email có tồn tại trong hệ thống hay không — luôn hiển thị cùng
            // một thông báo chung chung cho dù thành công hay email không tồn tại. Chỉ lỗi mạng/kỹ
            // thuật thật sự mới hiển thị khác.
            if (error) {
                console.error('resetPasswordForEmail FAILED:', error.message);
                var msg = (error.message || '').toLowerCase();
                if (msg.indexOf('network') !== -1 || msg.indexOf('fetch') !== -1) {
                    errEl.innerText = '⚠️ Lỗi kết nối mạng. Vui lòng thử lại.'; errEl.style.display = 'block';
                    return;
                }
                // Với các lỗi khác (vd rate limit), vẫn hiển thị thông báo chung để không rò rỉ thông tin.
            }
            document.getElementById('fp-form-body').style.display = 'none';
            document.getElementById('fp-success-body').style.display = 'block';
            document.getElementById('fp-footer').style.display = 'none';
        }

        // ===== MỤC 13/14: ĐẶT MẬT KHẨU MỚI (sau khi bấm link trong email reset) =====
        function checkRpStrength(p) {
            var s = getPwStrength(p);
            var fill = document.getElementById('rp-pw-fill');
            var label = document.getElementById('rp-pw-label');
            var pct = Math.min(100, s.score * 22);
            var colors = ['','#ef4444','#f59e0b','#f59e0b','#10b981','#00cca3'];
            var labels = ['','Rất yếu','Yếu','Trung bình','Mạnh','Rất mạnh'];
            fill.style.width = pct + '%';
            fill.style.background = colors[s.score] || '#ef4444';
            label.innerText = p.length > 0 ? labels[s.score] || 'Rất yếu' : '';
            label.style.color = colors[s.score] || '#ef4444';
        }
        async function submitNewPassword() {
            var newPw = document.getElementById('rp-new-pw').value;
            var confirmPw = document.getElementById('rp-confirm-pw').value;
            var errEl = document.getElementById('rp-error');
            var btn = document.getElementById('rp-save-btn');
            errEl.style.display = 'none';

            if (getPwStrength(newPw).score < 2) { errEl.innerText = '⚠️ Mật khẩu quá yếu.'; errEl.style.display = 'block'; return; }
            if (newPw !== confirmPw) { errEl.innerText = '⚠️ Mật khẩu xác nhận không khớp.'; errEl.style.display = 'block'; return; }

            btn.disabled = true; btn.innerText = 'Đang lưu...';
            // Không tự tạo/hash token — supabaseClient.auth đã xác thực phiên recovery từ link email,
            // updateUser() là cơ chế DUY NHẤT được dùng để đặt mật khẩu mới (mục 14).
            const { error } = await supabaseClient.auth.updateUser({ password: newPw });
            btn.disabled = false; btn.innerText = 'Lưu mật khẩu mới';

            if (error) {
                console.error('updateUser (recovery) FAILED:', error.message);
                errEl.innerText = '⚠️ Không đặt lại được mật khẩu. Vui lòng thử lại hoặc yêu cầu link mới.';
                errEl.style.display = 'block';
                return;
            }

            document.getElementById('reset-password-modal').classList.remove('open');
            // Buộc đăng nhập lại bằng mật khẩu mới thay vì âm thầm giữ phiên recovery — tránh
            // nhầm lẫn về trạng thái đăng nhập, đúng tinh thần "không tự động coi là đã xong" (mục 11).
            await supabaseClient.auth.signOut();
            document.getElementById('login-error').style.display = 'none';
            showToast('🔑', 'Đặt lại mật khẩu thành công', 'Vui lòng đăng nhập lại bằng mật khẩu mới.');
        }
        async function cancelPasswordRecovery() {
            document.getElementById('reset-password-modal').classList.remove('open');
            await supabaseClient.auth.signOut();
        }

        async function doLogout() {
            if (isSupabaseTutorSession || isSupabaseAdminSession) {
                try { await supabaseClient.auth.signOut(); } catch (e) { console.error('Supabase signOut error:', e); }
            } else if (currentUser && currentUser !== 'superadmin' && !currentUser.startsWith('__admin_viewing_')) {
                saveUserData(currentUser, { classList: classList, freeSchedule: freeSchedule });
            }
            if (reminderInterval) clearInterval(reminderInterval);
            currentUser = null;
            currentTutor = null;
            currentTutorAuthEmail = null;
            currentAdminProfile = null;
            isSupabaseTutorSession = false;
            isSupabaseAdminSession = false;
            isAdminManagingTutor = false;
            adminManagedTutorInfo = null;
            activeTutorId = null;
            var banner = document.getElementById('admin-managing-banner');
            if (banner) banner.style.display = 'none';
            ['main-page-view','profile-page-view','finance-dashboard-view','reports-page-view','admin-view','roadmap-view'].forEach(function(id) {
                document.getElementById(id).style.display = 'none';
            });
            document.getElementById('login-view').style.display = 'flex';
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            document.getElementById('login-error').style.display = 'none';
            document.getElementById('login-lockout-bar').style.display = 'none';
            document.getElementById('login-attempts-hint').style.display = 'none';
            switchAuthTab('login');
        }

        // ===== PASSWORD STRENGTH =====
        function getPwStrength(p) {
            var score = 0;
            var rules = {
                len: p.length >= 8,
                upper: /[A-Z]/.test(p),
                num: /[0-9]/.test(p),
                special: /[^A-Za-z0-9]/.test(p)
            };
            if (rules.len) score++;
            if (rules.upper) score++;
            if (rules.num) score++;
            if (rules.special) score++;
            if (p.length >= 12) score++;
            return { score, rules };
        }

        function checkPwStrength(p) {
            var s = getPwStrength(p);
            var fill = document.getElementById('pw-fill');
            var label = document.getElementById('pw-label');
            var pct = Math.min(100, s.score * 22);
            var colors = ['','#ef4444','#f59e0b','#f59e0b','#10b981','#00cca3'];
            var labels = ['','Rất yếu','Yếu','Trung bình','Mạnh','Rất mạnh'];
            fill.style.width = pct + '%';
            fill.style.background = colors[s.score] || '#ef4444';
            label.innerText = p.length > 0 ? labels[s.score] || 'Rất yếu' : '';
            label.style.color = colors[s.score] || '#ef4444';
            ['rule-len','rule-upper','rule-num','rule-special'].forEach(function(id, i) {
                var key = ['len','upper','num','special'][i];
                document.getElementById(id).classList.toggle('ok', s.rules[key]);
            });
        }

        function checkPwMatch() {
            var p = document.getElementById('reg-password').value;
            var c = document.getElementById('reg-confirm').value;
            var hint = document.getElementById('pw-match-hint');
            if (!c) { hint.innerText = ''; return; }
            if (p === c) { hint.innerText = '✅ Mật khẩu khớp'; hint.style.color = '#10b981'; }
            else { hint.innerText = '❌ Mật khẩu chưa khớp'; hint.style.color = '#ef4444'; }
        }

        // ===== CAPTCHA =====
        var captchaAnswer = 0;
        function genCaptcha() {
            var ops = ['+','-','×'];
            var op = ops[Math.floor(Math.random()*3)];
            var a = Math.floor(Math.random()*12)+1;
            var b = Math.floor(Math.random()*10)+1;
            if (op==='-' && b>a) { var tmp=a; a=b; b=tmp; }
            captchaAnswer = op==='+' ? a+b : op==='-' ? a-b : a*b;
            document.getElementById('captcha-q').innerText = a + ' ' + op + ' ' + b;
            document.getElementById('captcha-ans').value = '';
        }

        // ===== SOCIAL INFO MODAL =====
        function openSocialInfo(provider) {
            var isGoogle = provider === 'google';
            document.getElementById('social-modal-icon').innerText = isGoogle ? '🔵' : '📘';
            document.getElementById('social-modal-title').innerText = (isGoogle ? 'Google' : 'Facebook') + ' Sign-In';
            document.getElementById('social-modal-body').innerText =
                'Đăng nhập bằng ' + (isGoogle?'Google':'Facebook') + ' yêu cầu app được deploy lên một domain thật (ví dụ: giasu-manager.vercel.app). '
                + 'Tính năng này hiện chưa khả dụng trên file HTML cục bộ.';
            document.getElementById('social-modal-steps').innerHTML =
                '1. Đăng ký app trên ' + (isGoogle ? '<strong>Google Cloud Console</strong>' : '<strong>Facebook Developers</strong>') + '<br>'
                + '2. Deploy app lên Vercel / Netlify / GitHub Pages<br>'
                + '3. Thêm OAuth Client ID vào file cấu hình<br>'
                + '4. Người dùng đăng nhập 1 chạm, không cần mật khẩu<br><br>'
                + '<em>Trong thời gian chờ, bạn có thể dùng đăng ký thường (email/mật khẩu) qua Supabase Auth.</em>';
            document.getElementById('social-info-modal').classList.add('open');
        }
        function closeSocialInfo() {
            document.getElementById('social-info-modal').classList.remove('open');
        }

        function togglePwVis(inputId, btn) {
            var input = document.getElementById(inputId);
            if (input.type === 'password') { input.type = 'text'; btn.innerText = '🙈'; }
            else { input.type = 'password'; btn.innerText = '👁'; }
        }

        // ===== ADMIN =====
        function openAdminPanel() {
            document.getElementById('admin-view').style.display = 'block';
            renderAdminPanel();               // Fallback: danh sách từ localStorage (gsm_users) — giữ nguyên như trước
            loadAdminTutorsFromSupabase();     // Phase 5A: nếu Supabase load thành công sẽ thay thế danh sách phía trên
            refreshAdminDashboardStats();      // Mục 9-11: nạp số liệu tổng THẬT từ Supabase (tutors/students/lessons/payments)
        }

        // LƯU Ý QUAN TRỌNG (đã sửa lỗi mục "THỐNG KÊ TỔNG QUAN" hiển thị sai):
        // Hàm này CHỈ còn nhiệm vụ vẽ danh sách tài khoản CỤC BỘ (localStorage, kiểu tài khoản CŨ trước
        // khi có Supabase) làm fallback hiển thị khi Supabase chưa tải xong / lỗi. Hàm này TUYỆT ĐỐI
        // KHÔNG được ghi bất kỳ giá trị nào vào 7 ô KPI tổng (admin-total-users, admin-total-students,
        // admin-total-sessions, admin-total-hours, admin-total-revenue, admin-total-collected,
        // admin-total-remaining) — trước đây hàm này ghi đè các ô đó bằng số liệu tính từ localStorage
        // (chỉ có 1 tài khoản cục bộ) khiến dashboard hiển thị "1 tutor / 1 học sinh / 840.000đ" dù
        // Supabase thực tế có 3 tutor / 2 học sinh. Nguồn số liệu KPI DUY NHẤT bây giờ là
        // refreshAdminDashboardStats() (đọc thẳng public.tutors/students/lessons/payments).
        function renderAdminPanel() {
            var users = getUsers();
            var userList = Object.entries(users);
            var colors = ['linear-gradient(135deg,#00cca3,#00896e)', 'linear-gradient(135deg,#38bdf8,#0284c7)', 'linear-gradient(135deg,#a78bfa,#7c3aed)', 'linear-gradient(135deg,#f472b6,#db2777)', 'linear-gradient(135deg,#fb923c,#ea580c)'];

            var container = document.getElementById('admin-user-list');
            container.innerHTML = '';

            if (userList.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:40px;font-size:14px;">Chưa có tài khoản cục bộ nào (danh sách Tutor thật nằm trong Supabase, xem phía trên).</div>';
                return;
            }

            userList.forEach(function(entry, idx) {
                var username = entry[0], info = entry[1];
                var data = getUserData(username);
                var students = data.classList || [];

                var card = document.createElement('div');
                card.className = 'admin-user-card';
                var createdDate = info.createdAt ? new Date(info.createdAt).toLocaleDateString('vi-VN') : '—';
                card.innerHTML = '<div style="display:flex;align-items:center;gap:14px;flex:1;">'
                    + '<div class="admin-avatar" style="background:' + colors[idx % colors.length] + ';">' + (info.displayName || username).charAt(0).toUpperCase() + '</div>'
                    + '<div><div style="font-weight:700;font-size:14px;color:var(--text-main);">' + (info.displayName || username) + '</div>'
                    + '<div style="font-size:12px;color:var(--text-sub);">@' + username + ' · Đăng ký: ' + createdDate + '</div></div></div>'
                    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
                    + '<span class="admin-stat-pill">📚 ' + students.length + ' học sinh (cục bộ)</span>'
                    + '<button class="btn-view-user" onclick="adminViewUser(\'' + username + '\')">Xem chi tiết →</button>'
                    + '<button class="btn-delete-user" onclick="adminDeleteUser(\'' + username + '\')">🗑</button>'
                    + '</div>';
                container.appendChild(card);
            });
        }

        // ===== PHASE 5A: ADMIN ĐỌC DANH SÁCH TUTOR TỪ SUPABASE (READ-ONLY) =====
        // Không INSERT/UPDATE/DELETE gì cả — chỉ SELECT.
        // Nếu Supabase lỗi: giữ nguyên danh sách local đang hiển thị từ renderAdminPanel() (không đụng gì thêm).
        // Nếu Supabase thành công: thay nội dung #admin-user-list bằng danh sách Tutor thật từ Supabase,
        // và không cho localStorage ghi đè lại sau đó.
        async function loadAdminTutorsFromSupabase() {
            var container = document.getElementById('admin-user-list');

            // ----- KHÔNG CÒN "SKIP KHI THIẾU SESSION" -----
            // Trước đây hàm này BỎ QUA hoàn toàn việc gọi Supabase nếu không có JWT thật (tức là mỗi khi
            // đăng nhập bằng tài khoản admin cục bộ giả, cơ chế này đã được gỡ bỏ) — đây chính là nguyên
            // nhân gốc khiến Admin Dashboard chỉ hiển thị dữ liệu giả/cũ từ localStorage. SỬA: luôn thử
            // SELECT thật (đây là truy vấn chỉ-đọc, vô hại kể cả khi không có quyền). Nếu Supabase/RLS
            // thực sự từ chối, lỗi sẽ được bắt ở khối catch bên dưới và hiển thị rõ ràng cho Admin —
            // KHÔNG suy đoán trước và KHÔNG tự ý đổi RLS.
            const { data: sessionData } = await supabaseClient.auth.getSession();
            if (!sessionData || !sessionData.session) {
                console.warn('[ADMIN] Không có JWT Supabase Auth thật (session rỗng/hết hạn) — vẫn thử SELECT bằng anon/publishable key, sẽ báo lỗi rõ ràng nếu bị RLS chặn.');
            }

            const { data: tutors, error } = await supabaseClient
                .from('tutors')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Admin tutor fetch FAILED:', error);
                if (container) {
                    container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:40px;font-size:14px;">⚠️ Không tải được danh sách Tutor từ Supabase (' + (error.message || error.code || 'lỗi không rõ') + ').</div>';
                }
                return; // Giữ nguyên danh sách cũ/localStorage đang hiển thị
            }

            console.log('Admin tutor fetch SUCCESS:', tutors);
            console.log('ADMIN SUPABASE TUTOR COUNT:', tutors.length);

            if (!container) return;

            if (!tutors || tutors.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:40px;font-size:14px;">Chưa có Tutor nào trong Supabase.</div>';
                return;
            }

            // ----- LẤY EMAIL TỪ BẢNG profiles (tutors KHÔNG có cột email/name) -----
            // Không được đoán/query tutors.email hay tutors.name vì các cột này không tồn tại.
            // Join thủ công ở phía client theo user_id. Nếu RLS chặn việc đọc profiles của
            // người khác, bắt lỗi an toàn và chỉ hiện placeholder — KHÔNG làm hỏng cả danh sách.
            var emailByUserId = {};
            var userIds = tutors.map(function(t) { return t.user_id; }).filter(Boolean);
            if (userIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabaseClient
                    .from('profiles')
                    .select('id, email, full_name')
                    .in('id', userIds);
                if (profilesError) {
                    console.warn('Không lấy được email từ profiles (có thể bị RLS chặn):', profilesError.message || profilesError);
                } else {
                    (profilesData || []).forEach(function(p) { emailByUserId[p.id] = p; });
                }
            }

            var colors = ['linear-gradient(135deg,#00cca3,#00896e)', 'linear-gradient(135deg,#38bdf8,#0284c7)', 'linear-gradient(135deg,#a78bfa,#7c3aed)', 'linear-gradient(135deg,#f472b6,#db2777)', 'linear-gradient(135deg,#fb923c,#ea580c)'];

            // Đếm số học sinh thật của từng Tutor bằng SELECT COUNT (không hard-code)
            var counts = await Promise.all(tutors.map(async function(t) {
                var res = await supabaseClient
                    .from('students')
                    .select('id', { count: 'exact', head: true })
                    .eq('tutor_id', t.id);
                if (res.error) {
                    console.error('Admin student count FAILED for tutor ' + t.id + ':', res.error);
                    return 0;
                }
                return res.count || 0;
            }));

            // Mục SEARCH+FILTER: lưu lại danh sách đã tính sẵn (displayName/email/status/studentCount/
            // màu avatar) vào cache module-level, rồi vẽ qua renderFilteredAdminTutorList() — mọi lần
            // gõ search/đổi filter sau đó CHỈ lọc lại cache này, KHÔNG gọi lại Supabase.
            adminTutorsCache = tutors.map(function(t, idx) {
                var linkedProfile = emailByUserId[t.user_id];
                // display_name là cột thật trong bảng tutors — KHÔNG dùng t.name/t.email (không tồn tại)
                var displayName = t.display_name || (linkedProfile && linkedProfile.full_name) || '(Chưa có tên)';
                var email = (linkedProfile && linkedProfile.email) || '(Chưa có email)';
                return {
                    id: t.id,
                    displayName: displayName,
                    email: email,
                    status: t.status || '',
                    studentCount: counts[idx],
                    color: colors[idx % colors.length]
                };
            });

            renderFilteredAdminTutorList();
        }

        // Dựng HTML 1 thẻ Tutor — dùng chung cho danh sách đầy đủ lẫn danh sách đã lọc, tránh
        // duplicate markup giữa 2 nơi.
        function buildAdminTutorCardHtml(t) {
            var tutorIdJs = "'" + String(t.id).replace(/'/g, "\\'") + "'"; // an toàn cho UUID chuỗi trong onclick="..."
            return '<div class="admin-user-card">'
                + '<div style="display:flex;align-items:center;gap:14px;flex:1;">'
                + '<div class="admin-avatar" style="background:' + t.color + ';">' + escapeHtml(t.displayName).charAt(0).toUpperCase() + '</div>'
                + '<div><div style="font-weight:700;font-size:14px;color:var(--text-main);">' + escapeHtml(t.displayName) + '</div>'
                + '<div style="font-size:12px;color:var(--text-sub);">' + escapeHtml(t.email) + ' · ID: ' + t.id + ' · Trạng thái: ' + escapeHtml(String(t.status || '—')) + '</div></div></div>'
                + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
                + '<span class="admin-stat-pill">📚 ' + t.studentCount + ' học sinh</span>'
                + '<span class="admin-stat-pill" style="color:#f59e0b;">☁️ Supabase</span>'
                + '<button class="btn-view-user" onclick="openTutorWorkspaceAsAdmin(' + tutorIdJs + ')">Xem chi tiết →</button>'
                + '</div></div>';
        }

        // ===== SEARCH + FILTER: Danh sách Tutor (Admin) — lọc phía client trên adminTutorsCache =====
        function renderFilteredAdminTutorList() {
            var container = document.getElementById('admin-user-list');
            if (!container) return;

            if (adminTutorsCache.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:40px;font-size:14px;">Chưa có Tutor nào trong Supabase.</div>';
                return;
            }

            var q = (adminTutorSearchState.query || '').trim().toLowerCase();
            var statusFilter = adminTutorSearchState.status;

            var filtered = adminTutorsCache.filter(function(t) {
                if (q) {
                    var hay = (t.displayName + ' ' + t.email).toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                if (statusFilter === 'active' && String(t.status).toLowerCase() !== 'active') return false;
                if (statusFilter === 'inactive' && String(t.status).toLowerCase() === 'active') return false;
                return true;
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:40px;font-size:14px;">Không tìm thấy Tutor phù hợp.</div>';
                return;
            }

            container.innerHTML = filtered.map(buildAdminTutorCardHtml).join('');
        }

        function onAdminTutorSearchInput(value) {
            adminTutorSearchState.query = value;
            renderFilteredAdminTutorList();
        }

        function onAdminTutorFilterChange(key, value) {
            adminTutorSearchState[key] = value;
            renderFilteredAdminTutorList();
        }

        // ===== ADMIN DASHBOARD: SỐ LIỆU TỔNG — TÍNH TRỰC TIẾP TỪ SUPABASE, TOÀN BỘ HỆ THỐNG =====
        // (Sửa lỗi "THỐNG KÊ TỔNG QUAN" hiển thị 1 tutor/1 học sinh dù Supabase có 3 tutor/2 học sinh.)
        //
        // NGUYÊN NHÂN GỐC CỦA LỖI CŨ: hàm này (và loadAdminTutorsFromSupabase) trước đây có một điều
        // kiện "if (!session) return;" — mỗi khi Admin đăng nhập bằng tài khoản admin cục bộ giả (đã gỡ
        // bỏ, không đi qua supabaseClient.auth.signIn... nên KHÔNG có JWT thật) thì hàm này THOÁT SỚM
        // và không hề gọi Supabase. Khi đó UI vẫn giữ nguyên số liệu do renderAdminPanel()
        // vẽ trước đó — mà renderAdminPanel() lại tính "Tổng tutor/Tổng học sinh/Tổng tiền" từ
        // localStorage (gsm_users + classList cục bộ), tức là dữ liệu của DUY NHẤT 1 tài khoản cục bộ
        // đang có trên trình duyệt — hoàn toàn khác với 3 tutor/2 học sinh thật trong Supabase. Đó là lý
        // do dashboard hiện "1 / 1 / 840.000đ" — không phải vì lọc theo selectedTutor/selectedStudent.
        //
        // SỬA: hàm này giờ LUÔN LUÔN gọi thẳng Supabase (không còn "return" sớm khi thiếu session — đây
        // chỉ là SELECT, vô hại). renderAdminPanel() cũng đã được sửa để không còn ghi bất kỳ giá trị
        // nào vào các ô KPI nữa — 7 ô KPI + 2 bảng thống kê bên dưới CHỈ do hàm này ghi.
        //
        // Nguồn dữ liệu — KHÔNG hard-code, KHÔNG localStorage, KHÔNG cache cũ:
        //   - Tổng tutor        <- public.tutors (toàn bộ, không lọc theo status)
        //   - Tổng học sinh     <- public.students (toàn bộ, không lọc theo tutor_id)
        //   - Buổi/Giờ đã dạy   <- public.lessons WHERE status = 'completed' (đếm dòng / SUM(duration))
        //   - Tiền đã dạy       <- với mỗi lesson completed: students.rate (của đúng học sinh đó) × 1.000đ
        //                          (học phí là giá CỐ ĐỊNH THEO BUỔI, không nhân theo duration — quy ước
        //                          đã thống nhất sẵn ở refreshMonthMoneyDisplay/renderAlltimeTeachingStats,
        //                          KHÔNG đổi ở bước này)
        //   - Tiền đã thu       <- public.payments WHERE status IN ('paid','partial'), SUM(amount)
        //   - Còn phải thu      <- Đã dạy − Đã thu (không cho phép âm, có log cảnh báo nếu âm)
        //
        // Nếu một bảng tải lỗi: KHÔNG hiển thị 0 giả — hiển thị "⚠️ Lỗi" trên đúng ô KPI liên quan và
        // console.error chi tiết, để Admin biết ngay là dữ liệu chưa tải được chứ không phải hệ thống
        // trống rỗng.
        async function refreshAdminDashboardStats() {
            var adminView = document.getElementById('admin-view');
            if (!adminView || adminView.style.display === 'none') return; // Dashboard đang không mở, không cần gọi

            var elTutors = document.getElementById('admin-total-users');
            var elStudents = document.getElementById('admin-total-students');
            var elSessions = document.getElementById('admin-total-sessions');
            var elHours = document.getElementById('admin-total-hours');
            var elRevenue = document.getElementById('admin-total-revenue');
            var elCollected = document.getElementById('admin-total-collected');
            var elRemaining = document.getElementById('admin-total-remaining');
            var tutorBody = document.getElementById('admin-stats-by-tutor-body');
            var studentBody = document.getElementById('admin-stats-by-student-body');
            if (!elTutors) return;

            // ----- BƯỚC 0: TRẠNG THÁI ĐANG TẢI (mục 18: không render số liệu trước khi có đủ dữ liệu) -----
            [elTutors, elStudents, elSessions, elHours, elRevenue, elCollected, elRemaining].forEach(function(el) {
                if (el) { el.innerText = '…'; el.style.color = ''; el.title = ''; }
            });
            var loadingRow = '<tr><td colspan="7" style="text-align:center;color:var(--text-sub);">Đang tải...</td></tr>';
            if (tutorBody) tutorBody.innerHTML = loadingRow;
            if (studentBody) studentBody.innerHTML = loadingRow;

            const { data: sessionData } = await supabaseClient.auth.getSession();
            if (!sessionData || !sessionData.session) {
                console.warn('[ADMIN DASHBOARD] Không có JWT Supabase Auth thật (session rỗng/hết hạn) — vẫn thử tải dữ liệu thật bằng anon/publishable key thay vì bỏ qua.');
            }

            function showKpiError(el, msg) {
                if (!el) return;
                el.innerText = '⚠️ Lỗi';
                el.style.color = '#ef4444';
                el.title = msg || 'Không tải được dữ liệu';
            }

            // ----- BƯỚC 1: TẢI TOÀN BỘ TUTORS (không lọc theo status/user_id nào) -----
            const tutorsRes = await supabaseClient.from('tutors').select('id, display_name, status');
            console.log('[ADMIN DASHBOARD] tutors:', tutorsRes.data, tutorsRes.error);
            var tutorsOk = !tutorsRes.error;
            var tutors = tutorsOk ? (tutorsRes.data || []) : [];
            if (!tutorsOk) {
                console.error('[ADMIN DASHBOARD] Lỗi tải public.tutors:', tutorsRes.error);
                showKpiError(elTutors, 'Không tải được public.tutors: ' + (tutorsRes.error.message || tutorsRes.error.code || ''));
            } else {
                elTutors.innerText = tutors.length;
            }

            // ----- BƯỚC 2: TẢI TOÀN BỘ STUDENTS (không lọc theo tutor_id nào) -----
            // Mục SEARCH+FILTER: bổ sung subject/school/parent_name/parent_phone/status vào SELECT —
            // đây đều là cột CÓ SẴN trên public.students (không thêm cột mới), chỉ đọc thêm để phục vụ
            // tìm kiếm/lọc học sinh toàn hệ thống ở bảng "Thống kê theo Học sinh" bên dưới.
            const studentsRes = await supabaseClient.from('students').select('id, name, tutor_id, rate, subject, school, parent_name, parent_phone, status');
            console.log('[ADMIN DASHBOARD] students:', studentsRes.data, studentsRes.error);
            var studentsOk = !studentsRes.error;
            var students = studentsOk ? (studentsRes.data || []) : [];
            if (!studentsOk) {
                console.error('[ADMIN DASHBOARD] Lỗi tải public.students:', studentsRes.error);
                showKpiError(elStudents, 'Không tải được public.students: ' + (studentsRes.error.message || studentsRes.error.code || ''));
            } else {
                elStudents.innerText = students.length;
            }

            // ----- BƯỚC 3: TẢI TOÀN BỘ LESSON, TOÀN HỆ THỐNG (TẤT CẢ status + scheduled_date) -----
            // Mục REPORTS: trước đây chỉ tải status='completed' — nay tải TẤT CẢ status (thêm cột
            // scheduled_date, vốn đã có sẵn trên public.lessons) để Reports/Analytics dùng lại ĐÚNG
            // cache này cho việc lọc theo tháng + đếm completed/scheduled/cancelled/absent, KHÔNG gọi
            // Supabase thêm lần nào. completedLessons bên dưới lọc lại từ allLessons — hành vi các ô
            // KPI/bảng cũ của Admin Dashboard giữ NGUYÊN như trước.
            const lessonsRes = await supabaseClient.from('lessons').select('id, student_id, duration, status, scheduled_date');
            console.log('[ADMIN DASHBOARD] all lessons:', lessonsRes.data, lessonsRes.error);
            var lessonsOk = !lessonsRes.error;
            var allLessons = lessonsOk ? (lessonsRes.data || []) : [];
            var completedLessons = allLessons.filter(function(l) { return l.status === 'completed'; });
            if (!lessonsOk) {
                console.error('[ADMIN DASHBOARD] Lỗi tải public.lessons:', lessonsRes.error);
                showKpiError(elSessions, 'Không tải được public.lessons');
                showKpiError(elHours, 'Không tải được public.lessons');
            }

            // ----- BƯỚC 4: TẢI TOÀN BỘ PAYMENTS, TOÀN HỆ THỐNG (TẤT CẢ status + period) -----
            // Mục REPORTS: trước đây chỉ tải status paid/partial — nay tải TẤT CẢ status (thêm cột
            // period, vốn đã có sẵn trên public.payments) để Reports dùng lại cache này lọc theo tháng.
            // payments (paid/partial) bên dưới lọc lại từ allPayments — hành vi cũ giữ NGUYÊN.
            // STEP 11I-I (Phase 15 audit finding): trước STEP này query lấy TOÀN BỘ payments hệ
            // thống KHÔNG loại trừ Group Class payment (group_class_id IS NOT NULL) — Admin
            // Dashboard sẽ cộng nhầm tiền Group Class vào KPI "Đã thu" 1-1 toàn hệ thống. Thêm
            // .is('group_class_id', null) ngay tại query (không cần SELECT thêm cột group_class_id
            // vì đã lọc ở tầng DB) để giữ đúng PHASE 15 "Admin Dashboard" phải exclude Group Class.
            const paymentsRes = await supabaseClient.from('payments').select('id, student_id, amount, status, period').is('group_class_id', null);
            console.log('[ADMIN DASHBOARD] all payments:', paymentsRes.data, paymentsRes.error);
            var paymentsOk = !paymentsRes.error;
            var allPayments = paymentsOk ? (paymentsRes.data || []) : [];
            var payments = allPayments.filter(function(p) { return p.status === 'paid' || p.status === 'partial'; });
            if (!paymentsOk) {
                console.error('[ADMIN DASHBOARD] Lỗi tải public.payments:', paymentsRes.error);
                showKpiError(elCollected, 'Không tải được public.payments: ' + (paymentsRes.error.message || paymentsRes.error.code || ''));
            }

            var studentById = {};
            students.forEach(function(s) { studentById[s.id] = s; });

            // ----- TỔNG BUỔI / GIỜ ĐÃ DẠY: không phụ thuộc students, chỉ cần lessons -----
            var totalSessions = 0, totalHours = 0;
            if (lessonsOk) {
                completedLessons.forEach(function(l) { totalSessions += 1; totalHours += Number(l.duration) || 0; });
                elSessions.innerText = totalSessions;
                elHours.innerText = totalHours;
            }

            // ----- TỔNG TIỀN ĐÃ DẠY: cần cả lessons VÀ students (để lấy đúng rate từng học sinh) -----
            // Gộp completedLessons theo student rồi gọi computeBillingStats() cho từng học sinh
            // (Finance Core V1) — kết quả toán học giống hệt "mỗi lesson × rate × 1000" trước đây,
            // nhưng công thức chỉ còn nằm ở 1 nơi duy nhất.
            var totalTaught = null;
            if (lessonsOk && studentsOk) {
                totalTaught = 0;
                var lessonsByStudentForRevenue = {};
                completedLessons.forEach(function(l) {
                    if (!lessonsByStudentForRevenue[l.student_id]) lessonsByStudentForRevenue[l.student_id] = [];
                    lessonsByStudentForRevenue[l.student_id].push(l);
                });
                Object.keys(lessonsByStudentForRevenue).forEach(function(sid) {
                    var st = studentById[sid];
                    var rate = ((st && st.rate != null) ? Number(st.rate) : 0) * 1000; // quy đổi "nghìn đồng" -> VNĐ đầy đủ cho computeBillingStats()
                    totalTaught += computeBillingStats(lessonsByStudentForRevenue[sid], [], rate).expected;
                });
                elRevenue.innerText = totalTaught.toLocaleString('vi-VN') + ' đ';
            } else {
                showKpiError(elRevenue, 'Cần cả public.lessons và public.students để tính tiền đã dạy');
            }

            // ----- TỔNG TIỀN ĐÃ THU -----
            // STEP 8D: trước đây tự cộng tổng thủ công (payments đã lọc sẵn paid/partial ở trên nên
            // kết quả toán học giống hệt, nhưng công thức "chỉ cộng paid/partial" bị viết lại ở đây
            // thay vì dùng lại Billing Core) — nay delegate cho computeBillingStats() để chỉ còn 1
            // công thức duy nhất cho "Collected" trong toàn app, kết quả KHÔNG đổi.
            var totalCollected = null;
            if (paymentsOk) {
                totalCollected = computeBillingStats([], payments, 0).collected;
                elCollected.innerText = totalCollected.toLocaleString('vi-VN') + ' đ';
            }

            // ----- CÒN PHẢI THU: chỉ tính được khi cả "đã dạy" và "đã thu" đều tải thành công -----
            var totalOutstanding = null;
            if (totalTaught != null && totalCollected != null) {
                totalOutstanding = totalTaught - totalCollected;
                if (totalOutstanding < 0) {
                    console.warn('[ADMIN DASHBOARD] CẢNH BÁO: tổng tiền đã thu (' + totalCollected.toLocaleString('vi-VN')
                        + 'đ) VƯỢT tổng tiền đã dạy (' + totalTaught.toLocaleString('vi-VN')
                        + 'đ). Có thể dữ liệu payments bị nhập dư/sai. Hiển thị 0đ thay vì số âm.');
                    totalOutstanding = 0;
                }
                elRemaining.innerText = totalOutstanding.toLocaleString('vi-VN') + ' đ';
                elRemaining.style.color = totalOutstanding > 0 ? '#f472b6' : '#10b981';
            } else {
                showKpiError(elRemaining, 'Thiếu dữ liệu lessons/students/payments để tính còn phải thu');
            }

            console.log('[ADMIN DASHBOARD] total taught:', totalTaught);
            console.log('[ADMIN DASHBOARD] total received:', totalCollected);
            console.log('[ADMIN DASHBOARD] total outstanding:', totalOutstanding);
            console.log('[ADMIN DASHBOARD] FINAL KPI:', {
                tutors: tutorsOk ? tutors.length : 'ERROR',
                students: studentsOk ? students.length : 'ERROR',
                completedLessons: lessonsOk ? totalSessions : 'ERROR',
                totalHours: lessonsOk ? totalHours : 'ERROR',
                totalTaught: totalTaught,
                totalReceived: totalCollected,
                totalOutstanding: totalOutstanding
            });

            // ----- BẢNG THỐNG KÊ THEO TUTOR / THEO HỌC SINH (mục 13-14) -----
            renderAdminStatsBreakdownTables(tutorsOk, tutors, studentsOk, students, lessonsOk, completedLessons, paymentsOk, payments, studentById);

            // ----- REPORTS / ANALYTICS: lưu lại đúng dữ liệu thô vừa tải (KHÔNG gọi Supabase thêm) -----
            adminReportsRaw = {
                tutors: tutorsOk ? tutors : [],
                students: studentsOk ? students : [],
                lessons: lessonsOk ? allLessons : [],
                payments: paymentsOk ? allPayments : [],
                ok: tutorsOk && studentsOk && lessonsOk && paymentsOk
            };
            renderAdminReportsIfOpen();
        }

        // Vẽ 2 bảng "Thống kê theo Gia sư" và "Thống kê theo Học sinh" ở Admin Dashboard.
        // Toàn bộ số liệu lấy lại từ dữ liệu ĐÃ TẢI ở refreshAdminDashboardStats() (không gọi lại
        // Supabase thêm lần nào) — đảm bảo bảng và 7 ô KPI tổng luôn khớp nhau tuyệt đối.
        function renderAdminStatsBreakdownTables(tutorsOk, tutors, studentsOk, students, lessonsOk, completedLessons, paymentsOk, payments, studentById) {
            var tutorBody = document.getElementById('admin-stats-by-tutor-body');
            var studentBody = document.getElementById('admin-stats-by-student-body');
            if (!tutorBody || !studentBody) return;

            if (!tutorsOk || !studentsOk || !lessonsOk || !paymentsOk) {
                var errRow = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">⚠️ Không tải đủ dữ liệu (tutors/students/lessons/payments) để tính bảng này — xem Console để biết bảng nào lỗi.</td></tr>';
                tutorBody.innerHTML = errRow;
                studentBody.innerHTML = errRow;
                return;
            }

            var lessonsByStudent = {};
            completedLessons.forEach(function(l) {
                if (!lessonsByStudent[l.student_id]) lessonsByStudent[l.student_id] = [];
                lessonsByStudent[l.student_id].push(l);
            });
            var paymentsByStudent = {};
            payments.forEach(function(p) {
                if (!paymentsByStudent[p.student_id]) paymentsByStudent[p.student_id] = [];
                paymentsByStudent[p.student_id].push(p);
            });

            function statsForStudent(s) {
                var lessons = lessonsByStudent[s.id] || []; // đã được caller lọc sẵn chỉ còn completed
                var pays = paymentsByStudent[s.id] || [];
                var rate = (s.rate != null ? Number(s.rate) : 0) * 1000; // "nghìn đồng" -> VNĐ đầy đủ
                var billing = computeBillingStats(lessons, pays, rate); // Finance Core V1 — nguồn duy nhất
                return { sessions: billing.completedCount, hours: billing.hours, taught: billing.expected, collected: billing.collected, remaining: billing.remaining };
            }

            // ----- BẢNG THEO TUTOR -----
            if (tutors.length === 0) {
                tutorBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-sub);">Chưa có gia sư nào trong hệ thống.</td></tr>';
            } else {
                var tSum = { studentCount: 0, sessions: 0, hours: 0, taught: 0, collected: 0, remaining: 0 };
                var tutorHtml = tutors.map(function(t) {
                    var myStudents = students.filter(function(s) { return s.tutor_id === t.id; });
                    var agg = { sessions: 0, hours: 0, taught: 0, collected: 0 };
                    myStudents.forEach(function(s) {
                        var st = statsForStudent(s);
                        agg.sessions += st.sessions; agg.hours += st.hours; agg.taught += st.taught; agg.collected += st.collected;
                    });
                    var remaining = Math.max(0, agg.taught - agg.collected);
                    tSum.studentCount += myStudents.length; tSum.sessions += agg.sessions; tSum.hours += agg.hours;
                    tSum.taught += agg.taught; tSum.collected += agg.collected; tSum.remaining += remaining;
                    return rowHtml([
                        escapeHtml(t.display_name || '(Chưa có tên)'), myStudents.length, agg.sessions, agg.hours,
                        '<span style="color:#10b981;">' + money(agg.taught) + '</span>',
                        '<span style="color:#38bdf8;">' + money(agg.collected) + '</span>',
                        '<span style="color:' + remainingColor(remaining) + ';">' + money(remaining) + '</span>'
                    ]);
                }).join('');
                tutorHtml += '<tr style="font-weight:800;"><td>Tổng cộng</td><td>' + tSum.studentCount + '</td><td>' + tSum.sessions + '</td><td>' + tSum.hours
                    + '</td><td style="color:#10b981;">' + money(tSum.taught) + '</td><td style="color:#38bdf8;">' + money(tSum.collected)
                    + '</td><td style="color:' + remainingColor(tSum.remaining) + ';">' + money(tSum.remaining) + '</td></tr>';
                tutorBody.innerHTML = tutorHtml;
            }

            // ----- BẢNG THEO HỌC SINH -----
            var tutorNameById = {};
            tutors.forEach(function(t) { tutorNameById[t.id] = t.display_name || '(Chưa có tên)'; });

            // Mục SEARCH+FILTER: lưu danh sách Tutor để đổ vào dropdown lọc "Tutor" của bảng học sinh.
            adminStudentFilterTutors = tutors.map(function(t) { return { id: t.id, name: t.display_name || '(Chưa có tên)' }; });

            // Mục SEARCH+FILTER: tính sẵn TOÀN BỘ dòng học sinh (kể cả khi students.length === 0) rồi
            // lưu vào adminStudentStatsCache — renderFilteredAdminStudentTable() sẽ lọc lại cache này
            // phía client mỗi khi search/filter đổi, KHÔNG gọi lại Supabase.
            adminStudentStatsCache = students.map(function(s) {
                var st = statsForStudent(s);
                return {
                    id: s.id,
                    name: s.name || '(Chưa có tên)',
                    tutorId: s.tutor_id || '',
                    tutorName: tutorNameById[s.tutor_id] || '—',
                    subject: s.subject || '',
                    school: s.school || '',
                    parentName: s.parent_name || '',
                    parentPhone: s.parent_phone || '',
                    status: s.status || '',
                    sessions: st.sessions,
                    hours: st.hours,
                    taught: st.taught,
                    collected: st.collected,
                    remaining: st.remaining,
                    financeStatus: computePeriodStatus(st.collected, st.taught)
                };
            });

            renderFilteredAdminStudentTable();
        }

        // ===== SEARCH + FILTER: bảng "Thống kê theo Học sinh" (Admin, toàn hệ thống) =====
        // Lọc phía client trên adminStudentStatsCache — KHÔNG gọi lại Supabase, KHÔNG đụng vào mảng
        // students gốc. Dòng "Tổng cộng" tính lại trên đúng tập đang hiển thị (sau lọc) để khớp với
        // các dòng phía trên nó.
        function renderFilteredAdminStudentTable() {
            var studentBody = document.getElementById('admin-stats-by-student-body');
            if (!studentBody) return;

            renderAdminStudentFilterOptions();

            if (adminStudentStatsCache.length === 0) {
                studentBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-sub);">Chưa có học sinh nào trong hệ thống.</td></tr>';
                return;
            }

            var q = (adminStudentSearchState.query || '').trim().toLowerCase();
            var subjectFilter = adminStudentSearchState.subject;
            var tutorFilter = adminStudentSearchState.tutorId;
            var statusFilter = adminStudentSearchState.status;
            var financeFilter = adminStudentSearchState.finance;

            var filtered = adminStudentStatsCache.filter(function(r) {
                if (q) {
                    var hay = [r.name, r.subject, r.school, r.parentName, r.parentPhone].filter(Boolean).join(' ').toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
                if (tutorFilter !== 'all' && String(r.tutorId) !== String(tutorFilter)) return false;
                if (statusFilter !== 'all' && r.status !== statusFilter) return false;
                if (financeFilter !== 'all' && r.financeStatus !== financeFilter) return false;
                return true;
            });

            if (filtered.length === 0) {
                studentBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-sub);">Không tìm thấy dữ liệu phù hợp.</td></tr>';
                return;
            }

            var sSum = { sessions: 0, hours: 0, taught: 0, collected: 0, remaining: 0 };
            var studentHtml = filtered.map(function(r) {
                sSum.sessions += r.sessions; sSum.hours += r.hours; sSum.taught += r.taught; sSum.collected += r.collected; sSum.remaining += r.remaining;
                return rowHtml([
                    escapeHtml(r.name), escapeHtml(r.tutorName), r.sessions, r.hours,
                    '<span style="color:#10b981;">' + money(r.taught) + '</span>',
                    '<span style="color:#38bdf8;">' + money(r.collected) + '</span>',
                    '<span style="color:' + remainingColor(r.remaining) + ';">' + money(r.remaining) + '</span>'
                ]);
            }).join('');
            studentHtml += '<tr style="font-weight:800;"><td>Tổng cộng (' + filtered.length + ' học sinh)</td><td></td><td>' + sSum.sessions + '</td><td>' + sSum.hours
                + '</td><td style="color:#10b981;">' + money(sSum.taught) + '</td><td style="color:#38bdf8;">' + money(sSum.collected)
                + '</td><td style="color:' + remainingColor(sSum.remaining) + ';">' + money(sSum.remaining) + '</td></tr>';
            studentBody.innerHTML = studentHtml;
        }

        // Dựng lại option của các dropdown lọc bảng học sinh (Admin) TỪ ĐÚNG dữ liệu hiện có — không
        // hard-code danh sách môn/trạng thái/tutor.
        function renderAdminStudentFilterOptions() {
            var subjectSel = document.getElementById('admin-student-subject-filter');
            var tutorSel = document.getElementById('admin-student-tutor-filter');
            var statusSel = document.getElementById('admin-student-status-filter');
            if (!subjectSel || !tutorSel || !statusSel) return;

            var subjects = Array.from(new Set(adminStudentStatsCache.map(function(r) { return r.subject; }).filter(Boolean))).sort();
            var statuses = Array.from(new Set(adminStudentStatsCache.map(function(r) { return r.status; }).filter(Boolean))).sort();

            subjectSel.innerHTML = '<option value="all">Môn học: Tất cả</option>'
                + subjects.map(function(s) { return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; }).join('');
            tutorSel.innerHTML = '<option value="all">Tutor: Tất cả</option>'
                + adminStudentFilterTutors.map(function(t) { return '<option value="' + escapeHtml(String(t.id)) + '">' + escapeHtml(t.name) + '</option>'; }).join('');
            statusSel.innerHTML = '<option value="all">Trạng thái: Tất cả</option>'
                + statuses.map(function(s) { return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; }).join('');

            subjectSel.value = subjects.indexOf(adminStudentSearchState.subject) > -1 ? adminStudentSearchState.subject : 'all';
            statusSel.value = statuses.indexOf(adminStudentSearchState.status) > -1 ? adminStudentSearchState.status : 'all';
            var tutorStillExists = adminStudentFilterTutors.some(function(t) { return String(t.id) === String(adminStudentSearchState.tutorId); });
            tutorSel.value = tutorStillExists ? adminStudentSearchState.tutorId : 'all';
            if (subjectSel.value === 'all') adminStudentSearchState.subject = 'all';
            if (statusSel.value === 'all') adminStudentSearchState.status = 'all';
            if (tutorSel.value === 'all') adminStudentSearchState.tutorId = 'all';
        }

        function onAdminStudentSearchInput(value) {
            adminStudentSearchState.query = value;
            renderFilteredAdminStudentTable();
            renderReportsByStudentTable(); // mục 12: Reports phải cập nhật theo filter đang áp dụng
        }

        function onAdminStudentFilterChange(key, value) {
            adminStudentSearchState[key] = value;
            renderFilteredAdminStudentTable();
            renderReportsByStudentTable(); // mục 12: Reports phải cập nhật theo filter đang áp dụng
        }

        // ================================================================================
        // ===== REPORTS / ANALYTICS (Admin) =====
        // SOURCE OF TRUTH: đúng public.tutors / public.students / public.lessons / public.payments,
        // đọc lại từ adminReportsRaw (đã nạp 1 lần trong refreshAdminDashboardStats() ở trên) —
        // KHÔNG gọi Supabase riêng cho tab này, KHÔNG tạo công thức tính tiền thứ hai:
        //   buổi đã dạy = lessons.status === 'completed'
        //   phải thu    = số buổi completed × students.rate × 1000   (giống statsForStudent())
        //   đã thu      = SUM(payments.amount) với status IN ('paid','partial')
        //   còn phải thu = max(0, phải thu - đã thu)                 (giống computePeriodStatus())
        // ================================================================================

        function switchAdminMainTab(tab) {
            adminActiveMainTab = tab;
            var dash = document.getElementById('admin-tab-dashboard');
            var rep = document.getElementById('admin-tab-reports');
            if (dash) dash.style.display = (tab === 'dashboard') ? 'flex' : 'none';
            if (rep) rep.style.display = (tab === 'reports') ? 'flex' : 'none';
            var dashBtn = document.getElementById('admin-maintab-dashboard-btn');
            var repBtn = document.getElementById('admin-maintab-reports-btn');
            if (dashBtn) dashBtn.classList.toggle('active', tab === 'dashboard');
            if (repBtn) repBtn.classList.toggle('active', tab === 'reports');
            if (tab === 'reports') renderAdminReports(); // dùng lại cache đã có, KHÔNG gọi Supabase
        }

        // Gọi lại từ refreshAdminDashboardStats() mỗi khi lesson/payment/rate/tutor/student thay đổi —
        // chỉ thực sự vẽ lại nếu tab Reports đang mở (giống hệt cách refreshFinanceDashboardIfOpen() làm).
        function renderAdminReportsIfOpen() {
            var rep = document.getElementById('admin-tab-reports');
            if (!rep || rep.style.display === 'none') return;
            renderAdminReports();
        }

        function reportsPrevMonth() {
            reportsMonth--;
            if (reportsMonth < 0) { reportsMonth = 11; reportsYear--; }
            renderAdminReports();
        }
        function reportsNextMonth() {
            reportsMonth++;
            if (reportsMonth > 11) { reportsMonth = 0; reportsYear++; }
            renderAdminReports();
        }
        function reportsSetThisMonth() {
            var n = new Date(); reportsMonth = n.getMonth(); reportsYear = n.getFullYear();
            renderAdminReports();
        }
        function reportsSetLastMonth() {
            var n = new Date(); reportsMonth = n.getMonth() - 1; reportsYear = n.getFullYear();
            if (reportsMonth < 0) { reportsMonth = 11; reportsYear--; }
            renderAdminReports();
        }
        function onReportsMonthJump(v) { reportsMonth = parseInt(v); renderAdminReports(); }
        function onReportsYearJump(v) { reportsYear = parseInt(v) || new Date().getFullYear(); renderAdminReports(); }

        function tutorIdJsFor(id) { return "'" + String(id).replace(/'/g, "\\'") + "'"; } // an toàn cho UUID trong onclick="..."

        // Tổng nhanh CHỈ (taught/collected/sessions) của 1 tháng — dùng cho 2 biểu đồ 6-tháng (không cần breakdown theo tutor/học sinh, nhẹ hơn computeReportsForMonth()).
        // Finance Core V1 — KHÔNG tự tính billing (rate×1000×count) nữa: group lesson/payment theo
        // student rồi delegate cho computeBillingStats() (nguồn duy nhất), sau đó aggregate lại.
        // sessions vẫn đếm trực tiếp từ lesson data vì đây là lesson count, không phải billing calculation.
        function computeMonthTotals(monthKey) {
            var raw = adminReportsRaw;

            var lessonsByStudent = {};
            raw.lessons.forEach(function(l) {
                if (!l.scheduled_date || l.scheduled_date.slice(0, 7) !== monthKey) return;
                if (!lessonsByStudent[l.student_id]) lessonsByStudent[l.student_id] = [];
                lessonsByStudent[l.student_id].push(l);
            });

            var paymentsByStudent = {};
            raw.payments.forEach(function(p) {
                if (p.period !== monthKey) return;
                if (!paymentsByStudent[p.student_id]) paymentsByStudent[p.student_id] = [];
                paymentsByStudent[p.student_id].push(p);
            });

            var taught = 0, collected = 0, sessions = 0;
            raw.students.forEach(function(s) {
                var lessons = lessonsByStudent[s.id] || [];
                var pays = paymentsByStudent[s.id] || [];
                var rateVnd = (s.rate != null ? Number(s.rate) : 0) * 1000; // "nghìn đồng" -> VNĐ đầy đủ cho computeBillingStats()
                var billing = computeBillingStats(lessons, pays, rateVnd);
                taught += billing.expected;
                collected += billing.collected;
                sessions += billing.completedCount;
            });

            return { taught: taught, collected: collected, sessions: sessions };
        }

        // Tính TOÀN BỘ Reports (tổng quan + theo tutor + theo học sinh + lesson analytics) cho 1 tháng,
        // từ dữ liệu thô adminReportsRaw — tính 1 lần/lượt render, phía client, KHÔNG gọi Supabase.
        function computeReportsForMonth(monthKey) {
            var raw = adminReportsRaw;
            var lessonsByStudent = {};
            raw.lessons.forEach(function(l) {
                if (!l.scheduled_date || l.scheduled_date.slice(0, 7) !== monthKey) return;
                if (!lessonsByStudent[l.student_id]) lessonsByStudent[l.student_id] = [];
                lessonsByStudent[l.student_id].push(l);
            });
            var paymentsByStudent = {};
            raw.payments.forEach(function(p) {
                if (p.period !== monthKey) return;
                if (!paymentsByStudent[p.student_id]) paymentsByStudent[p.student_id] = [];
                paymentsByStudent[p.student_id].push(p);
            });
            var tutorNameById = {};
            raw.tutors.forEach(function(t) { tutorNameById[t.id] = t.display_name || '(Chưa có tên)'; });

            var lessonAnalytics = { completed: 0, scheduled: 0, cancelled: 0, absent: 0 };

            // ----- Theo Học sinh: TÁI SỬ DỤNG computeBillingStats() (Finance Core V1) -----
            var byStudent = raw.students.map(function(s) {
                var lessons = lessonsByStudent[s.id] || [];
                lessons.forEach(function(l) { if (lessonAnalytics.hasOwnProperty(l.status)) lessonAnalytics[l.status]++; });
                var rate = (s.rate != null ? Number(s.rate) : 0) * 1000; // "nghìn đồng" -> VNĐ đầy đủ
                var pays = paymentsByStudent[s.id] || [];
                var billing = computeBillingStats(lessons, pays, rate);
                var sessions = billing.completedCount, hours = billing.hours, taught = billing.expected, collected = billing.collected, remaining = billing.remaining;
                return {
                    id: s.id, name: s.name || '(Chưa có tên)', tutorId: s.tutor_id || '', tutorName: tutorNameById[s.tutor_id] || '—',
                    subject: s.subject || '', school: s.school || '', parentName: s.parent_name || '', parentPhone: s.parent_phone || '', status: s.status || '',
                    sessions: sessions, hours: hours, taught: taught, collected: collected, remaining: remaining,
                    hasLessonInMonth: lessons.length > 0, // mục 1: có ít nhất 1 lesson (mọi status) trong tháng -> "học sinh có buổi"
                    financeStatus: computePeriodStatus(collected, taught) // TÁI SỬ DỤNG computePeriodStatus() hiện có
                };
            });

            // ----- Theo Tutor: gộp lại từ byStudent, KHÔNG tính lại công thức khác -----
            var byTutor = raw.tutors.map(function(t) {
                var mine = byStudent.filter(function(r) { return String(r.tutorId) === String(t.id); });
                var agg = { studentCount: mine.length, sessions: 0, hours: 0, taught: 0, collected: 0, remaining: 0 };
                mine.forEach(function(r) { agg.sessions += r.sessions; agg.hours += r.hours; agg.taught += r.taught; agg.collected += r.collected; agg.remaining += r.remaining; });
                return { id: t.id, name: t.display_name || '(Chưa có tên)', studentCount: agg.studentCount, sessions: agg.sessions, hours: agg.hours, taught: agg.taught, collected: agg.collected, remaining: agg.remaining };
            });

            // ----- Tổng quan: TÁI SỬ DỤNG computeOverviewFromStudentRows() để đảm bảo Overview mặc định
            // (toàn bộ dữ liệu tháng) và Overview khi lọc (mục 5, tính lại trong renderReportsByStudentTable)
            // luôn dùng đúng 1 công thức duy nhất.
            var overview = computeOverviewFromStudentRows(byStudent);
            overview.tutors = raw.tutors.length; // mục 1: TỔNG TUTOR — luôn là tổng toàn hệ thống, không đổi theo filter
            overview.students = raw.students.length; // mục 1: TỔNG HỌC SINH — luôn là tổng toàn hệ thống, không đổi theo filter

            return { byTutor: byTutor, byStudent: byStudent, overview: overview, lessonAnalytics: lessonAnalytics };
        }

        // Tổng hợp Tutor hoạt động / Học sinh có buổi / buổi / giờ / phải thu / đã thu / còn phải thu
        // TỪ MỘT TẬP byStudent rows cho trước — dùng chung cho cả Overview mặc định (toàn bộ tháng)
        // và Overview khi Admin đang lọc (mục 5), luôn đúng 1 công thức duy nhất, không tính riêng.
        function computeOverviewFromStudentRows(rows) {
            var tutorSet = {};
            var activeStudents = 0;
            var sessions = 0, hours = 0, taught = 0, collected = 0, remaining = 0;
            rows.forEach(function(r) {
                sessions += r.sessions; hours += r.hours; taught += r.taught; collected += r.collected; remaining += r.remaining;
                if (r.hasLessonInMonth) {
                    activeStudents++;
                    if (r.tutorId) tutorSet[r.tutorId] = true;
                }
            });
            return { activeTutors: Object.keys(tutorSet).length, activeStudents: activeStudents, sessions: sessions, hours: hours, taught: taught, collected: collected, remaining: remaining };
        }

        // Ghi 7 số Tổng quan (trừ 2 ô TỔNG TUTOR/TỔNG HỌC SINH — luôn cố định, không đổi theo filter) ra DOM.
        function renderReportsOverviewMetrics(m) {
            var elAT = document.getElementById('rpt-ov-active-tutors'); if (elAT) elAT.innerText = m.activeTutors;
            var elAS = document.getElementById('rpt-ov-active-students'); if (elAS) elAS.innerText = m.activeStudents;
            document.getElementById('rpt-ov-sessions').innerText = m.sessions;
            document.getElementById('rpt-ov-hours').innerText = m.hours;
            document.getElementById('rpt-ov-taught').innerText = money(m.taught);
            document.getElementById('rpt-ov-collected').innerText = money(m.collected);
            document.getElementById('rpt-ov-remaining').innerText = money(m.remaining);
        }

        function renderAdminReports() {
            var container = document.getElementById('admin-tab-reports');
            if (!container) return;

            var viMonths = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
            var monthLabel = document.getElementById('rpt-month-label');
            if (monthLabel) monthLabel.innerText = viMonths[reportsMonth] + ' ' + reportsYear;
            var monthSel = document.getElementById('rpt-month-select');
            if (monthSel) monthSel.value = String(reportsMonth);

            // Dropdown năm: năm hiện tại + năm trước + năm đang chọn + các năm thực tế có lesson.
            var yearSel = document.getElementById('rpt-year-select');
            if (yearSel) {
                var years = new Set();
                var nowY = new Date().getFullYear();
                years.add(nowY); years.add(nowY - 1); years.add(reportsYear);
                adminReportsRaw.lessons.forEach(function(l) { if (l.scheduled_date) years.add(parseInt(l.scheduled_date.slice(0, 4))); });
                var sortedYears = Array.from(years).sort().reverse();
                yearSel.innerHTML = sortedYears.map(function(y) { return '<option value="' + y + '">Năm ' + y + '</option>'; }).join('');
                yearSel.value = String(reportsYear);
            }

            var now = new Date();
            var thisMonthBtn = document.getElementById('rpt-quick-thismonth');
            var lastMonthBtn = document.getElementById('rpt-quick-lastmonth');
            if (thisMonthBtn) thisMonthBtn.classList.toggle('active', reportsMonth === now.getMonth() && reportsYear === now.getFullYear());
            var lm = now.getMonth() - 1, ly = now.getFullYear(); if (lm < 0) { lm = 11; ly--; }
            if (lastMonthBtn) lastMonthBtn.classList.toggle('active', reportsMonth === lm && reportsYear === ly);

            if (!adminReportsRaw.ok) {
                var errRow7 = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">⚠️ Chưa tải đủ dữ liệu (tutors/students/lessons/payments) — mở lại tab Dashboard hoặc F5.</td></tr>';
                var errRow9 = '<tr><td colspan="9" style="text-align:center;color:#ef4444;">⚠️ Chưa tải đủ dữ liệu (tutors/students/lessons/payments) — mở lại tab Dashboard hoặc F5.</td></tr>';
                var tb = document.getElementById('rpt-by-tutor-body'); if (tb) tb.innerHTML = errRow7;
                var sb = document.getElementById('rpt-by-student-body'); if (sb) sb.innerHTML = errRow9;
                return;
            }

            var monthKey = getMonthKey(reportsYear, reportsMonth); // TÁI SỬ DỤNG getMonthKey() hiện có
            var result = computeReportsForMonth(monthKey);
            reportsComputedCache = result;

            // ----- 1. Tổng quan -----
            // TỔNG TUTOR / TỔNG HỌC SINH: luôn là tổng toàn hệ thống, KHÔNG đổi theo Search/Filter (mục 1).
            document.getElementById('rpt-ov-tutors').innerText = result.overview.tutors;
            document.getElementById('rpt-ov-students').innerText = result.overview.students;
            // Các số còn lại (Tutor hoạt động / Học sinh có buổi / buổi / giờ / tiền): mặc định = toàn bộ
            // tháng đang chọn; nếu Admin đang lọc, renderReportsByStudentTable() bên dưới sẽ ghi đè lại
            // theo đúng tập dữ liệu đang lọc (mục 5) — không tính lại công thức khác.
            renderReportsOverviewMetrics(result.overview);

            // ----- 2. Lesson analytics theo kỳ đang chọn -----
            document.getElementById('rpt-la-completed').innerText = result.lessonAnalytics.completed;
            document.getElementById('rpt-la-scheduled').innerText = result.lessonAnalytics.scheduled;
            document.getElementById('rpt-la-cancelled').innerText = result.lessonAnalytics.cancelled;
            document.getElementById('rpt-la-absent').innerText = result.lessonAnalytics.absent;
            var laTotal = result.lessonAnalytics.completed + result.lessonAnalytics.scheduled + result.lessonAnalytics.cancelled + result.lessonAnalytics.absent;
            var laEmptyBox = document.getElementById('rpt-la-empty');
            if (laEmptyBox) laEmptyBox.style.display = laTotal === 0 ? 'block' : 'none'; // mục 12: "Không có buổi học trong tháng này."

            // ----- 3. 2 biểu đồ (6 tháng gần nhất, kết thúc tại tháng đang chọn) -----
            renderReportsCharts();

            // ----- 4. Top học sinh còn nợ + Top Tutor theo doanh thu -----
            renderReportsTopLists(result);

            // ----- 5. Report theo Tutor -----
            renderReportsByTutorTable(result);

            // ----- 6. Report theo Học sinh (tái sử dụng adminStudentSearchState + adminStudentStatsCache pattern) -----
            renderReportsByStudentTable();
        }

        function renderReportsCharts() {
            var viMonths = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
            var months = [];
            var y = reportsYear, m = reportsMonth;
            for (var i = 5; i >= 0; i--) {
                var mm = m - i, yy = y;
                while (mm < 0) { mm += 12; yy--; }
                months.push({ year: yy, month: mm, key: getMonthKey(yy, mm) });
            }

            var revBox = document.getElementById('rpt-chart-revenue');
            var sesBox = document.getElementById('rpt-chart-sessions');
            if (!revBox || !sesBox) return;

            var totals = months.map(function(mo) { return computeMonthTotals(mo.key); });
            var maxRev = Math.max.apply(null, totals.map(function(t) { return Math.max(t.taught, t.collected); }).concat([0]));
            var maxSes = Math.max.apply(null, totals.map(function(t) { return t.sessions; }).concat([0]));

            revBox.innerHTML = months.map(function(mo, i) {
                var t = totals[i];
                var pctTaught = maxRev > 0 ? Math.max(t.taught > 0 ? 3 : 0, Math.round((t.taught / maxRev) * 100)) : 0;
                var pctCollected = maxRev > 0 ? Math.max(t.collected > 0 ? 3 : 0, Math.round((t.collected / maxRev) * 100)) : 0;
                return '<div class="year-bar-item">'
                    + '<div class="year-bar-label">' + viMonths[mo.month] + '</div>'
                    + '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">'
                    + '<div class="year-bar-track" style="height:20px;"><div class="year-bar-fill" style="width:' + pctTaught + '%;">' + (t.taught > 0 ? '<span>' + money(t.taught) + '</span>' : '') + '</div></div>'
                    + '<div class="year-bar-track" style="height:20px;"><div class="year-bar-fill" style="width:' + pctCollected + '%;background:linear-gradient(90deg,#38bdf8,#0284c7);">' + (t.collected > 0 ? '<span>' + money(t.collected) + '</span>' : '') + '</div></div>'
                    + '</div></div>';
            }).join('') + '<div style="display:flex;gap:16px;justify-content:flex-end;font-size:11px;color:var(--text-sub);margin-top:8px;"><span>🟢 Phải thu</span><span>🔵 Đã thu</span></div>';

            sesBox.innerHTML = months.map(function(mo, i) {
                var t = totals[i];
                var pct = maxSes > 0 ? Math.max(t.sessions > 0 ? 3 : 0, Math.round((t.sessions / maxSes) * 100)) : 0;
                return '<div class="year-bar-item">'
                    + '<div class="year-bar-label">' + viMonths[mo.month] + '</div>'
                    + '<div class="year-bar-track"><div class="year-bar-fill" style="width:' + pct + '%;">' + (t.sessions > 0 ? '<span>' + t.sessions + ' buổi</span>' : '') + '</div></div>'
                    + '<div class="year-bar-amount">' + (t.sessions > 0 ? t.sessions + ' buổi' : '—') + '</div>'
                    + '</div>';
            }).join('');
        }

        function renderReportsTopLists(result) {
            var debtorsBox = document.getElementById('rpt-top-debtors');
            var tutorsBox = document.getElementById('rpt-top-tutors');
            if (debtorsBox) {
                var debtors = result.byStudent.filter(function(r) { return r.remaining > 0; })
                    .sort(function(a, b) { return b.remaining - a.remaining; }).slice(0, 5);
                if (debtors.length === 0) {
                    debtorsBox.innerHTML = '<div style="text-align:center;color:var(--text-sub);font-size:13px;padding:14px;">Không có học sinh còn phải thu.</div>'; // mục 12
                } else {
                    debtorsBox.innerHTML = debtors.map(function(r, i) {
                        var clickAttr = r.tutorId ? ' onclick="openTutorWorkspaceAsAdmin(' + tutorIdJsFor(r.tutorId) + ')"' : '';
                        return '<div class="rpt-mini-row"' + clickAttr + '>'
                            + '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
                            + '<div class="rpt-mini-rank">' + (i + 1) + '</div>'
                            + '<div style="min-width:0;"><div class="rpt-mini-name">' + escapeHtml(r.name) + '</div><div class="rpt-mini-sub">' + escapeHtml(r.tutorName) + '</div></div>'
                            + '</div>'
                            + '<div class="rpt-mini-amount" style="color:#f472b6;">' + money(r.remaining) + '</div>'
                            + '</div>';
                    }).join('');
                }
            }
            if (tutorsBox) {
                var topT = result.byTutor.filter(function(t) { return t.taught > 0; })
                    .sort(function(a, b) { return b.taught - a.taught; }).slice(0, 5);
                if (topT.length === 0) {
                    tutorsBox.innerHTML = '<div style="text-align:center;color:var(--text-sub);font-size:13px;padding:14px;">' +
                        (result.overview.collected === 0 ? 'Chưa có khoản thu.' : 'Chưa có doanh thu trong kỳ này.') + '</div>'; // mục 12
                } else {
                    tutorsBox.innerHTML = topT.map(function(t, i) {
                        return '<div class="rpt-mini-row" onclick="openTutorWorkspaceAsAdmin(' + tutorIdJsFor(t.id) + ')">'
                            + '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
                            + '<div class="rpt-mini-rank">' + (i + 1) + '</div>'
                            + '<div style="min-width:0;"><div class="rpt-mini-name">' + escapeHtml(t.name) + '</div><div class="rpt-mini-sub">' + t.studentCount + ' học sinh · ' + t.sessions + ' buổi · ' + t.hours + 'h</div></div>'
                            + '</div>'
                            + '<div class="rpt-mini-amount" style="color:#10b981;">' + money(t.taught) + '</div>'
                            + '</div>';
                    }).join('');
                }
            }
        }

        // Click 1 dòng Tutor -> mở workspace Tutor đó (TÁI SỬ DỤNG openTutorWorkspaceAsAdmin() hiện có, không tạo TutorDetail riêng).
        function renderReportsByTutorTable(result) {
            var tbody = document.getElementById('rpt-by-tutor-body');
            if (!tbody) return;
            if (result.byTutor.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-sub);">Chưa có gia sư nào trong hệ thống.</td></tr>';
                return;
            }
            var tSum = { studentCount: 0, sessions: 0, hours: 0, taught: 0, collected: 0, remaining: 0 };
            var html = result.byTutor.map(function(t) {
                tSum.studentCount += t.studentCount; tSum.sessions += t.sessions; tSum.hours += t.hours;
                tSum.taught += t.taught; tSum.collected += t.collected; tSum.remaining += t.remaining;
                return '<tr style="cursor:pointer;" onclick="openTutorWorkspaceAsAdmin(' + tutorIdJsFor(t.id) + ')">'
                    + '<td><strong>' + escapeHtml(t.name) + '</strong></td>'
                    + '<td style="text-align:center;">' + t.studentCount + '</td>'
                    + '<td style="text-align:center;">' + t.sessions + '</td>'
                    + '<td style="text-align:center;">' + t.hours + '</td>'
                    + '<td style="color:#10b981;">' + money(t.taught) + '</td>'
                    + '<td style="color:#38bdf8;">' + money(t.collected) + '</td>'
                    + '<td style="color:' + remainingColor(t.remaining) + ';">' + money(t.remaining) + '</td>'
                    + '</tr>';
            }).join('');
            html += '<tr style="font-weight:800;"><td>Tổng cộng</td><td style="text-align:center;">' + tSum.studentCount + '</td>'
                + '<td style="text-align:center;">' + tSum.sessions + '</td><td style="text-align:center;">' + tSum.hours + '</td>'
                + '<td style="color:#10b981;">' + money(tSum.taught) + '</td><td style="color:#38bdf8;">' + money(tSum.collected) + '</td>'
                + '<td style="color:' + remainingColor(tSum.remaining) + ';">' + money(tSum.remaining) + '</td></tr>';
            tbody.innerHTML = html;
        }

        // Bảng theo Học sinh của Reports — TÁI SỬ DỤNG đúng adminStudentSearchState (mục 12: Search+Filter
        // của bảng "Thống kê theo Học sinh" ở tab Dashboard áp dụng luôn vào Reports), KHÔNG tạo state lọc mới.
        function renderReportsByStudentTable() {
            var tbody = document.getElementById('rpt-by-student-body');
            if (!tbody || !reportsComputedCache) return;
            var rows = reportsComputedCache.byStudent;

            var noteBox = document.getElementById('rpt-student-filter-note');
            var hasFilter = !!(adminStudentSearchState.query || adminStudentSearchState.subject !== 'all'
                || adminStudentSearchState.tutorId !== 'all' || adminStudentSearchState.status !== 'all' || adminStudentSearchState.finance !== 'all');
            if (noteBox) {
                noteBox.style.display = hasFilter ? 'block' : 'none';
                noteBox.innerText = '🔍 Đang áp dụng bộ lọc từ bảng "Thống kê theo Học sinh" (tab Dashboard) — Tổng quan phía trên đã cập nhật theo tập dữ liệu đang lọc.';
            }

            var q = (adminStudentSearchState.query || '').trim().toLowerCase();
            var filtered = rows.filter(function(r) {
                if (q) {
                    var hay = [r.name, r.subject, r.school, r.parentName, r.parentPhone].filter(Boolean).join(' ').toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                if (adminStudentSearchState.subject !== 'all' && r.subject !== adminStudentSearchState.subject) return false;
                if (adminStudentSearchState.tutorId !== 'all' && String(r.tutorId) !== String(adminStudentSearchState.tutorId)) return false;
                if (adminStudentSearchState.status !== 'all' && r.status !== adminStudentSearchState.status) return false;
                if (adminStudentSearchState.finance !== 'all' && r.financeStatus !== adminStudentSearchState.finance) return false;
                return true;
            });

            // mục 5: khi Admin đang lọc (Search/Tutor/Môn/Trạng thái/Tài chính), Tổng quan phía trên phải
            // cập nhật lại (Tutor hoạt động / Học sinh có buổi / buổi / giờ / phải thu / đã thu / còn phải thu)
            // theo ĐÚNG tập dữ liệu đang lọc — TÁI SỬ DỤNG computeOverviewFromStudentRows(), không tính công thức khác.
            // KHÔNG lọc lại raw data, KHÔNG đổi TỔNG TUTOR/TỔNG HỌC SINH (luôn là tổng toàn hệ thống).
            renderReportsOverviewMetrics(computeOverviewFromStudentRows(filtered));

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-sub);">Không có dữ liệu học sinh phù hợp trong kỳ này.</td></tr>';
                return;
            }

            var statusBadgeClass = { paid: 'badge-paid', partial: 'badge-partial', pending: 'badge-unpaid' };
            var statusBadgeLabel = { paid: '✓ Đã thu', partial: '◐ Một phần', pending: '✗ Chưa thu' };
            var sSum = { sessions: 0, hours: 0, taught: 0, collected: 0, remaining: 0 };
            var html = filtered.map(function(r) {
                sSum.sessions += r.sessions; sSum.hours += r.hours; sSum.taught += r.taught; sSum.collected += r.collected; sSum.remaining += r.remaining;
                return '<tr>'
                    + '<td><strong>' + escapeHtml(r.name) + '</strong></td>'
                    + '<td>' + escapeHtml(r.tutorName) + '</td>'
                    + '<td>' + escapeHtml(r.subject || '—') + '</td>'
                    + '<td style="text-align:center;">' + r.sessions + '</td>'
                    + '<td style="text-align:center;">' + r.hours + '</td>'
                    + '<td style="color:#10b981;">' + money(r.taught) + '</td>'
                    + '<td style="color:#38bdf8;">' + money(r.collected) + '</td>'
                    + '<td style="color:' + remainingColor(r.remaining) + ';">' + money(r.remaining) + '</td>'
                    + '<td><span class="' + (statusBadgeClass[r.financeStatus] || 'badge-unpaid') + '">' + (statusBadgeLabel[r.financeStatus] || '✗ Chưa thu') + '</span></td>'
                    + '</tr>';
            }).join('');
            html += '<tr style="font-weight:800;"><td>Tổng cộng (' + filtered.length + ' học sinh)</td><td></td><td></td>'
                + '<td style="text-align:center;">' + sSum.sessions + '</td><td style="text-align:center;">' + sSum.hours + '</td>'
                + '<td style="color:#10b981;">' + money(sSum.taught) + '</td><td style="color:#38bdf8;">' + money(sSum.collected) + '</td>'
                + '<td style="color:' + remainingColor(sSum.remaining) + ';">' + money(sSum.remaining) + '</td><td></td></tr>';
            tbody.innerHTML = html;
        }

        // ===== PHASE 5B: ADMIN XEM CHI TIẾT TUTOR TỪ SUPABASE (READ-ONLY) =====
        // Chỉ SELECT — không INSERT/UPDATE/DELETE tutors/students/student_schedules.
        // escapeHtml(), money(), remainingColor(), rowHtml(): đã chuyển sang
        // js/core/utils.js (STEP 7B), expose qua window.

        // ================================================================================
        // ===== PROGRESS & ANALYTICS 2.0 (Reports của Tutor — "📊 Báo cáo" / openTutorReports()) =====
        // Toàn bộ derive từ classList/lessonsCacheByStudent/paymentsCacheByStudent đã nạp sẵn trong
        // openFinanceDashboard() — KHÔNG gọi Supabase riêng cho từng card, tái sử dụng getMonthKey(),
        // getPeriodTotalPaid(), computePeriodStatus(), money(), openProfilePage(),
        // switchStudentProfileTab() đã có. KHÔNG tạo bảng/database analytics mới.
        // ================================================================================
        var rptTutorPeriodMode = 'month'; // 'month' | '7d' | '30d' | '3m' | 'custom'
        var rptTutorCustomStart = null, rptTutorCustomEnd = null; // 'YYYY-MM-DD'
        var rptTutorRevChartMonths = 6; // 6 | 12
        var rptTutorLessonChartMode = 'completed'; // 'completed' | 'all'

        function spViDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

        // Khoảng ngày [start,end] (ISO) của kỳ đang chọn + danh sách các tháng "YYYY-MM" mà kỳ đó
        // chạm tới (dùng để cộng payments — payments chỉ lưu theo payments.period = tháng, KHÔNG có
        // ngày chi tiết, nên "Đã thu" cho các kỳ không tròn tháng là số gần đúng theo (các) tháng liên
        // quan — ĐÃ ghi rõ trong UI, không bịa business rule mới).
        function spTutorAnalyticsRange() {
            var now = new Date();
            var start, end, label;
            if (rptTutorPeriodMode === '7d') {
                end = new Date(now); start = new Date(now); start.setDate(start.getDate() - 6);
                label = '7 ngày gần đây';
            } else if (rptTutorPeriodMode === '30d') {
                end = new Date(now); start = new Date(now); start.setDate(start.getDate() - 29);
                label = '30 ngày gần đây';
            } else if (rptTutorPeriodMode === '3m') {
                end = new Date(now); start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                label = '3 tháng gần đây';
            } else if (rptTutorPeriodMode === 'custom') {
                start = rptTutorCustomStart ? new Date(rptTutorCustomStart + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
                end = rptTutorCustomEnd ? new Date(rptTutorCustomEnd + 'T00:00:00') : now;
                label = 'Tuỳ chỉnh';
            } else {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                label = 'Tháng này';
            }
            if (end < start) { var tmp = start; start = end; end = tmp; }
            var startIso = getLocalIsoDate(start), endIso = getLocalIsoDate(end);
            var months = {};
            var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
            var endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
            while (cursor <= endCursor) { months[getMonthKey(cursor.getFullYear(), cursor.getMonth())] = true; cursor.setMonth(cursor.getMonth() + 1); }
            return { start: startIso, end: endIso, label: label, months: Object.keys(months) };
        }

        // Kỳ TRƯỚC liền kề, cùng độ dài ngày với kỳ đang chọn — dùng cho "So với kỳ trước" (mục 14, 15).
        function spTutorPrevRange(range) {
            var start = new Date(range.start + 'T00:00:00');
            var end = new Date(range.end + 'T00:00:00');
            var lengthDays = Math.round((end - start) / 86400000) + 1;
            var prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
            var prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (lengthDays - 1));
            var months = {};
            var cursor = new Date(prevStart.getFullYear(), prevStart.getMonth(), 1);
            var endCursor = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
            while (cursor <= endCursor) { months[getMonthKey(cursor.getFullYear(), cursor.getMonth())] = true; cursor.setMonth(cursor.getMonth() + 1); }
            return { start: getLocalIsoDate(prevStart), end: getLocalIsoDate(prevEnd), months: Object.keys(months) };
        }

        // Tính TOÀN BỘ analytics (theo học sinh + tổng hợp) cho MỘT khoảng ngày, từ dữ liệu đã có sẵn
        // trong bộ nhớ — tính 1 lần/lượt render, KHÔNG gọi Supabase (mục 19).
        function computeTutorAnalyticsForRange(range) {
            var todayIso = getLocalIsoDate(new Date());
            var rows = classList.map(function(st) {
                var lessons = st._supabaseSource ? (lessonsCacheByStudent[st.id] || []) : [];
                var inRange = lessons.filter(function(l) { return l.scheduled_date && l.scheduled_date >= range.start && l.scheduled_date <= range.end; });
                var completed = inRange.filter(function(l) { return l.status === 'completed'; });
                var scheduled = inRange.filter(function(l) { return l.status === 'scheduled'; });
                var cancelled = inRange.filter(function(l) { return l.status === 'cancelled'; });
                var hours = completed.reduce(function(sum, l) { return sum + (Number(l.duration) || 0); }, 0);
                var rate = (Number(st.rate) || 0) * 1000; // "nghìn đồng" -> VNĐ đầy đủ cho computeBillingStats()
                var periodPayments = [];
                if (st._supabaseSource) range.months.forEach(function(mk) { periodPayments = periodPayments.concat(getPeriodPayments(st.id, mk)); });
                var billing = computeBillingStats(inRange, periodPayments, rate); // Finance Core V1 — nguồn duy nhất
                var taught = billing.expected, collected = billing.collected, remaining = billing.remaining;
                var lastCompletedDate = null;
                lessons.forEach(function(l) { if (l.status === 'completed' && l.scheduled_date && (!lastCompletedDate || l.scheduled_date > lastCompletedDate)) lastCompletedDate = l.scheduled_date; });
                var daysSinceLast = lastCompletedDate ? Math.round((new Date(todayIso + 'T00:00:00') - new Date(lastCompletedDate + 'T00:00:00')) / 86400000) : null;
                var recentCancelled = lessons.filter(function(l) { return l.status === 'cancelled' && l.scheduled_date && l.scheduled_date >= range.start; }).length;
                var hasNearActivity = lessons.some(function(l) {
                    if (!l.scheduled_date || (l.status !== 'scheduled' && l.status !== 'completed')) return false;
                    var diffDays = Math.abs((new Date(l.scheduled_date + 'T00:00:00') - new Date(todayIso + 'T00:00:00')) / 86400000);
                    return diffDays <= 14;
                });
                return {
                    id: st.id, name: st.name || '(Chưa có tên)', subject: st.subject || '',
                    sessions: completed.length, scheduled: scheduled.length, cancelled: cancelled.length, hours: hours,
                    taught: taught, collected: collected, remaining: remaining,
                    hasLessonInRange: inRange.length > 0, daysSinceLast: daysSinceLast, recentCancelled: recentCancelled, isActive: hasNearActivity
                };
            });
            var lessonAnalytics = { completed: 0, scheduled: 0, cancelled: 0 };
            rows.forEach(function(r) {
                lessonAnalytics.completed += r.sessions; lessonAnalytics.scheduled += r.scheduled; lessonAnalytics.cancelled += r.cancelled;
            });
            var overview = {
                students: rows.filter(function(r) { return r.hasLessonInRange; }).length,
                totalStudents: classList.length,
                sessions: lessonAnalytics.completed,
                hours: rows.reduce(function(s, r) { return s + r.hours; }, 0),
                taught: rows.reduce(function(s, r) { return s + r.taught; }, 0),
                collected: rows.reduce(function(s, r) { return s + r.collected; }, 0),
                remaining: rows.reduce(function(s, r) { return s + r.remaining; }, 0)
            };
            return { rows: rows, lessonAnalytics: lessonAnalytics, overview: overview };
        }

        // Tổng nhanh (taught/collected/completedSessions/allSessions) của 1 tháng CHO TẤT CẢ học sinh
        // của Tutor — dùng riêng cho 2 biểu đồ theo tháng (mục 8, 9), KHÔNG phụ thuộc period filter ở
        // trên (biểu đồ có control 6/12 tháng riêng — mục 17: "trừ những metric được ghi rõ là all-time/khác period").
        function spTutorMonthTotals(monthKey) {
            var taught = 0, collected = 0, completedSessions = 0, allSessions = 0;
            classList.forEach(function(st) {
                if (!st._supabaseSource) return;
                var monthLessons = (lessonsCacheByStudent[st.id] || []).filter(function(l) { return l.scheduled_date && l.scheduled_date.slice(0, 7) === monthKey; });
                allSessions += monthLessons.length;
                var billing = computeBillingStats(monthLessons, getPeriodPayments(st.id, monthKey), (Number(st.rate) || 0) * 1000); // Finance Core V1
                completedSessions += billing.completedCount;
                taught += billing.expected;
                collected += billing.collected;
            });
            return { taught: taught, collected: collected, completedSessions: completedSessions, allSessions: allSessions };
        }

        // Rule-based Risk Score (mục 13) — KHÔNG phải AI, chỉ cộng dồn các dấu hiệu quản lý thật (lâu
        // không học / học phí quá hạn / nhiều buổi huỷ), KHÔNG kết luận tâm lý/học lực.
        function spComputeStudentRisk(row) {
            var reasons = [];
            var level = 'healthy';
            var order = { healthy: 0, attention: 1, risk: 2 };
            function upgrade(lv) { if (order[lv] > order[level]) level = lv; }
            if (row.daysSinceLast !== null && row.daysSinceLast >= 21) { upgrade('risk'); reasons.push(row.daysSinceLast + ' ngày chưa có buổi học'); }
            else if (row.daysSinceLast !== null && row.daysSinceLast >= 7) { upgrade('attention'); reasons.push(row.daysSinceLast + ' ngày chưa có buổi học'); }
            if (row.taught > 0 && row.remaining >= row.taught) { upgrade('risk'); reasons.push('học phí quá hạn'); }
            else if (row.remaining > 0) { upgrade('attention'); reasons.push('còn ' + money(row.remaining) + ' chưa thu'); }
            if (row.recentCancelled >= 2) { upgrade('risk'); reasons.push(row.recentCancelled + ' buổi bị huỷ gần đây'); }
            return { level: level, reasons: reasons };
        }

        // Số buổi 'scheduled' trong 7 ngày TỚI (real-time, không phụ thuộc period filter — mục 12.4).
        function spTutorUpcomingWorkload() {
            var now = getLocalIsoDate(new Date());
            var endD = new Date(); endD.setDate(endD.getDate() + 7);
            var endIso = getLocalIsoDate(endD);
            var count = 0;
            classList.forEach(function(st) {
                if (!st._supabaseSource) return;
                (lessonsCacheByStudent[st.id] || []).forEach(function(l) {
                    if (l.status === 'scheduled' && l.scheduled_date && l.scheduled_date >= now && l.scheduled_date <= endIso) count++;
                });
            });
            return count;
        }

        // Mở đúng Student Profile 2.0 đã có (KHÔNG tạo profile thứ hai), đóng Finance Dashboard trước,
        // rồi chuyển tab tương ứng (tuition/overview) — dùng cho các insight có nút hành động.
        async function spAnalyticsOpenStudentTab(id, tab) {
            var repView = document.getElementById('reports-page-view');
            if (repView) repView.style.display = 'none';
            document.getElementById('finance-dashboard-view').style.display = 'none';
            await openProfilePage(id);
            switchStudentProfileTab(tab || 'overview');
        }

        function spSetTutorAnalyticsPeriod(mode) {
            rptTutorPeriodMode = mode;
            document.querySelectorAll('#rpt-tutor-period-row .sp-filter-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-rpt-period') === mode);
            });
            var customBox = document.getElementById('rpt-tutor-custom-range');
            if (customBox) customBox.style.display = mode === 'custom' ? 'flex' : 'none';
            renderTutorAnalytics();
        }

        function spTutorCustomRangeChange() {
            var s = document.getElementById('rpt-tutor-custom-start').value;
            var e = document.getElementById('rpt-tutor-custom-end').value;
            rptTutorCustomStart = s || null;
            rptTutorCustomEnd = e || null;
            if (rptTutorPeriodMode === 'custom') renderTutorAnalytics();
        }

        function spSetTutorRevChartMonths(n) {
            rptTutorRevChartMonths = n;
            document.querySelectorAll('#rpt-tutor-revchart-toggle .sp-filter-btn').forEach(function(b) {
                b.classList.toggle('active', parseInt(b.getAttribute('data-months'), 10) === n);
            });
            renderTutorAnalyticsCharts();
        }

        function spSetTutorLessonChartMode(mode) {
            rptTutorLessonChartMode = mode;
            document.querySelectorAll('#rpt-tutor-lessonchart-toggle .sp-filter-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-mode') === mode);
            });
            renderTutorAnalyticsCharts();
        }

        function renderTutorAnalyticsKPI(data, range) {
            var box = document.getElementById('rpt-tutor-kpi-row');
            if (!box) return;
            box.innerHTML = ''
                + '<div class="fin-stat-card"><span class="label">👨‍🎓 HỌC SINH</span><div class="value" style="color:#00cca3;">' + data.overview.students + '</div></div>'
                + '<div class="fin-stat-card"><span class="label">📚 BUỔI HỌC</span><div class="value" style="color:#a78bfa;">' + data.overview.sessions + '</div></div>'
                + '<div class="fin-stat-card"><span class="label">⏱ GIỜ DẠY</span><div class="value" style="color:#a78bfa;">' + data.overview.hours + 'h</div></div>'
                + '<div class="fin-stat-card"><span class="label">💰 DOANH THU</span><div class="value" style="color:#10b981;">' + money(data.overview.taught) + '</div></div>';
            var labelEl = document.getElementById('rpt-tutor-period-label');
            if (labelEl) labelEl.innerText = '📅 Kỳ: ' + range.label + ' (' + spViDate(range.start) + ' – ' + spViDate(range.end) + ')';
        }

        // "So với kỳ trước" (mục 14 gộp mục 15) — % thay đổi so với kỳ liền trước cùng độ dài. Nếu kỳ
        // trước = 0 thì KHÔNG hiển thị % giả (mục 15), hiển thị "—".
        function renderTutorAnalyticsCompare(data, range) {
            var box = document.getElementById('rpt-tutor-compare-row');
            if (!box) return;
            var prevData = computeTutorAnalyticsForRange(spTutorPrevRange(range));
            function pct(cur, prev) { if (!prev) return null; return Math.round(((cur - prev) / prev) * 1000) / 10; }
            function arrow(v) { if (v === null) return '—'; return (v >= 0 ? '↑ +' : '↓ ') + v + '%'; }
            var dSessions = pct(data.overview.sessions, prevData.overview.sessions);
            var dHours = pct(data.overview.hours, prevData.overview.hours);
            var dRevenue = pct(data.overview.taught, prevData.overview.taught);
            if (prevData.overview.sessions === 0 && prevData.overview.taught === 0 && data.overview.sessions === 0) {
                box.innerText = 'Chưa đủ dữ liệu để so sánh với kỳ trước.';
                return;
            }
            box.innerHTML = 'So với kỳ trước liền kề (' + spViDate(spTutorPrevRange(range).start) + ' – ' + spViDate(spTutorPrevRange(range).end) + '): '
                + 'Buổi học ' + arrow(dSessions) + ' · Giờ dạy ' + arrow(dHours) + ' · Doanh thu ' + arrow(dRevenue);
        }

        function renderTutorAnalyticsLesson(data) {
            document.getElementById('rpt-tutor-la-completed').innerText = data.lessonAnalytics.completed;
            document.getElementById('rpt-tutor-la-scheduled').innerText = data.lessonAnalytics.scheduled;
            document.getElementById('rpt-tutor-la-cancelled').innerText = data.lessonAnalytics.cancelled;
            var rateEl = document.getElementById('rpt-tutor-la-rate');
            if (rateEl) rateEl.innerText = '';
            var totalInPeriod = data.lessonAnalytics.completed + data.lessonAnalytics.scheduled + data.lessonAnalytics.cancelled;
            var emptyEl = document.getElementById('rpt-tutor-la-empty');
            if (emptyEl) {
                emptyEl.style.display = totalInPeriod === 0 ? 'block' : 'none';
                if (totalInPeriod === 0) emptyEl.innerHTML = spEmptyState('📚', 'Không có buổi học', 'Không có buổi học nào trong kỳ đang chọn.');
            }
        }

        function renderTutorAnalyticsRevenue(data) {
            document.getElementById('rpt-tutor-rev-expected').innerText = money(data.overview.taught);
            document.getElementById('rpt-tutor-rev-collected').innerText = money(data.overview.collected);
            document.getElementById('rpt-tutor-rev-remaining').innerText = money(data.overview.remaining);
        }

        // 2 biểu đồ theo tháng (mục 8, 9) — TÁI SỬ DỤNG đúng CSS pattern year-bar-* của Finance Dashboard
        // (không thêm chart library). Toggle 6/12 tháng và Completed/Tất cả chỉ vẽ lại 2 box này.
        function renderTutorAnalyticsCharts() {
            var revBox = document.getElementById('rpt-tutor-chart-revenue');
            var sesBox = document.getElementById('rpt-tutor-chart-sessions');
            if (!revBox || !sesBox) return;
            var n = rptTutorRevChartMonths;
            var now = new Date();
            var viMonths = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
            var months = [];
            for (var i = n - 1; i >= 0; i--) {
                var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({ month: d.getMonth(), key: getMonthKey(d.getFullYear(), d.getMonth()) });
            }
            var totals = months.map(function(mo) { return spTutorMonthTotals(mo.key); });

            var maxRev = Math.max.apply(null, totals.map(function(t) { return Math.max(t.taught, t.collected); }).concat([0]));
            revBox.innerHTML = months.map(function(mo, i) {
                var t = totals[i];
                var pctT = maxRev > 0 ? Math.max(t.taught > 0 ? 3 : 0, Math.round((t.taught / maxRev) * 100)) : 0;
                var pctC = maxRev > 0 ? Math.max(t.collected > 0 ? 3 : 0, Math.round((t.collected / maxRev) * 100)) : 0;
                return '<div class="year-bar-item"><div class="year-bar-label">' + viMonths[mo.month] + '</div>'
                    + '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">'
                    + '<div class="year-bar-track" style="height:20px;"><div class="year-bar-fill" style="width:' + pctT + '%;">' + (t.taught > 0 ? '<span>' + money(t.taught) + '</span>' : '') + '</div></div>'
                    + '<div class="year-bar-track" style="height:20px;"><div class="year-bar-fill" style="width:' + pctC + '%;background:linear-gradient(90deg,#38bdf8,#0284c7);">' + (t.collected > 0 ? '<span>' + money(t.collected) + '</span>' : '') + '</div></div>'
                    + '</div></div>';
            }).join('') + '<div style="display:flex;gap:16px;justify-content:flex-end;font-size:11px;color:var(--text-sub);margin-top:8px;"><span>🟢 Dự kiến</span><span>🔵 Đã thu</span></div>';

            var maxSes = Math.max.apply(null, totals.map(function(t) { return rptTutorLessonChartMode === 'completed' ? t.completedSessions : t.allSessions; }).concat([0]));
            sesBox.innerHTML = months.map(function(mo, i) {
                var t = totals[i];
                var val = rptTutorLessonChartMode === 'completed' ? t.completedSessions : t.allSessions;
                var pct = maxSes > 0 ? Math.max(val > 0 ? 3 : 0, Math.round((val / maxSes) * 100)) : 0;
                return '<div class="year-bar-item"><div class="year-bar-label">' + viMonths[mo.month] + '</div>'
                    + '<div class="year-bar-track"><div class="year-bar-fill" style="width:' + pct + '%;">' + (val > 0 ? '<span>' + val + ' buổi</span>' : '') + '</div></div>'
                    + '<div class="year-bar-amount">' + (val > 0 ? val + ' buổi' : '—') + '</div></div>';
            }).join('');
        }

        // ⚡ Cần chú ý (mục 12) — 4 loại insight tự động phát hiện, TẤT CẢ derive từ data thật, KHÔNG
        // tạo notification giả.
        function renderTutorAnalyticsInsights(data) {
            var box = document.getElementById('rpt-tutor-insights');
            if (!box) return;
            var items = [];

            data.rows.filter(function(r) { return r.daysSinceLast !== null && r.daysSinceLast >= 7; })
                .sort(function(a, b) { return b.daysSinceLast - a.daysSinceLast; }).slice(0, 3)
                .forEach(function(r) { items.push({ icon: '⚠️', title: escapeHtml(r.name), sub: r.daysSinceLast + ' ngày chưa có buổi học', action: 'Xem học sinh', onclick: "spAnalyticsOpenStudentTab(" + JSON.stringify(r.id) + ",'overview')" }); });
            data.rows.filter(function(r) { return r.remaining > 0; })
                .sort(function(a, b) { return b.remaining - a.remaining; }).slice(0, 3)
                .forEach(function(r) { items.push({ icon: '💰', title: escapeHtml(r.name), sub: 'Còn ' + money(r.remaining) + ' chưa thanh toán', action: 'Xem tài chính', onclick: "spAnalyticsOpenStudentTab(" + JSON.stringify(r.id) + ",'tuition')" }); });
            var workload = spTutorUpcomingWorkload();
            items.push({ icon: '📅', title: '7 ngày tới có ' + workload + ' buổi', sub: '', action: '', onclick: '' });

            if (!items.length) { box.innerHTML = spEmptyState('✅', 'Mọi thứ đều ổn', 'Không có mục nào cần chú ý ngay bây giờ.'); return; }
            box.innerHTML = items.map(function(it) {
                return '<div class="rpt-mini-row"' + (it.onclick ? (' onclick="' + it.onclick + '"') : ' style="cursor:default;"') + '>'
                    + '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
                    + '<div style="font-size:16px;">' + it.icon + '</div>'
                    + '<div style="min-width:0;"><div class="rpt-mini-name">' + it.title + '</div>' + (it.sub ? '<div class="rpt-mini-sub">' + it.sub + '</div>' : '') + '</div>'
                    + '</div>'
                    + (it.action ? '<div class="rpt-mini-amount" style="color:var(--accent);font-size:11.5px;">' + it.action + ' →</div>' : '')
                    + '</div>';
            }).join('');
        }

        // ⭐ Top 5 học sinh theo số buổi completed trong kỳ (mục 16).
        function renderTutorAnalyticsTopStudents(data) {
            var box = document.getElementById('rpt-tutor-top-students');
            if (!box) return;
            var top = data.rows.filter(function(r) { return r.sessions > 0; }).sort(function(a, b) { return b.sessions - a.sessions; }).slice(0, 5);
            if (!top.length) { box.innerHTML = spEmptyState('⭐', 'Chưa có dữ liệu', 'Chưa có buổi học hoàn thành trong kỳ này.'); return; }
            box.innerHTML = top.map(function(r, i) {
                return '<div class="rpt-mini-row" onclick="spAnalyticsOpenStudentTab(' + JSON.stringify(r.id) + ",'overview')\">"
                    + '<div style="display:flex;align-items:center;gap:10px;min-width:0;">'
                    + '<div class="rpt-mini-rank">' + (i + 1) + '</div>'
                    + '<div style="min-width:0;"><div class="rpt-mini-name">' + escapeHtml(r.name) + '</div><div class="rpt-mini-sub">' + escapeHtml(r.subject) + '</div></div>'
                    + '</div>'
                    + '<div class="rpt-mini-amount" style="color:#00cca3;">' + r.sessions + ' buổi</div>'
                    + '</div>';
            }).join('');
        }

        // Bảng Học sinh (mục 10) — Học sinh / Buổi học / Doanh thu / Trạng thái (risk badge,
        // mục 13). Click -> openProfilePage() đã có, KHÔNG tạo profile thứ hai.
        function renderTutorAnalyticsStudentTable(data) {
            var tbody = document.getElementById('rpt-tutor-student-body');
            if (!tbody) return;
            if (!data.rows.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-sub);">Chưa có học sinh nào.</td></tr>'; return; }
            var rows = data.rows.slice().sort(function(a, b) { return b.sessions - a.sessions; });
            var riskLabel = { healthy: '🟢 Healthy', attention: '🟡 Attention', risk: '🔴 Risk' };
            var riskColor = { healthy: '#10b981', attention: '#f59e0b', risk: '#ef4444' };
            tbody.innerHTML = rows.map(function(r) {
                var risk = spComputeStudentRisk(r);
                return '<tr style="cursor:pointer;" onclick="spAnalyticsOpenStudentTab(' + JSON.stringify(r.id) + ",'overview')\">"
                    + '<td><strong>' + escapeHtml(r.name) + '</strong><div style="font-size:11px;color:var(--text-sub);">' + escapeHtml(r.subject) + '</div></td>'
                    + '<td style="text-align:center;">' + r.sessions + '</td>'
                    + '<td style="color:#10b981;">' + money(r.taught) + '</td>'
                    + '<td><span style="color:' + riskColor[risk.level] + ';font-weight:700;font-size:12px;">' + riskLabel[risk.level] + '</span>'
                    + (risk.reasons.length ? '<div style="font-size:10.5px;color:var(--text-sub);margin-top:2px;">' + escapeHtml(risk.reasons.slice(0, 2).join(' + ')) + '</div>' : '')
                    + '</td></tr>';
            }).join('');
        }

        // Khoảng ngày Thứ 2 - Chủ Nhật của MỘT tuần, lệch weekOffset tuần so với tuần hiện tại
        // (0 = tuần này, -1 = tuần trước). Cùng hình dạng {start,end,months} như spTutorAnalyticsRange()/
        // spTutorPrevRange() để computeTutorAnalyticsForRange() (đã tính payments theo range.months) dùng
        // được thẳng, không cần biến thể riêng.
        function spWeekRange(weekOffset) {
            var now = new Date();
            var dow = (now.getDay() + 6) % 7; // 0 = Thứ 2
            var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + weekOffset * 7);
            var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
            var months = {};
            var cursor = new Date(monday.getFullYear(), monday.getMonth(), 1);
            var endCursor = new Date(sunday.getFullYear(), sunday.getMonth(), 1);
            while (cursor <= endCursor) { months[getMonthKey(cursor.getFullYear(), cursor.getMonth())] = true; cursor.setMonth(cursor.getMonth() + 1); }
            return { start: getLocalIsoDate(monday), end: getLocalIsoDate(sunday), months: Object.keys(months) };
        }

        // Weekly Summary (mục 14) — TÁI SỬ DỤNG computeTutorAnalyticsForRange() cho tuần này + tuần
        // trước, không tính công thức KPI riêng. Nếu tuần trước không có dữ liệu gì, hiển thị đúng
        // "Chưa đủ dữ liệu" thay vì bịa % so sánh (mục 15: previous = 0 → không hiển thị % giả).
        function renderTutorWeeklySummary() {
            var box = document.getElementById('rpt-tutor-weekly-summary');
            if (!box) return;
            var thisWeek = spWeekRange(0);
            var lastWeek = spWeekRange(-1);
            var cur = computeTutorAnalyticsForRange(thisWeek);
            var prev = computeTutorAnalyticsForRange(lastWeek);

            function pct(c, p) { if (!p) return null; return Math.round(((c - p) / p) * 1000) / 10; }
            function arrowText(v, unit) { if (v === null) return '—'; return (v >= 0 ? '↑ +' : '↓ ') + Math.abs(v) + (unit || '%'); }
            function arrowColor(v) { if (v === null) return 'var(--text-sub)'; return v >= 0 ? '#10b981' : '#ef4444'; }

            var hasPrevData = prev.overview.sessions > 0 || prev.overview.hours > 0 || prev.overview.taught > 0;
            var dSessions = pct(cur.overview.sessions, prev.overview.sessions);
            var dHours = pct(cur.overview.hours, prev.overview.hours);

            var compareHtml = !hasPrevData
                ? '<div style="font-size:12px;color:var(--text-sub);margin-top:12px;">Chưa đủ dữ liệu để so sánh với tuần trước.</div>'
                : '<div style="font-size:12px;color:var(--text-sub);margin-top:12px;">So với tuần trước ('
                    + spViDate(lastWeek.start) + ' – ' + spViDate(lastWeek.end) + '): '
                    + '<span style="color:' + arrowColor(dSessions) + ';font-weight:700;">Buổi ' + arrowText(dSessions) + '</span> · '
                    + '<span style="color:' + arrowColor(dHours) + ';font-weight:700;">Giờ dạy ' + arrowText(dHours) + '</span>'
                    + '</div>';

            box.innerHTML = '<div style="font-size:12.5px;color:var(--text-sub);margin-bottom:10px;">Tuần này (' + spViDate(thisWeek.start) + ' – ' + spViDate(thisWeek.end) + ') bạn:</div>'
                + '<div class="rpt-lesson-stat-row">'
                + '<div class="rpt-lesson-stat"><div class="num" style="color:#a78bfa;">' + cur.overview.sessions + '</div><div class="lbl">📚 Buổi đã dạy</div></div>'
                + '<div class="rpt-lesson-stat"><div class="num" style="color:#a78bfa;">' + cur.overview.hours + 'h</div><div class="lbl">⏱ Giờ dạy</div></div>'
                + '<div class="rpt-lesson-stat"><div class="num" style="color:#10b981;">' + money(cur.overview.taught) + '</div><div class="lbl">💰 Doanh thu dự kiến</div></div>'
                + '<div class="rpt-lesson-stat"><div class="num" style="color:#38bdf8;">' + money(cur.overview.collected) + '</div><div class="lbl">💵 Đã thu</div></div>'
                + '</div>'
                + compareHtml;
        }

        // Điểm vào DUY NHẤT để vẽ lại Reports (DASHBOARD/REPORTS SEPARATION V1) — gọi từ
        // openReportsPage()/refreshReportsPageIfOpen()/các filter (period/custom range/chart toggle).
        // Guard theo #reports-page-view (KHÔNG còn theo #finance-dashboard-view — đó là bug: Reports
        // và Finance Dashboard là 2 trang riêng biệt từ V1, nên render không được phụ thuộc trang kia
        // có đang mở hay không).
        function renderTutorAnalytics() {
            var view = document.getElementById('reports-page-view');
            if (!view || view.style.display === 'none') return;
            renderTutorWeeklySummary(); // mục 14 — độc lập với period filter, luôn là tuần hiện tại
            var range = spTutorAnalyticsRange();
            var data = computeTutorAnalyticsForRange(range);
            renderTutorAnalyticsKPI(data, range);
            renderTutorAnalyticsCompare(data, range);
            renderTutorAnalyticsLesson(data);
            renderTutorAnalyticsRevenue(data);
            renderTutorAnalyticsCharts();
            renderTutorAnalyticsInsights(data);
            renderTutorAnalyticsTopStudents(data);
            renderTutorAnalyticsStudentTable(data);
        }

        // ===== KIẾN TRÚC MỚI: ADMIN TÁI SỬ DỤNG TOÀN BỘ TRANG QUẢN LÝ TUTOR =====
        // Không còn modal "admin-tutor-detail-modal" riêng. Khi Admin bấm "Xem chi tiết" một Tutor,
        // hàm này sẽ MỞ CHÍNH main-page-view (trang Dashboard mà Tutor tự đăng nhập cũng dùng),
        // nạp classList của Tutor đó qua loadTutorClassList() (dùng chung với doLogin), và set
        // activeTutorId = tutorId để addNewClass/removeClass/saveEditClass (bên dưới) ghi đúng Tutor này.
        // Toàn bộ CRUD học sinh + lịch học từ đây dùng LẠI addNewClass/removeClass/openProfilePage/
        // openEditClass/saveEditClass — không có bản sao "adminAddStudent/adminDeleteStudent" nào nữa.
        async function openTutorWorkspaceAsAdmin(tutorId) {
            const { data: tutor, error: tutorError } = await supabaseClient
                .from('tutors')
                .select('*')
                .eq('id', tutorId)
                .maybeSingle();

            if (tutorError || !tutor) {
                console.error('Admin mở quản lý Tutor FAILED:', tutorError);
                alert('⚠️ Không tải được thông tin Tutor.');
                return;
            }

            var tutorProfile = null;
            if (tutor.user_id) {
                const { data: tp, error: tpError } = await supabaseClient
                    .from('profiles')
                    .select('email, full_name')
                    .eq('id', tutor.user_id)
                    .maybeSingle();
                if (tpError) {
                    console.warn('Không lấy được profile email cho tutor này:', tpError.message || tpError);
                } else {
                    tutorProfile = tp;
                }
            }

            var loadResult = await loadTutorClassList(tutorId);
            if (loadResult.error) {
                console.error('Admin tải danh sách học sinh của Tutor FAILED:', loadResult.error);
                alert('⚠️ Không tải được danh sách học sinh của Tutor này (' + (loadResult.error.message || '') + ').');
                return;
            }

            var tutorName = tutor.display_name || (tutorProfile && tutorProfile.full_name) || (tutorProfile && tutorProfile.email) || '(Chưa có tên)';

            // ----- Bật chế độ "Admin quản lý hộ Tutor" trên CHÍNH trang Tutor Dashboard -----
            isAdminManagingTutor = true;
            adminManagedTutorInfo = { id: tutor.id, display_name: tutorName, email: (tutorProfile && tutorProfile.email) || '' };
            activeTutorId = tutorId;
            classList = loadResult.classList;
            freeSchedule = { "Thứ 2":[],"Thứ 3":[],"Thứ 4":[],"Thứ 5":[],"Thứ 6":[],"Thứ 7":[],"Chủ Nhật":[] };

            document.getElementById('admin-view').style.display = 'none';
            document.getElementById('main-page-view').style.display = 'flex';
            document.getElementById('btn-back-admin').style.display = 'inline-flex';

            var banner = document.getElementById('admin-managing-banner');
            banner.style.display = 'flex';
            document.getElementById('admin-managing-banner-name').innerText = tutorName;

            document.getElementById('nav-avatar-text').innerText = '🛡';
            document.getElementById('nav-username-display').innerText = 'Quản lý: ' + tutorName;

            toggleDay(getDefaultDayView()); applyCompactModeFromSettings();
            updateTimeSelectOptions();
            renderClassList();
        }

        // ===== ADMIN: THÊM GIA SƯ QUA SUPABASE EDGE FUNCTION create-tutor =====
        // Dùng supabaseClient hiện có (KHÔNG tạo client mới, KHÔNG service_role/secret key trong frontend).
        function openAddTutorModal() {
            document.getElementById('at-name').value = '';
            document.getElementById('at-email').value = '';
            document.getElementById('at-password').value = '';
            document.getElementById('at-phone').value = '';
            document.getElementById('add-tutor-error').style.display = 'none';
            document.getElementById('admin-add-tutor-modal').classList.add('open');
        }

        function closeAddTutorModal() {
            document.getElementById('admin-add-tutor-modal').classList.remove('open');
        }

        function showAddTutorError(msg) {
            var errBox = document.getElementById('add-tutor-error');
            errBox.innerText = msg;
            errBox.style.display = 'block';
        }

        async function submitAddTutor() {
            var errBox = document.getElementById('add-tutor-error');
            errBox.style.display = 'none';

            var name = document.getElementById('at-name').value.trim();
            var email = document.getElementById('at-email').value.trim();
            var password = document.getElementById('at-password').value;
            var phone = document.getElementById('at-phone').value.trim();

            // Validate trước khi gọi Edge Function
            if (!name) { showAddTutorError('⚠️ Vui lòng nhập họ tên.'); return; }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAddTutorError('⚠️ Email không hợp lệ.'); return; }
            if (!password || password.length < 6) { showAddTutorError('⚠️ Mật khẩu phải từ 6 ký tự trở lên.'); return; }

            var btn = document.getElementById('at-submit-btn');
            if (btn.disabled) return; // Chặn double-submit khi request đang chạy
            var originalBtnText = btn.innerText;
            btn.disabled = true;
            btn.innerText = '⏳ Đang tạo...';

            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session) {
                    showAddTutorError('⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
                    return;
                }

                const { data, error } = await supabaseClient.functions.invoke('create-tutor', {
                    body: { email: email, password: password, name: name, phone: phone }
                });

                if (error) {
                    var status = (error.context && error.context.status) || error.status || null;
                    console.error('create-tutor FAILED:', error.message, 'status:', status);
                    if (status === 401) showAddTutorError('⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
                    else if (status === 403) showAddTutorError('⚠️ Bạn không có quyền tạo gia sư.');
                    else if (status === 409) showAddTutorError('⚠️ Email đã tồn tại.');
                    else showAddTutorError('⚠️ ' + (error.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.'));
                    return;
                }

                if (!data || data.success !== true) {
                    var backendMsg = (data && (data.error || data.message)) || 'Không thể tạo gia sư. Vui lòng thử lại.';
                    console.error('create-tutor response not success:', data);
                    showAddTutorError('⚠️ ' + backendMsg);
                    return;
                }

                // Thành công
                showToast('✅', 'Tạo gia sư thành công!', name + ' đã được thêm vào hệ thống.');
                closeAddTutorModal();
                loadAdminTutorsFromSupabase(); // Reload danh sách tutor — KHÔNG reload trang
                refreshAdminDashboardStats();  // Mục 10: dashboard phải tăng số Tutor ngay sau khi thêm
            } catch (err) {
                console.error('create-tutor ERROR:', err);
                showAddTutorError('⚠️ Không thể kết nối tới máy chủ. Vui lòng thử lại.');
            } finally {
                btn.disabled = false;
                btn.innerText = originalBtnText;
            }
        }

        function adminDeleteUser(username) {
            if (!confirm('Xóa tài khoản "' + username + '"? Toàn bộ dữ liệu sẽ bị mất!')) return;
            var users = getUsers();
            delete users[username];
            saveUsers(users);
            localStorage.removeItem('gsm_data_' + username);
            renderAdminPanel();
        }

        function saveData() {
            if (isSupabaseTutorSession || isSupabaseAdminSession) return; // Phiên Supabase (Tutor/Admin): chưa ghi dữ liệu vào localStorage ở phase này
            if (currentUser && currentUser !== 'superadmin' && !currentUser.startsWith('__admin_viewing_')) {
                saveUserData(currentUser, { classList: classList, freeSchedule: freeSchedule });
            }
        }

        function backToAdmin() {
            document.getElementById('main-page-view').style.display = 'none';
            document.getElementById('finance-dashboard-view').style.display = 'none';
            var repView = document.getElementById('reports-page-view');
            if (repView) repView.style.display = 'none';
            document.getElementById('profile-page-view').style.display = 'none';
            document.getElementById('btn-back-admin').style.display = 'none';
            document.getElementById('admin-managing-banner').style.display = 'none';

            // Thoát chế độ "Admin quản lý hộ Tutor" (nếu đang bật) — không ảnh hưởng phiên Tutor tự đăng nhập
            var wasManagingSupabaseTutor = isAdminManagingTutor;
            isAdminManagingTutor = false;
            adminManagedTutorInfo = null;
            activeTutorId = null;
            classList = [];

            document.getElementById('admin-view').style.display = 'block';
            renderAdminPanel();
            if (wasManagingSupabaseTutor && isSupabaseAdminSession) {
                loadAdminTutorsFromSupabase(); // làm mới số học sinh/lịch vừa thay đổi trên danh sách Tutor
                refreshAdminDashboardStats();  // mục B11: refresh KPI + Reports + Finance ngay, không cần F5
            }
        }

        // ================================================================================
        // ===== ADMIN: QUẢN LÝ TUTOR — CHUYỂN TUTOR & XÓA HẲN TUTOR =====
        // Cả 2 chức năng đều đi qua Supabase Edge Function (KHÔNG bao giờ dùng service_role/secret key
        // trong frontend, KHÔNG gọi supabaseClient.auth.admin.* trực tiếp trong browser — xem mục B3).
        // Edge Function tự kiểm tra JWT của người gọi + profiles.role === 'admin' phía SERVER, KHÔNG
        // chỉ dựa vào việc ẩn nút ở đây (mục A9/B9).
        // ================================================================================
        var transferTutorState = { fromTutorId: null, fromName: '', fromCount: 0, toTutorId: null, toName: '' };

        // ----- PHẦN A: CHUYỂN TUTOR -----
        async function openTransferTutorModal() {
            if (!isAdminManagingTutor || !activeTutorId) return; // phòng thủ thêm, banner vốn đã ẩn nút này với Tutor tự đăng nhập
            var errBox = document.getElementById('tt-error');
            errBox.style.display = 'none';

            transferTutorState = { fromTutorId: activeTutorId, fromName: (adminManagedTutorInfo && adminManagedTutorInfo.display_name) || '—', fromCount: classList.length, toTutorId: null, toName: '' };
            document.getElementById('tt-from-name').innerText = transferTutorState.fromName;
            document.getElementById('tt-from-count').innerText = transferTutorState.fromCount;
            document.getElementById('tt-confirm-text').style.display = 'none';
            var confirmBtn = document.getElementById('tt-confirm-btn');
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';

            var select = document.getElementById('tt-to-select');
            select.innerHTML = '<option value="">Đang tải danh sách Tutor...</option>';
            document.getElementById('transfer-tutor-modal').classList.add('open');

            // Luôn tải danh sách Tutor MỚI NHẤT từ Supabase (không dùng cache có thể cũ) — loại trừ
            // đúng Tutor hiện tại (activeTutorId), KHÔNG hard-code.
            const { data: tutors, error } = await supabaseClient
                .from('tutors')
                .select('id, display_name')
                .neq('id', activeTutorId)
                .order('display_name', { ascending: true });

            if (error) {
                select.innerHTML = '<option value="">— Chọn Tutor —</option>';
                errBox.innerText = '⚠️ Không tải được danh sách Tutor.\n' + describeSupabaseError(error);
                errBox.style.display = 'block';
                return;
            }

            if (!tutors || tutors.length === 0) {
                select.innerHTML = '<option value="">Không có Tutor nào khác để chuyển đến</option>';
                return;
            }

            select.innerHTML = '<option value="">— Chọn Tutor —</option>'
                + tutors.map(function(t) { return '<option value="' + t.id + '">' + escapeHtml(t.display_name || '(Chưa có tên)') + '</option>'; }).join('');
        }

        function closeTransferTutorModal() {
            document.getElementById('transfer-tutor-modal').classList.remove('open');
        }

        function onTransferTutorSelectChange() {
            var select = document.getElementById('tt-to-select');
            var confirmBtn = document.getElementById('tt-confirm-btn');
            var confirmText = document.getElementById('tt-confirm-text');
            var selectedId = select.value;
            var selectedName = selectedId ? select.options[select.selectedIndex].text : '';

            transferTutorState.toTutorId = selectedId || null;
            transferTutorState.toName = selectedName;

            if (!selectedId) {
                confirmText.style.display = 'none';
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                return;
            }

            confirmText.innerText = 'Bạn sắp chuyển ' + transferTutorState.fromCount + ' học sinh từ "' + transferTutorState.fromName + '" sang "' + selectedName + '".';
            confirmText.style.display = 'block';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
        }

        async function confirmTransferTutor() {
            var errBox = document.getElementById('tt-error');
            errBox.style.display = 'none';
            if (!transferTutorState.fromTutorId || !transferTutorState.toTutorId) return;

            var btn = document.getElementById('tt-confirm-btn');
            if (btn.disabled && btn.innerText.indexOf('Đang') === 0) return; // chặn double-submit
            var originalText = btn.innerText;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.innerText = '⏳ Đang chuyển...';

            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session) {
                    errBox.innerText = '⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
                    errBox.style.display = 'block';
                    return;
                }

                const { data, error } = await supabaseClient.functions.invoke('transfer-tutor', {
                    body: { from_tutor_id: transferTutorState.fromTutorId, to_tutor_id: transferTutorState.toTutorId }
                });

                if (error) {
                    var status = (error.context && error.context.status) || error.status || null;
                    console.error('transfer-tutor FAILED:', error.message, 'status:', status);
                    if (status === 401) errBox.innerText = '⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
                    else if (status === 403) errBox.innerText = '⚠️ Bạn không có quyền chuyển Tutor.';
                    else errBox.innerText = '⚠️ Không thể chuyển Tutor. Dữ liệu chưa được thay đổi.\n' + (error.message || '');
                    errBox.style.display = 'block';
                    return;
                }

                if (!data || data.success !== true) {
                    console.error('transfer-tutor response not success:', data);
                    errBox.innerText = '⚠️ ' + ((data && (data.error || data.message)) || 'Không thể chuyển Tutor. Dữ liệu chưa được thay đổi.');
                    errBox.style.display = 'block';
                    return;
                }

                // ----- THÀNH CÔNG -----
                var movedCount = data.transferred_count != null ? data.transferred_count : transferTutorState.fromCount;
                var toName = transferTutorState.toName;
                closeTransferTutorModal();
                showToast('✅', 'Đã chuyển Tutor thành công', 'Đã chuyển ' + movedCount + ' học sinh sang ' + toName + '.');

                // Mục B11/B13/B14: refresh classList của Tutor hiện tại (giờ đã 0 học sinh), Today's Work,
                // Reports/Finance/Admin dashboard, danh sách Tutor — KHÔNG cần F5.
                var reload = await loadTutorClassList(activeTutorId);
                if (!reload.error) {
                    classList = reload.classList;
                    renderClassList(); // tự động gọi renderTodaysWork() bên trong
                    if (adminManagedTutorInfo) adminManagedTutorInfo.studentCount = classList.length;
                }
                if (isSupabaseAdminSession) {
                    loadAdminTutorsFromSupabase();
                    refreshAdminDashboardStats();
                }
            } catch (err) {
                console.error('transfer-tutor ERROR:', err);
                errBox.innerText = '⚠️ Không thể kết nối tới máy chủ. Dữ liệu chưa được thay đổi.';
                errBox.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerText = originalText;
            }
        }

        // ----- PHẦN B: XÓA HẲN TUTOR -----
        var deleteTutorState = { tutorId: null, name: '', studentCount: 0 };

        function deleteTutorSetFooter(which) {
            ['dt-footer-blocked', 'dt-footer-confirm1', 'dt-footer-confirm2'].forEach(function(id) {
                document.getElementById(id).style.display = (id === which) ? 'flex' : 'none';
            });
        }
        function deleteTutorSetState(which) {
            ['dt-state-blocked', 'dt-state-confirm1', 'dt-state-confirm2'].forEach(function(id) {
                document.getElementById(id).style.display = (id === which) ? 'block' : 'none';
            });
        }

        function openDeleteTutorModal() {
            if (!isAdminManagingTutor || !activeTutorId) return; // phòng thủ thêm, xem giải thích ở openTransferTutorModal()
            var errBox = document.getElementById('dt-error');
            errBox.style.display = 'none';

            var name = (adminManagedTutorInfo && adminManagedTutorInfo.display_name) || '—';
            var count = classList.length; // classList hiện tại LUÔN đúng số học sinh thật của Tutor này (đã nạp từ Supabase)
            deleteTutorState = { tutorId: activeTutorId, name: name, studentCount: count };

            document.getElementById('delete-tutor-modal').classList.add('open');

            if (count > 0) {
                // Mục B6: mặc định KHÔNG cho xóa nếu còn học sinh — bắt buộc chuyển trước.
                document.getElementById('dt-blocked-name').innerText = name;
                document.getElementById('dt-blocked-count').innerText = count;
                deleteTutorSetState('dt-state-blocked');
                deleteTutorSetFooter('dt-footer-blocked');
                return;
            }

            // 0 học sinh -> student_schedules/lessons/payments của Tutor này (khóa theo student_id)
            // chắc chắn cũng bằng 0 vì không còn học sinh nào tutor_id = tutor này.
            document.getElementById('dt-c1-name').innerText = name;
            document.getElementById('dt-c1-students').innerText = 0;
            document.getElementById('dt-c1-schedules').innerText = 0;
            document.getElementById('dt-c1-lessons').innerText = 0;
            document.getElementById('dt-c1-payments').innerText = 0;
            deleteTutorSetState('dt-state-confirm1');
            deleteTutorSetFooter('dt-footer-confirm1');
        }

        function closeDeleteTutorModal() {
            document.getElementById('delete-tutor-modal').classList.remove('open');
            document.getElementById('dt-c2-input').value = '';
            var finalBtn = document.getElementById('dt-final-btn');
            finalBtn.disabled = true;
            finalBtn.style.opacity = '0.4';
        }

        function deleteTutorGoToStep2() {
            document.getElementById('dt-c2-name-label').innerText = deleteTutorState.name;
            document.getElementById('dt-c2-input').value = '';
            deleteTutorSetState('dt-state-confirm2');
            deleteTutorSetFooter('dt-footer-confirm2');
            var finalBtn = document.getElementById('dt-final-btn');
            finalBtn.disabled = true;
            finalBtn.style.opacity = '0.4';
        }

        function onDeleteTutorConfirmInput() {
            var input = document.getElementById('dt-c2-input').value;
            var finalBtn = document.getElementById('dt-final-btn');
            var matches = input === deleteTutorState.name && input.length > 0; // mục B2: phải khớp CHÍNH XÁC
            finalBtn.disabled = !matches;
            finalBtn.style.opacity = matches ? '1' : '0.4';
        }

        async function confirmDeleteTutorFinal() {
            var errBox = document.getElementById('dt-error');
            errBox.style.display = 'none';
            var finalBtn = document.getElementById('dt-final-btn');
            if (finalBtn.disabled) return;
            var input = document.getElementById('dt-c2-input').value;
            if (input !== deleteTutorState.name) return; // double-check phía client, backend vẫn tự kiểm tra độc lập

            var originalText = finalBtn.innerText;
            finalBtn.disabled = true;
            finalBtn.style.opacity = '0.6';
            finalBtn.innerText = '⏳ Đang xóa...';

            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session) {
                    errBox.innerText = '⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
                    errBox.style.display = 'block';
                    return;
                }

                const { data, error } = await supabaseClient.functions.invoke('delete-tutor', {
                    body: { tutor_id: deleteTutorState.tutorId }
                });

                if (error) {
                    var status = (error.context && error.context.status) || error.status || null;
                    console.error('delete-tutor FAILED:', error.message, 'status:', status);
                    if (status === 401) errBox.innerText = '⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
                    else if (status === 403) errBox.innerText = '⚠️ Bạn không có quyền xóa Tutor.';
                    else if (status === 409) errBox.innerText = '⚠️ Không thể xóa Tutor vì vẫn còn học sinh liên quan.';
                    else errBox.innerText = '⚠️ Không thể xóa Tutor. Dữ liệu chưa được thay đổi.\n' + (error.message || '');
                    errBox.style.display = 'block';
                    return;
                }

                if (!data || data.success !== true) {
                    console.error('delete-tutor response not success:', data);
                    errBox.innerText = '⚠️ ' + ((data && (data.error || data.message)) || 'Không thể xóa Tutor. Dữ liệu chưa được thay đổi.');
                    errBox.style.display = 'block';
                    return;
                }

                // ----- THÀNH CÔNG (mục B16) -----
                closeDeleteTutorModal();
                var deletedName = deleteTutorState.name;
                backToAdmin(); // đóng Tutor detail, quay về Admin Tutor list — đã tự reload tutors + dashboard stats bên trong
                showToast('✅', 'Đã xóa Tutor thành công', deletedName + ' đã được xóa khỏi hệ thống.');
            } catch (err) {
                console.error('delete-tutor ERROR:', err);
                errBox.innerText = '⚠️ Không thể kết nối tới máy chủ. Dữ liệu chưa được thay đổi.';
                errBox.style.display = 'block';
            } finally {
                finalBtn.innerText = originalText;
                // Không bật lại finalBtn nếu modal đã đóng do thành công; nếu còn mở (do lỗi) thì mở khóa lại
                // theo đúng trạng thái input hiện tại.
                if (document.getElementById('delete-tutor-modal').classList.contains('open')) {
                    onDeleteTutorConfirmInput();
                }
            }
        }

        function adminViewUser(username) {
            var users = getUsers();
            var data = getUserData(username);
            classList = data.classList || [];
            freeSchedule = data.freeSchedule || { "Thứ 2": [], "Thứ 3": [], "Thứ 4": [], "Thứ 5": [], "Thứ 6": [], "Thứ 7": [], "Chủ Nhật": [] };
            currentUser = '__admin_viewing_' + username;

            document.getElementById('admin-view').style.display = 'none';
            document.getElementById('main-page-view').style.display = 'flex';
            document.getElementById('btn-back-admin').style.display = 'inline-flex';

            var displayName = (users[username] && users[username].displayName) || username;
            document.getElementById('nav-avatar-text').innerText = '🛡';
            document.getElementById('nav-username-display').innerText = 'Xem: ' + displayName;

            toggleDay(getDefaultDayView()); updateTimeSelectOptions(); renderClassList(); applyCompactModeFromSettings();
        }

        // ===== ROADMAP PAGE =====
        var activeRoadmapId = null;

        function openRoadmapPage() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            activeRoadmapId = student.id;
            if (!student.roadmap) student.roadmap = { daily: [], longterm: [], word: [] };

            document.getElementById('rm-student-name').innerText = student.name;
            document.getElementById('rm-student-subject').innerText = student.subject;

            document.getElementById('profile-page-view').style.display = 'none';
            document.getElementById('roadmap-view').style.display = 'block';

            // Set ngày hôm nay mặc định cho input date
            var today = new Date().toISOString().split('T')[0];
            document.getElementById('rm-daily-date').value = today;

            switchRmTab('daily');
            renderRoadmap();
        }

        function closeRoadmapPage() {
            document.getElementById('roadmap-view').style.display = 'none';
            document.getElementById('profile-page-view').style.display = 'block';
        }

        function switchRmTab(tab) {
            ['daily','longterm','word'].forEach(function(t) {
                document.getElementById('rm-panel-' + t).classList.toggle('active', t === tab);
            });
            document.querySelectorAll('.rm-tab').forEach(function(btn, i) {
                btn.classList.toggle('active', ['daily','longterm','word'][i] === tab);
            });
        }

        function getRoadmap() {
            var student = classList.find(c => c.id === activeRoadmapId);
            if (!student) return null;
            if (!student.roadmap) student.roadmap = { daily: [], longterm: [], word: [] };
            return student.roadmap;
        }

        function renderRoadmap() {
            var rm = getRoadmap();
            if (!rm) return;
            var all = rm.daily.concat(rm.longterm).concat(rm.word);
            var done = all.filter(t => t.done).length;
            var total = all.length;
            var pct = total === 0 ? 0 : Math.round(done / total * 100);

            document.getElementById('rm-pct').innerText = pct + '%';
            document.getElementById('rm-pct-label').innerText = pct + '%';
            document.getElementById('rm-progress-fill').style.width = pct + '%';

            var dailyDone = rm.daily.filter(t=>t.done).length;
            var longDone = rm.longterm.filter(t=>t.done).length;
            var wordDone = rm.word.filter(t=>t.done).length;
            document.getElementById('rm-daily-done').innerText = dailyDone + '/' + rm.daily.length;
            document.getElementById('rm-long-done').innerText = longDone + '/' + rm.longterm.length;
            document.getElementById('rm-word-done').innerText = wordDone + '/' + rm.word.length;

            // Cập nhật progress trên trang hồ sơ
            document.getElementById('profile-progress-fill').style.width = pct + '%';
            document.getElementById('profile-progress-text').innerText = pct + '%';
            document.getElementById('profile-lesson-summary').innerText = done + '/' + total + ' bài học';

            renderDailyList();
            renderLongList();
            renderWordList();
            saveData();
        }

        // ---- DAILY TASKS ----
        function addDailyTask() {
            var title = document.getElementById('rm-daily-input').value.trim();
            var date = document.getElementById('rm-daily-date').value;
            if (!title) return;
            var rm = getRoadmap(); if (!rm) return;
            rm.daily.push({ id: Date.now(), title: title, date: date, done: false });
            document.getElementById('rm-daily-input').value = '';
            renderRoadmap();
        }

        function renderDailyList() {
            var rm = getRoadmap(); if (!rm) return;
            var box = document.getElementById('rm-daily-list');
            if (rm.daily.length === 0) {
                box.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-sub);font-size:13px;">Chưa có bài học theo ngày nào. Thêm ngay ở trên!</div>';
                return;
            }
            // Nhóm theo ngày
            var groups = {};
            rm.daily.forEach(function(t) {
                var key = t.date || 'Chưa xác định';
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
            });
            var sortedKeys = Object.keys(groups).sort();
            box.innerHTML = '';
            sortedKeys.forEach(function(dateKey) {
                var tasks = groups[dateKey];
                var doneCnt = tasks.filter(t=>t.done).length;
                var label = dateKey === 'Chưa xác định' ? dateKey : formatDate(dateKey);
                var grp = document.createElement('div'); grp.className = 'task-group';
                var header = document.createElement('div'); header.className = 'task-group-header';
                header.innerHTML = '<h4>📅 ' + label + ' <span style="font-size:11px;color:var(--text-sub);font-weight:500;">(' + doneCnt + '/' + tasks.length + ' hoàn thành)</span></h4>'
                    + '<span style="font-size:12px;color:var(--text-sub);">' + Math.round(doneCnt/tasks.length*100) + '%</span>';
                var body = document.createElement('div'); body.className = 'task-group-body';
                tasks.forEach(function(t) {
                    body.appendChild(makeTaskEl(t, 'daily'));
                });
                grp.appendChild(header); grp.appendChild(body);
                box.appendChild(grp);
            });
        }

        // ---- LONGTERM TASKS ----
        function addLongTask() {
            var title = document.getElementById('rm-long-input').value.trim();
            var priority = document.getElementById('rm-long-priority').value;
            if (!title) return;
            var rm = getRoadmap(); if (!rm) return;
            rm.longterm.push({ id: Date.now(), title: title, priority: priority, done: false });
            document.getElementById('rm-long-input').value = '';
            renderRoadmap();
        }

        function renderLongList() {
            var rm = getRoadmap(); if (!rm) return;
            var box = document.getElementById('rm-long-list');
            if (rm.longterm.length === 0) {
                box.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-sub);font-size:13px;">Chưa có mục tiêu dài hạn nào.</div>';
                return;
            }
            var groups = { high: [], mid: [], low: [] };
            rm.longterm.forEach(function(t) { (groups[t.priority] || groups.mid).push(t); });
            var labels = { high: '🔴 Ưu tiên cao', mid: '🟡 Trung bình', low: '🟢 Thấp' };
            box.innerHTML = '';
            ['high','mid','low'].forEach(function(p) {
                if (groups[p].length === 0) return;
                var grp = document.createElement('div'); grp.className = 'task-group';
                var doneCnt = groups[p].filter(t=>t.done).length;
                var header = document.createElement('div'); header.className = 'task-group-header';
                header.innerHTML = '<h4>' + labels[p] + ' <span style="font-size:11px;color:var(--text-sub);font-weight:500;">(' + doneCnt + '/' + groups[p].length + ')</span></h4>';
                var body = document.createElement('div'); body.className = 'task-group-body';
                groups[p].forEach(function(t) { body.appendChild(makeTaskEl(t, 'longterm')); });
                grp.appendChild(header); grp.appendChild(body);
                box.appendChild(grp);
            });
        }

        // ---- WORD IMPORT ----
        var wordLines = [];

        function handleWordUpload(input) {
            var file = input.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e) {
                var text = '';
                if (file.name.endsWith('.txt')) {
                    text = e.target.result;
                } else {
                    // Đọc .docx/.doc dạng binary → tách text thô (không cần thư viện ngoài)
                    var raw = e.target.result;
                    // Tách text từ XML bên trong docx
                    try {
                        // docx là ZIP, tìm chuỗi text giữa các thẻ XML
                        var decoded = '';
                        for (var i = 0; i < raw.length; i++) {
                            var c = raw.charCodeAt(i);
                            if (c > 31 && c < 127) decoded += raw[i];
                            else if (c === 10 || c === 13) decoded += '\n';
                        }
                        // Tách text từ thẻ <w:t>
                        var matches = decoded.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
                        if (matches.length > 0) {
                            text = matches.map(function(m) {
                                return m.replace(/<[^>]+>/g, '');
                            }).join(' ');
                        } else {
                            text = decoded.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, '\n').trim();
                        }
                    } catch(ex) {
                        text = 'Không thể đọc file này. Hãy thử lưu lại dưới dạng .txt';
                    }
                }

                // Tách thành dòng
                wordLines = text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 1);
                document.getElementById('word-preview-area').style.display = 'block';
                document.getElementById('word-preview-text').innerText = wordLines.join('\n');

                // Tạo checkbox cho từng dòng
                var chkBox = document.getElementById('word-line-checkboxes');
                chkBox.innerHTML = '<div style="font-size:12px;color:var(--text-sub);margin-bottom:8px;">Chọn các dòng muốn nhập thành bài học:</div>';
                wordLines.forEach(function(line, i) {
                    var lbl = document.createElement('label');
                    lbl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:7px;cursor:pointer;font-size:13px;';
                    lbl.innerHTML = '<input type="checkbox" checked data-idx="' + i + '" style="margin:2px 0 0;accent-color:#fb923c;flex-shrink:0;"><span>' + line + '</span>';
                    chkBox.appendChild(lbl);
                });
            };
            if (file.name.endsWith('.txt')) reader.readAsText(file, 'UTF-8');
            else reader.readAsBinaryString(file);
        }

        function importWordLines() {
            var checked = document.querySelectorAll('#word-line-checkboxes input[type=checkbox]:checked');
            var rm = getRoadmap(); if (!rm) return;
            var added = 0;
            checked.forEach(function(chk) {
                var idx = parseInt(chk.getAttribute('data-idx'));
                var line = wordLines[idx];
                if (line && !rm.word.find(t => t.title === line)) {
                    rm.word.push({ id: Date.now() + added, title: line, done: false, source: 'word' });
                    added++;
                }
            });
            document.getElementById('word-preview-area').style.display = 'none';
            document.getElementById('word-file-input').value = '';
            if (added > 0) { renderRoadmap(); } else {
                alert('Không có dòng mới nào được thêm (có thể đã tồn tại).');
            }
        }

        function renderWordList() {
            var rm = getRoadmap(); if (!rm) return;
            var box = document.getElementById('rm-word-list');
            if (rm.word.length === 0) {
                box.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-sub);font-size:13px;">Chưa có bài học nào được nhập từ Word.</div>';
                return;
            }
            box.innerHTML = '';
            var doneCnt = rm.word.filter(t=>t.done).length;
            var grp = document.createElement('div'); grp.className = 'task-group';
            var header = document.createElement('div'); header.className = 'task-group-header';
            header.innerHTML = '<h4>📄 Bài học từ tài liệu Word <span style="font-size:11px;color:var(--text-sub);font-weight:500;">(' + doneCnt + '/' + rm.word.length + ' hoàn thành)</span></h4>'
                + '<span style="font-size:12px;color:#fb923c;font-weight:700;">' + Math.round(doneCnt/rm.word.length*100) + '%</span>';
            var body = document.createElement('div'); body.className = 'task-group-body';
            rm.word.forEach(function(t) { body.appendChild(makeTaskEl(t, 'word')); });
            grp.appendChild(header); grp.appendChild(body);
            box.appendChild(grp);
        }

        // ---- SHARED TASK ELEMENT ----
        function makeTaskEl(task, type) {
            var badgeClass = { daily: 'badge-daily', longterm: 'badge-longterm', word: 'badge-word' }[type];
            var badgeLabel = { daily: 'Theo ngày', longterm: 'Dài hạn', word: 'Từ Word' }[type];
            var div = document.createElement('div');
            div.className = 'task-item' + (task.done ? ' done' : '');
            div.innerHTML = '<input type="checkbox" class="task-checkbox" ' + (task.done ? 'checked' : '') + '>'
                + '<span class="task-title">' + escHtml(task.title) + '</span>'
                + '<span class="task-type-badge ' + badgeClass + '">' + badgeLabel + '</span>'
                + '<button class="task-delete" title="Xóa">✕</button>';
            div.querySelector('.task-checkbox').onchange = function() {
                task.done = this.checked;
                renderRoadmap();
            };
            div.querySelector('.task-delete').onclick = function() {
                var rm = getRoadmap(); if (!rm) return;
                rm[type] = rm[type].filter(t => t.id !== task.id);
                renderRoadmap();
            };
            return div;
        }

        function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        // formatDate(): đã chuyển sang js/core/utils.js (STEP 7B), expose qua window.

        // ---- XUẤT BÁO CÁO PHỤ HUYNH ----
        function exportReportForParent() {
            var student = classList.find(c => c.id === activeRoadmapId);
            if (!student) return;
            var rm = student.roadmap || { daily: [], longterm: [], word: [] };
            var all = rm.daily.concat(rm.longterm).concat(rm.word);
            var done = all.filter(t=>t.done).length;
            var total = all.length;
            var pct = total === 0 ? 0 : Math.round(done/total*100);
            var now = new Date();
            var dateStr = now.toLocaleDateString('vi-VN');

            // Tính tổng buổi học
            var totalSessions = 0;
            if (student.attendance) {
                Object.values(student.attendance).forEach(function(arr) { totalSessions += arr.length; });
            }

            function taskSection(title, tasks, color) {
                if (tasks.length === 0) return '';
                var rows = tasks.map(function(t) {
                    return '<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">'
                        + (t.done ? '✅' : '⬜') + ' ' + escHtml(t.title)
                        + (t.date ? ' <span style="color:#999;font-size:11px;">(' + formatDate(t.date) + ')</span>' : '')
                        + '</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:12px;color:' + (t.done ? '#10b981':'#ef4444') + ';font-weight:700;">'
                        + (t.done ? 'Hoàn thành' : 'Chưa xong') + '</td></tr>';
                }).join('');
                var doneCnt = tasks.filter(t=>t.done).length;
                return '<div style="margin-bottom:24px;">'
                    + '<div style="background:' + color + ';color:white;padding:8px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px;">'
                    + title + ' — ' + doneCnt + '/' + tasks.length + ' hoàn thành</div>'
                    + '<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;">'
                    + '<thead><tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;">NỘI DUNG</th>'
                    + '<th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;">TRẠNG THÁI</th></tr></thead>'
                    + '<tbody>' + rows + '</tbody></table></div>';
            }

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
                + '<title>Báo cáo học tập – ' + student.name + '</title>'
                + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">'
                + '<style>body{font-family:Inter,sans-serif;background:#f8fafc;color:#1a1a2e;margin:0;padding:32px;} .report-wrap{max-width:780px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 32px rgba(0,0,0,0.10);overflow:hidden;} .report-header{background:linear-gradient(135deg,#0a2a22,#134e38);padding:36px 40px;} .report-header h1{margin:0 0 4px;font-size:26px;color:#fff;font-weight:800;} .report-header p{margin:0;font-size:14px;color:rgba(255,255,255,0.65);} .report-body{padding:32px 40px;} .meta-row{display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap;} .meta-card{flex:1;min-width:140px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;} .meta-card .lbl{font-size:10px;font-weight:700;letter-spacing:0.6px;color:#9ca3af;text-transform:uppercase;margin-bottom:6px;} .meta-card .val{font-size:20px;font-weight:800;} .prog-wrap{margin-bottom:28px;} .prog-bar-bg{background:#f0f0f0;height:14px;border-radius:7px;overflow:hidden;margin-top:8px;} .prog-bar-fill{height:100%;background:linear-gradient(90deg,#00cca3,#00896e);border-radius:7px;} .footer{background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 40px;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between;}</style>'
                + '</head><body><div class="report-wrap">'
                + '<div class="report-header"><h1>📋 Báo cáo học tập</h1><p>Được xuất ngày ' + dateStr + ' · GiaSu Manager Pro</p></div>'
                + '<div class="report-body">'
                + '<div class="meta-row">'
                + '<div class="meta-card"><div class="lbl">Học sinh</div><div class="val" style="font-size:16px;color:#1a1a2e;">' + student.name + '</div></div>'
                + '<div class="meta-card"><div class="lbl">Môn học</div><div class="val" style="font-size:16px;color:#0284c7;">' + student.subject + '</div></div>'
                + '<div class="meta-card"><div class="lbl">Lịch học</div><div class="val" style="font-size:14px;color:#7c3aed;">' + (student.days ? student.days.join(', ') : student.day) + '</div></div>'
                + '<div class="meta-card"><div class="lbl">Tổng buổi học</div><div class="val" style="color:#10b981;">' + totalSessions + ' buổi</div></div>'
                + '</div>'
                + '<div class="prog-wrap"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:14px;font-weight:700;">📊 Tiến độ tổng thể</span><span style="font-size:20px;font-weight:800;color:#00cca3;">' + pct + '%</span></div>'
                + '<div class="prog-bar-bg"><div class="prog-bar-fill" style="width:' + pct + '%;"></div></div>'
                + '<div style="font-size:12px;color:#9ca3af;margin-top:6px;">Đã hoàn thành ' + done + '/' + total + ' bài học</div></div>'
                + taskSection('📅 Bài học theo ngày', rm.daily, '#0284c7')
                + taskSection('🎯 Mục tiêu dài hạn', rm.longterm, '#7c3aed')
                + taskSection('📄 Bài học từ tài liệu Word', rm.word, '#ea580c')
                + '</div>'
                + '<div class="footer"><span>GiaSu Manager Pro · Báo cáo tự động</span><span>' + dateStr + '</span></div>'
                + '</div></bo' + 'dy></ht' + 'ml>';

            var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'BaoCao_' + student.name.replace(/\s+/g, '_') + '_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + '.html';
            a.click();
        }

        // Đóng roadmap khi logout
        var _origDoLogout = doLogout;
        doLogout = function() {
            document.getElementById('roadmap-view').style.display = 'none';
            _origDoLogout();
        };

        // ===================================================
        // NHẮC LỊCH QUA TELEGRAM
        // ===================================================
        var reminderInterval = null;

        function getTgConfig() {
            return JSON.parse(localStorage.getItem('gsm_tg_' + currentUser) || '{"botToken":"","chatId":"","minutesBefore":60,"enabled":false}');
        }
        function saveTgConfig(cfg) {
            localStorage.setItem('gsm_tg_' + currentUser, JSON.stringify(cfg));
        }

        function openReminderSettings() {
            var cfg = getTgConfig();
            document.getElementById('tg-bot-token').value = cfg.botToken || '';
            document.getElementById('tg-chat-id').value = cfg.chatId || '';
            document.getElementById('tg-minutes-before').value = cfg.minutesBefore || 60;
            document.getElementById('tg-enable').checked = cfg.enabled || false;
            updateTgStatusUI(cfg);
            document.getElementById('reminder-modal').classList.add('open');
        }
        function closeReminderSettings() {
            document.getElementById('reminder-modal').classList.remove('open');
        }

        function updateTgStatusUI(cfg) {
            var dot = document.getElementById('tg-conn-dot');
            var txt = document.getElementById('tg-conn-text');
            var bellDot = document.getElementById('bell-dot');
            if (cfg.botToken && cfg.chatId && cfg.enabled) {
                dot.className = 'tg-status-dot connected';
                txt.innerText = 'Đã kết nối — nhắc trước ' + cfg.minutesBefore + ' phút';
                txt.style.color = '#00cca3';
                bellDot.style.display = 'block';
            } else {
                dot.className = 'tg-status-dot disconnected';
                txt.innerText = cfg.botToken ? 'Đã nhập token nhưng chưa bật' : 'Chưa kết nối';
                txt.style.color = 'var(--text-sub)';
                bellDot.style.display = 'none';
            }
        }

        function saveTgSettings() {
            var token = document.getElementById('tg-bot-token').value.trim();
            var chatId = document.getElementById('tg-chat-id').value.trim();
            var mins = parseInt(document.getElementById('tg-minutes-before').value) || 60;
            var enabled = document.getElementById('tg-enable').checked;
            if (enabled && (!token || !chatId)) {
                showToast('⚠️', 'Thiếu thông tin', 'Hãy nhập Bot Token và Chat ID trước khi bật.');
                return;
            }
            var cfg = { botToken: token, chatId: chatId, minutesBefore: mins, enabled: enabled };
            saveTgConfig(cfg);
            updateTgStatusUI(cfg);
            restartReminderLoop();
            closeReminderSettings();
            showToast('✅', 'Đã lưu cài đặt', enabled ? 'Nhắc lịch qua Telegram đã bật.' : 'Nhắc lịch đã tắt.');
        }

        async function testTgConnection() {
            var token = document.getElementById('tg-bot-token').value.trim();
            var chatId = document.getElementById('tg-chat-id').value.trim();
            if (!token || !chatId) { showToast('⚠️', 'Thiếu thông tin', 'Hãy điền Bot Token và Chat ID.'); return; }
            var btn = document.getElementById('tg-test-btn');
            btn.innerText = '⏳ Đang gửi...'; btn.disabled = true;
            try {
                var text = '✅ *GiaSu Manager Pro*\nKết nối thành công! Hệ thống nhắc lịch đã sẵn sàng 🎉';
                var res = await sendTgMessage(token, chatId, text);
                if (res.ok) {
                    showToast('🎉', 'Kết nối thành công!', 'Kiểm tra Telegram của bạn.');
                } else {
                    showToast('❌', 'Gửi thất bại', res.description || 'Kiểm tra lại token/chatId.');
                }
            } catch(e) {
                showToast('❌', 'Lỗi kết nối', 'Không gửi được. Kiểm tra mạng.');
            }
            btn.innerText = '📨 Gửi tin nhắn thử'; btn.disabled = false;
        }

        async function sendTgMessage(token, chatId, text) {
            var res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
            });
            return await res.json();
        }

        function restartReminderLoop() {
            if (reminderInterval) clearInterval(reminderInterval);
            var cfg = getTgConfig();
            if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
            reminderInterval = setInterval(function() { checkAndSendReminders(); }, 60000);
            checkAndSendReminders();
        }

        function checkAndSendReminders() {
            var cfg = getTgConfig();
            if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
            var now = new Date();
            var dayNames = ['Chủ Nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
            var todayName = dayNames[now.getDay()];
            var nowMins = now.getHours() * 60 + now.getMinutes();

            classList.forEach(function(st) {
                var days = st.days || [st.day];
                if (!days.includes(todayName)) return;
                var parts = st.startTime.split(':');
                var startMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                var diff = startMins - nowMins;
                if (diff === cfg.minutesBefore) {
                    var sentKey = 'gsm_reminded_' + st.id + '_' + now.toDateString();
                    if (localStorage.getItem(sentKey)) return;
                    localStorage.setItem(sentKey, '1');
                    var msg = '🔔 *Nhắc lịch dạy*\n\n'
                        + '📚 Môn: *' + st.subject + '*\n'
                        + '👤 Học sinh: *' + st.name + '*\n'
                        + '🕐 Giờ học: *' + st.startTime + '* (' + st.duration + ' tiếng)\n'
                        + '📅 Hôm nay: *' + todayName + '*\n\n'
                        + '_Còn ' + cfg.minutesBefore + ' phút nữa là đến giờ!_ ⏰';
                    sendTgMessage(cfg.botToken, cfg.chatId, msg);
                }
            });
        }

        // ===================================================
        // XUẤT HÓA ĐƠN ĐIỆN TỬ ĐẸP
        // ===================================================
        function exportInvoice() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;

            var mk = currentSelectedMonth;
            var sessions = (student.attendance && student.attendance[mk]) ? student.attendance[mk] : [];
            var totalSessions = sessions.length;
            var totalMoney = computeBillingStats(
                Array.from({ length: totalSessions }, function() { return { status: 'completed', duration: 0 }; }),
                [], (Number(student.rate) || 0) * 1000
            ).expected;
            var paid = getClassCardFeeStatus(student, mk, totalMoney) === 'paid';

            // Tính tổng buổi trong tháng (lịch cố định)
            var parts = mk.split('-');
            var y = parseInt(parts[0]), m = parseInt(parts[1]) - 1;
            var days = student.days || [student.day];
            var dayNums = days.map(function(d) {
                return { 'Thứ 2':1,'Thứ 3':2,'Thứ 4':3,'Thứ 5':4,'Thứ 6':5,'Thứ 7':6,'Chủ Nhật':0 }[d];
            });
            var daysInMonth = new Date(y, m+1, 0).getDate();
            var scheduledSessions = 0;
            for (var d = 1; d <= daysInMonth; d++) {
                if (dayNums.includes(new Date(y, m, d).getDay())) scheduledSessions++;
            }
            var absentSessions = scheduledSessions - totalSessions;

            var viMonths = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
            var monthLabel = viMonths[m+1] + ' ' + y;
            var now = new Date();
            var invoiceNum = 'INV-' + y + String(m+1).padStart(2,'0') + '-' + String(student.id).slice(-4);

            var sessionRows = sessions.map(function(dateStr, i) {
                return '<tr><td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#374151;">' + (i+1) + '</td>'
                    + '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#111827;">' + dateStr + ' (' + monthLabel + ')</td>'
                    + '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#059669;">' + (student.rate * 1000).toLocaleString('vi-VN') + ' đ</td></tr>';
            }).join('');

            var html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Hóa đơn ${monthLabel} – ${student.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Inter,sans-serif;background:#f8fafc;color:#1a1a2e;padding:32px;}
  .page{max-width:720px;margin:0 auto;}
  .inv-header{background:linear-gradient(135deg,#064e3b,#065f46);border-radius:16px 16px 0 0;padding:36px 40px;display:flex;justify-content:space-between;align-items:flex-start;}
  .inv-logo{font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:6px;}
  .inv-logo strong{display:block;font-size:22px;color:#fff;font-weight:800;letter-spacing:-0.5px;}
  .inv-num{text-align:right;}
  .inv-num span{font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.8px;}
  .inv-num strong{display:block;font-size:20px;color:#fff;font-weight:700;margin-top:2px;}
  .inv-body{background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:36px 40px;}
  .inv-meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #f3f4f6;}
  .meta-block .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:6px;}
  .meta-block .val{font-size:15px;font-weight:700;color:#111827;}
  .meta-block .sub{font-size:12px;color:#6b7280;margin-top:2px;}
  .summary-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;}
  .sum-card{background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;padding:14px 16px;}
  .sum-card .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;margin-bottom:8px;}
  .sum-card .val{font-size:22px;font-weight:800;}
  table{width:100%;border-collapse:collapse;}
  th{padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border-bottom:1px solid #f3f4f6;}
  .total-row{padding:14px 40px;background:#f0fdf4;border-top:2px solid #10b981;display:flex;justify-content:space-between;align-items:center;}
  .status-badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;}
  .badge-g{background:#d1fae5;color:#065f46;}
  .badge-r{background:#fee2e2;color:#991b1b;}
  .footer{margin-top:24px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.8;}
  @media print{body{padding:0;background:#fff;}.page{max-width:100%;}}
</style></head><body>
<div class="page">
  <div class="inv-header">
    <div class="inv-logo"><span>Gia sư</span><strong>GiaSu Manager Pro</strong></div>
    <div class="inv-num"><span>Số hóa đơn</span><strong>${invoiceNum}</strong></div>
  </div>
  <div class="inv-body">
    <div class="inv-meta">
      <div class="meta-block"><div class="lbl">Học sinh</div><div class="val">${student.name}</div><div class="sub">${student.subject}</div></div>
      <div class="meta-block"><div class="lbl">Kỳ thanh toán</div><div class="val">${monthLabel}</div><div class="sub">Ngày xuất: ${now.toLocaleDateString('vi-VN')}</div></div>
      <div class="meta-block"><div class="lbl">Lịch học cố định</div><div class="val" style="font-size:13px;">${days.join(', ')}</div><div class="sub">Bắt đầu ${student.startTime} · ${student.duration} giờ/buổi</div></div>
      <div class="meta-block"><div class="lbl">Học phí mỗi buổi</div><div class="val" style="color:#059669;">${(student.rate*1000).toLocaleString('vi-VN')} đ</div></div>
    </div>
    <div class="summary-row">
      <div class="sum-card"><div class="lbl">Buổi theo lịch</div><div class="val" style="color:#0284c7;">${scheduledSessions}</div></div>
      <div class="sum-card"><div class="lbl">Đã dạy</div><div class="val" style="color:#059669;">${totalSessions}</div></div>
      <div class="sum-card"><div class="lbl">Vắng / Nghỉ</div><div class="val" style="color:${absentSessions>0?'#dc2626':'#9ca3af'};">${absentSessions}</div></div>
      <div class="sum-card"><div class="lbl">Trạng thái</div><div class="val" style="font-size:14px;margin-top:4px;"><span class="status-badge ${paid?'badge-g':'badge-r'}">${paid?'✓ Đã thu':'✗ Chưa thu'}</span></div></div>
    </div>
    <table>
      <thead><tr><th style="width:40px;">#</th><th>Ngày dạy</th><th style="text-align:right;">Số tiền</th></tr></thead>
      <tbody>${sessionRows || '<tr><td colspan="3" style="padding:20px;text-align:center;color:#9ca3af;">Chưa có buổi nào được chấm công trong tháng này</td></tr>'}</tbody>
    </table>
    <div class="total-row">
      <span style="font-size:14px;font-weight:700;color:#065f46;">TỔNG CỘNG ${monthLabel.toUpperCase()}</span>
      <span style="font-size:26px;font-weight:800;color:#059669;">${totalMoney.toLocaleString('vi-VN')} đ</span>
    </div>
  </div>
  <div class="footer">
    Hóa đơn được tạo tự động bởi GiaSu Manager Pro · ${now.toLocaleString('vi-VN')}<br>
    Vui lòng liên hệ gia sư nếu có thắc mắc.
  </div>
</div>
</bo${''}dy></ht${''}ml>`;

            var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'HoaDon_' + student.name.replace(/\s+/g,'_') + '_' + mk + '.html';
            a.click();
            showToast('🧾', 'Xuất hóa đơn thành công', 'File HTML đã tải về máy. Mở bằng trình duyệt để xem/gửi.');
        }

        // ===================================================
        // TOAST NOTIFICATION
        // ===================================================
        // showToast(): đã chuyển sang js/core/toast.js (STEP 7B), expose qua window.

        // ===== PROFILE DROPDOWN =====
        var psCurrentTab = 'qr';
        document.addEventListener('click', function(e) {
            var btn = document.getElementById('nav-user-btn');
            var dd = document.getElementById('profile-dropdown');
            if (btn && dd && !btn.contains(e.target)) dd.style.display = 'none';
        });
        function toggleProfileMenu(e) {
            if (e) e.stopPropagation();
            var dd = document.getElementById('profile-dropdown');
            var users = getUsers(); var info = users[currentUser] || {};
            document.getElementById('pd-name').innerText = info.displayName || currentUser;
            document.getElementById('pd-username').innerText = '@' + currentUser;
            dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        }
        // AVATAR_COLORS: chỉ còn 1 màu nền mặc định cho avatar chữ-cái-đầu khi Tutor CHƯA có ảnh.
        // Trước đây đây là bảng 6 màu để người dùng chọn qua avatar-picker modal — modal đó đã bị
        // BỎ HOÀN TOÀN (xem BUG "UX đổi avatar"), nên chỉ giữ lại phần tử [0] làm fallback vì nhiều
        // nơi khác (renderSettingsPage, updateNavAvatar...) vẫn đọc AVATAR_COLORS[0].
        var AVATAR_COLORS = ['linear-gradient(135deg,#00cca3,#00896e)'];
        function openProfileSettings(tab) {
            document.getElementById('profile-dropdown').style.display = 'none';
            // AUTH 2.0 Phase 3: không còn phiên local-only nào tồn tại — mọi yêu cầu đổi mật khẩu đều
            // phải qua modal Supabase riêng (settingsOpenChangePassword()), không còn logic local nào
            // để dự phòng nữa.
            if (tab === 'password') {
                settingsOpenChangePassword();
                return;
            }
            // 'avatar' không còn mở modal nữa — mọi nơi gọi Đổi Avatar giờ gọi thẳng
            // triggerAvatarFilePicker() (xem khối AVATAR UPLOAD TRỰC TIẾP bên dưới). Giữ nhánh này chỉ
            // để không crash nếu còn chỗ nào lỡ gọi openProfileSettings('avatar').
            if (tab === 'avatar') {
                triggerAvatarFilePicker();
                return;
            }
            var users = getUsers(); var info = users[currentUser] || {};
            var qrInfo = (info.qrInfo)||{};
            if (qrInfo.bank) document.getElementById('qr-bank').value = qrInfo.bank;
            if (qrInfo.account) document.getElementById('qr-account').value = qrInfo.account;
            if (qrInfo.name) document.getElementById('qr-name').value = qrInfo.name;
            document.getElementById('qr-preview-area').style.display = 'none';
            document.getElementById('profile-settings-modal').classList.add('open');
            switchPsTab('qr');
        }
        function closeProfileSettings() { document.getElementById('profile-settings-modal').classList.remove('open'); }
        function switchPsTab(tab) {
            // Chỉ còn đúng 1 tab nội dung (QR) — tab "Mật khẩu" trong thanh tab là redirect trực tiếp
            // (onclick="settingsOpenChangePassword()"), không đi qua switchPsTab.
            psCurrentTab = 'qr';
            document.getElementById('pst-qr').classList.add('active');
            document.getElementById('ps-panel-qr').style.display = 'flex';
            document.getElementById('ps-panel-qr').style.flexDirection = 'column';
        }

        async function saveProfileSettings() {
            var users = getUsers(); var info = users[currentUser]||{};
            if (psCurrentTab==='qr') {
                var bank=document.getElementById('qr-bank').value; var account=document.getElementById('qr-account').value.trim(); var name=document.getElementById('qr-name').value.trim();
                if (!account||!name) { showToast('⚠️','Thiếu thông tin','Nhập số tài khoản và tên.'); return; }
                info.qrInfo={bank,account,name}; users[currentUser]=info; saveUsers(users);
                showToast('📱','Đã lưu QR','Mã QR sẽ xuất hiện trong hóa đơn.'); closeProfileSettings();
            }
        }
        function previewQR() {
            var bank=document.getElementById('qr-bank').value; var account=document.getElementById('qr-account').value.trim(); var name=document.getElementById('qr-name').value.trim();
            if (!account||!name) { showToast('⚠️','Thiếu thông tin','Nhập tài khoản và tên trước.'); return; }
            var bankNames={'970415':'VietinBank','970436':'Vietcombank','970418':'BIDV','970422':'MB Bank','970426':'TPBank','970432':'VPBank','970407':'Techcombank','970416':'ACB','970405':'Agribank','970423':'Sacombank','970403':'SHB','970448':'OCB'};
            var qrUrl='https://img.vietqr.io/image/'+bank+'-'+account+'-compact2.png?accountName='+encodeURIComponent(name);
            document.getElementById('qr-img').src=qrUrl;
            document.getElementById('qr-acc-label').innerText=account;
            document.getElementById('qr-bank-label').innerText=(bankNames[bank]||'')+' — '+name;
            document.getElementById('qr-preview-area').style.display='block';
        }
        // Giữ khả năng hiển thị avatarEmoji/avatarColor NẾU tài khoản đã có sẵn dữ liệu này từ trước
        // (tương thích ngược, không xóa dữ liệu cũ của người dùng) — nhưng KHÔNG còn UI nào để CHỌN
        // emoji/màu nữa. Hàm này được override thêm ở khối AVATAR UPLOAD TRỰC TIẾP để hỗ trợ avatarImage.
        function updateNavAvatar(info) {
            var navAv=document.getElementById('nav-avatar-text');
            if (!navAv) return;
            if (info.avatarEmoji) { navAv.innerText=info.avatarEmoji; navAv.style.background='#1a2a3a'; navAv.style.fontSize='16px'; }
            else { navAv.innerText=(info.displayName||currentUser).charAt(0).toUpperCase(); navAv.style.background=info.avatarColor||AVATAR_COLORS[0]; navAv.style.fontSize='12px'; }
        }

        // ===== MONTHLY EVALUATION =====
        function saveMonthEval() {
            var student=classList.find(c=>c.id===activeProfileClassId); if (!student) return;
            if (!student.monthEvals) student.monthEvals={};
            student.monthEvals[currentSelectedMonth]=document.getElementById('month-eval-text').value;
            saveData();
        }
        function loadMonthEval() {
            var student=classList.find(c=>c.id===activeProfileClassId);
            var evalBox=document.getElementById('month-eval-text'); if (!evalBox) return;
            evalBox.value=(student&&student.monthEvals&&student.monthEvals[currentSelectedMonth])||'';
        }

        // ===== BROWSER PUSH NOTIFICATIONS =====
        var notifInterval = null;
        function requestBrowserNotification() {
            if (!('Notification' in window)) { showToast('⚠️','Không hỗ trợ','Trình duyệt này không hỗ trợ thông báo.'); return; }
            if (Notification.permission==='granted') { toggleBrowserNotif(); }
            else if (Notification.permission!=='denied') {
                Notification.requestPermission().then(function(perm) {
                    if (perm==='granted') toggleBrowserNotif();
                    else showToast('⚠️','Bị từ chối','Cho phép thông báo trong cài đặt trình duyệt.');
                });
            } else showToast('🚫','Bị chặn','Vào Settings > Site Permissions để bật lại.');
        }
        function toggleBrowserNotif() {
            var cfg=JSON.parse(localStorage.getItem('gsm_notif_'+currentUser)||'{"enabled":false,"minutesBefore":60}');
            cfg.enabled=!cfg.enabled;
            localStorage.setItem('gsm_notif_'+currentUser, JSON.stringify(cfg));
            document.getElementById('bell-dot').style.display=cfg.enabled?'block':'none';
            showToast(cfg.enabled?'🔔':'🔕', cfg.enabled?'Thông báo đã bật':'Thông báo đã tắt', cfg.enabled?'Nhận thông báo trên máy tính trước 60, 30, 15 phút khi đến giờ dạy.':'');
            if (cfg.enabled) startBrowserNotifLoop(); else stopBrowserNotifLoop();
        }
        function startBrowserNotifLoop() {
            stopBrowserNotifLoop(); checkBrowserNotif(); notifInterval=setInterval(checkBrowserNotif, 60000);
        }
        function stopBrowserNotifLoop() { if (notifInterval) { clearInterval(notifInterval); notifInterval=null; } }
        function checkBrowserNotif() {
            var cfg=JSON.parse(localStorage.getItem('gsm_notif_'+currentUser)||'{"enabled":false}');
            if (!cfg.enabled||Notification.permission!=='granted') return;
            var now=new Date();
            var dayNames=['Chủ Nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
            var todayName=dayNames[now.getDay()]; var nowMins=now.getHours()*60+now.getMinutes();
            classList.forEach(function(st) {
                var days=st.days||[st.day]; if (!days.includes(todayName)) return;
                var parts=st.startTime.split(':'); var startMins=parseInt(parts[0])*60+parseInt(parts[1]);
                var diff=startMins-nowMins;
                if (diff===60||diff===30||diff===15) {
                    var sentKey='gsm_notif_sent_'+st.id+'_'+now.toDateString()+'_'+diff;
                    if (localStorage.getItem(sentKey)) return;
                    localStorage.setItem(sentKey,'1');
                    new Notification('🔔 Còn '+diff+' phút — Giờ dạy sắp bắt đầu!', {
                        body: '📚 '+st.subject+'\n👤 '+st.name+'\n⏰ '+st.startTime+' ('+todayName+')',
                        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>',
                        tag: 'giasu-'+st.id+'-'+diff, requireInteraction: diff===15
                    });
                }
            });
        }
        // STEP 8A DEAD CODE CLEANUP: đã xoá initBrowserNotif() (0 call-site — không được gọi từ
        // DOMContentLoaded/doLogin hay bất kỳ đâu; trạng thái "bell-dot" hiện chỉ được cập nhật khi
        // người dùng chủ động bấm nút qua requestBrowserNotification()/toggleBrowserNotif()).

        // ===== BACKUP & SYNC =====
        function syncToCloud() {
            document.getElementById('profile-dropdown').style.display='none';
            var lastSync=localStorage.getItem('gsm_last_sync_'+currentUser);
            document.getElementById('sync-last-time').innerText=lastSync?'Lần cuối: '+lastSync:'Chưa từng sao lưu';
            document.getElementById('sync-dot').className='sync-dot '+(lastSync?'synced':'unsynced');
            document.getElementById('sync-status-text').innerText=lastSync?'Đã sao lưu':'Chưa đồng bộ';
            document.getElementById('sync-modal').classList.add('open');
        }
        function closeSyncModal() { document.getElementById('sync-modal').classList.remove('open'); }
        function exportBackup() {
            var users=getUsers();
            var payload={ version:2, exportedAt:new Date().toISOString(), user:currentUser, userInfo:users[currentUser]||{}, data:getUserData(currentUser) };
            var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
            var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
            a.download='GiaSuBackup_'+currentUser+'_'+new Date().toISOString().slice(0,10)+'.json'; a.click();
            var now=new Date().toLocaleString('vi-VN');
            localStorage.setItem('gsm_last_sync_'+currentUser, now);
            document.getElementById('sync-dot').className='sync-dot synced';
            document.getElementById('sync-status-text').innerText='Đã sao lưu';
            document.getElementById('sync-last-time').innerText='Lần cuối: '+now;
            showToast('📥','Xuất backup thành công','Giữ file an toàn để dùng khi đổi thiết bị.');
        }
        function importBackup(input) {
            var file=input.files[0]; if (!file) return;
            var reader=new FileReader();
            reader.onload=function(e) {
                try {
                    var payload=JSON.parse(e.target.result);
                    if (!payload.version||!payload.data) { showToast('❌','File không hợp lệ','Chọn file backup đúng định dạng.'); return; }
                    if (!confirm('Nhập backup này sẽ THAY THẾ toàn bộ dữ liệu của tài khoản "'+currentUser+'". Tiếp tục?')) return;
                    saveUserData(currentUser, payload.data);
                    classList=payload.data.classList||[]; freeSchedule=payload.data.freeSchedule||{};
                    var users=getUsers(); var cur=users[currentUser]||{};
                    if (payload.userInfo) {
                        ['avatarEmoji','avatarColor','qrInfo','displayName'].forEach(function(k) { if (payload.userInfo[k]) cur[k]=payload.userInfo[k]; });
                        users[currentUser]=cur; saveUsers(users); updateNavAvatar(cur);
                    }
                    localStorage.setItem('gsm_last_sync_'+currentUser, new Date().toLocaleString('vi-VN'));
                    closeSyncModal(); toggleDay(getDefaultDayView()); updateTimeSelectOptions(); renderClassList(); applyCompactModeFromSettings();
                    showToast('📤','Khôi phục thành công','Dữ liệu đã được nhập từ file backup!');
                } catch(ex) { showToast('❌','Lỗi file','File bị lỗi hoặc không đúng định dạng.'); }
            };
            reader.readAsText(file); input.value='';
        }

        // ================================================================================
        // ===== KHÔI PHỤC PHIÊN SUPABASE SAU KHI F5 / TẢI LẠI TRANG =====
        // supabase-js mặc định TỰ LƯU JWT vào localStorage của riêng nó (persistSession: true) và
        // tự refresh token — nghĩa là sau F5, phiên đăng nhập Supabase VẪN CÒN HẠN. Nhưng trước khi
        // sửa, KHÔNG có hàm nào ở đây gọi supabaseClient.auth.getSession() để dựng lại state của app
        // (currentUser, classList, currentTutor, isSupabaseTutorSession, ...) từ phiên đó — toàn bộ
        // state này chỉ tồn tại trong biến JavaScript nên bị xóa trắng mỗi khi trang tải lại. Đây
        // chính là NGUYÊN NHÂN CHÍNH của lỗi "đúng trước refresh, sai sau refresh": mọi thay đổi đã
        // ghi đúng vào Supabase, nhưng sau F5 app không hề đọc lại phiên/dữ liệu đó.
        // Trả về true nếu đã khôi phục xong 1 phiên Supabase hợp lệ (Admin hoặc Tutor); false nếu
        // không có phiên Supabase nào (AUTH 2.0 Phase 3: khi đó KHÔNG còn luồng dự phòng cục bộ nào
        // nữa — app sẽ hiển thị màn hình Login).
        // ================================================================================
        async function restoreSupabaseSessionIfAny() {
            try {
                const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
                console.log('[LOAD SUPABASE] getSession() khi tải lại trang:', sessionData, sessionErr);
                if (sessionErr || !sessionData || !sessionData.session || !sessionData.session.user) {
                    return false; // Không có JWT Supabase còn hạn -> không có gì để khôi phục
                }
                const authUser = sessionData.session.user;
                const authUserId = authUser.id;

                const { data: profile, error: profileError } = await supabaseClient
                    .from('profiles').select('*').eq('id', authUserId).maybeSingle();
                console.log('[LOAD SUPABASE] profile khi khôi phục phiên:', profile, profileError);
                if (profileError || !profile) return false;

                if (profile.role === 'admin') {
                    enterAdminSessionUI(authUserId, profile);
                    return true;
                }

                const { data: tutor, error: tutorError } = await supabaseClient
                    .from('tutors').select('*').eq('user_id', authUserId).maybeSingle();
                console.log('[LOAD SUPABASE] tutor khi khôi phục phiên:', tutor, tutorError);
                if (tutorError || !tutor) return false;

                var enterResult = await enterTutorSessionUI(authUserId, tutor, authUser.email);
                if (enterResult.error) {
                    console.error('[LOAD SUPABASE] Khôi phục phiên Tutor thất bại khi tải classList:', enterResult.error);
                    return false;
                }
                return true;
            } catch (err) {
                console.error('[LOAD SUPABASE] restoreSupabaseSessionIfAny exception:', err);
                return false;
            }
        }

        // ===== SESSION PERSISTENCE: chỉ khôi phục phiên Supabase thật khi reload =====
        // AUTH 2.0 Phase 3: đã BỎ HOÀN TOÀN fallback "gsm_session" cục bộ (không có kiểm tra mật khẩu
        // nào ở đó — chỉ cần key tồn tại trong localStorage là được coi là đã đăng nhập, đây chính là
        // lỗ hổng "local authentication" mà audit yêu cầu loại bỏ). Từ giờ: có phiên Supabase hợp lệ ->
        // khôi phục; không có -> ở nguyên màn hình Login, không có đường nào khác để vào app.
        window.addEventListener('DOMContentLoaded', async function() {
            var restored = await restoreSupabaseSessionIfAny();
            if (restored) return;
            console.log('[LOAD] Không có phiên Supabase hợp lệ — hiển thị màn hình Login.');
            // Dọn rác gsm_session cũ nếu còn sót lại từ trước — không dùng nó để quyết định bất cứ điều gì.
            localStorage.removeItem('gsm_session');
        });

        // ===== AVATAR UPLOAD TRỰC TIẾP (thay thế hoàn toàn avatar-picker modal cũ) =====
        // UX: click avatar (Navbar / Profile Settings) -> mở <input type="file"> của hệ điều hành ->
        // chọn ảnh -> validate -> lưu NGAY -> avatar cập nhật ngay. Không còn modal, không còn nút
        // "Lưu" riêng cho avatar, không còn emoji/color picker.
        //
        // STORAGE: đã kiểm tra lại trực tiếp schema Supabase (public.profiles, public.tutors) VÀ
        // storage.buckets ngay trước khi viết đoạn này — KHÔNG có cột avatar/avatar_url/avatar_image
        // nào và KHÔNG có bucket Storage nào tồn tại. Theo đúng yêu cầu, KHÔNG tự ý ALTER DATABASE/tạo
        // bucket. Vì vậy avatar VẪN lưu qua getUsers()/saveUsers() (localStorage) — nguồn lưu trữ
        // avatar DUY NHẤT hiện có, không tạo hệ thống lưu trữ thứ hai. Toàn bộ phần "lưu" được tách
        // riêng vào avatarSaveImage() để sau này nối sang Supabase (cột mới hoặc Storage) chỉ cần sửa
        // đúng 1 hàm này, không đụng phần validate/UI.
        var AVATAR_MAX_BYTES = 2 * 1024 * 1024; // giữ đúng giới hạn 2MB đã dùng trước đây cho avatar
        var avatarUploadInFlight = false;

        function triggerAvatarFilePicker(e) {
            if (e && e.stopPropagation) e.stopPropagation(); // tránh bấm avatar trong Navbar lại kích hoạt luôn dropdown profile (nav-user)
            if (avatarUploadInFlight) return;
            document.getElementById('avatar-file-input').click();
        }

        function avatarSetUploadingUI(isUploading) {
            ['nav-avatar-text','settings-avatar-preview'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.classList.toggle('avatar-uploading', !!isUploading);
            });
        }

        function handleAvatarFileSelected(input) {
            var file = input.files[0];
            input.value = ''; // reset ngay để lần sau chọn lại đúng file cũ vẫn kích hoạt onchange
            if (!file) return; // User bấm Cancel trên file picker -> không đổi gì (đúng yêu cầu)

            if (!file.type || file.type.indexOf('image/') !== 0) {
                showToast('⚠️','Định dạng không hợp lệ','Vui lòng chọn một file ảnh (PNG, JPG, WEBP...).');
                return; // giữ avatar cũ
            }
            if (file.size > AVATAR_MAX_BYTES) {
                showToast('⚠️','Ảnh quá lớn','Vui lòng chọn ảnh nhỏ hơn 2MB.');
                return; // giữ avatar cũ
            }

            avatarUploadInFlight = true;
            avatarSetUploadingUI(true);

            var reader = new FileReader();
            reader.onerror = function() {
                avatarUploadInFlight = false;
                avatarSetUploadingUI(false);
                showToast('⚠️','Tải ảnh thất bại','Không đọc được file ảnh, vui lòng thử lại.');
            };
            reader.onload = function(e) {
                avatarSaveImage(e.target.result); // base64 data URL — preview = chính ảnh đã chọn, không cần bước preview riêng
            };
            reader.readAsDataURL(file);
        }

        // Lưu avatar mới + cập nhật mọi nơi hiển thị avatar. Nếu lưu lỗi -> avatar cũ được giữ nguyên
        // (không ghi localStorage, không cập nhật UI) + báo lỗi rõ ràng.
        function avatarSaveImage(base64DataUrl) {
            try {
                var users = getUsers();
                var info = users[currentUser] || {};
                info.avatarImage = base64DataUrl;
                info.avatarEmoji = null; info.avatarColor = null; // ảnh mới thay thế avatar cũ (kể cả emoji/màu tương thích ngược)
                users[currentUser] = info;
                saveUsers(users);
                updateNavAvatar(info);
                avatarUpdateSettingsPreview(info);
                showToast('✅','Đã cập nhật avatar','Ảnh đại diện mới đã được lưu.');
            } catch (err) {
                console.error('avatarSaveImage lỗi:', err);
                showToast('⚠️','Lưu avatar thất bại','Đã xảy ra lỗi, avatar cũ được giữ nguyên.');
            } finally {
                avatarUploadInFlight = false;
                avatarSetUploadingUI(false);
            }
        }

        // Cập nhật avatar preview ở trang "Cài đặt gia sư" (nếu đang mở) — Navbar được cập nhật riêng
        // qua updateNavAvatar() vì nhiều nơi khác (login, restore session...) cũng gọi hàm đó.
        function avatarUpdateSettingsPreview(info) {
            var avPrev = document.getElementById('settings-avatar-preview');
            if (!avPrev) return;
            if (info.avatarImage) {
                avPrev.innerHTML = '<img src="'+info.avatarImage+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
            } else if (info.avatarEmoji) {
                avPrev.innerHTML = ''; avPrev.innerText = info.avatarEmoji; avPrev.style.background = '#1a2a3a';
            } else {
                var displayName = (isSupabaseTutorSession && currentTutor && currentTutor.display_name) || info.displayName || currentUser;
                avPrev.innerHTML = ''; avPrev.innerText = (displayName||'?').charAt(0).toUpperCase();
                avPrev.style.background = info.avatarColor || AVATAR_COLORS[0];
            }
        }

        // ===== QR IMAGE UPLOAD =====
        var selectedQrImage = null; // base64
        var qrCurrentMode = 'upload';

        function switchQrMode(mode) {
            qrCurrentMode = mode;
            var uploadBtn = document.getElementById('qr-mode-upload');
            var genBtn = document.getElementById('qr-mode-generate');
            var uploadPanel = document.getElementById('qr-upload-panel');
            var genPanel = document.getElementById('qr-generate-panel');
            if (mode === 'upload') {
                uploadBtn.style.background = 'var(--accent)'; uploadBtn.style.color = 'white';
                genBtn.style.background = 'var(--bg-card-sub)'; genBtn.style.color = 'var(--text-sub)';
                uploadPanel.style.display = 'block'; genPanel.style.display = 'none';
            } else {
                genBtn.style.background = 'var(--accent)'; genBtn.style.color = 'white';
                uploadBtn.style.background = 'var(--bg-card-sub)'; uploadBtn.style.color = 'var(--text-sub)';
                genPanel.style.display = 'block'; uploadPanel.style.display = 'none';
            }
        }

        function handleQrImageUpload(input) {
            var file = input.files[0]; if (!file) return;
            if (file.size > 2 * 1024 * 1024) { showToast('⚠️','Ảnh quá lớn','Vui lòng chọn ảnh nhỏ hơn 2MB.'); return; }
            var reader = new FileReader();
            reader.onload = function(e) {
                selectedQrImage = e.target.result;
                document.getElementById('qr-uploaded-img').src = selectedQrImage;
                document.getElementById('qr-upload-name').innerText = file.name;
                document.getElementById('qr-upload-preview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }

        function clearQrUpload() {
            selectedQrImage = null;
            document.getElementById('qr-uploaded-img').src = '';
            document.getElementById('qr-upload-preview').style.display = 'none';
            document.getElementById('qr-upload-name').innerText = '';
        }

        // ===== OVERRIDE saveProfileSettings để xử lý QR =====
        // (Nhánh "avatar" cũ đã bị xóa: psCurrentTab không bao giờ được gán 'avatar' nữa — tab avatar
        // trong openProfileSettings() giờ gọi thẳng triggerAvatarFilePicker() và lưu qua avatarSaveImage(),
        // không đi qua saveProfileSettings() nữa. Nhánh cũ đọc các biến selectedAvatarImage/selectedEmoji/
        // selectedColor chưa từng được khai báo ở đâu khác trong file này.)
        var _origSaveProfileSettings = saveProfileSettings;
        saveProfileSettings = async function() {
            if (psCurrentTab === 'qr') {
                var users2 = getUsers(); var info2 = users2[currentUser]||{};
                if (qrCurrentMode === 'upload') {
                    if (!selectedQrImage) { showToast('⚠️','Chưa có ảnh','Hãy tải ảnh QR lên trước.'); return; }
                    info2.qrInfo = { type: 'image', imageData: selectedQrImage };
                } else {
                    var bank = document.getElementById('qr-bank').value;
                    var account = document.getElementById('qr-account').value.trim();
                    var name = document.getElementById('qr-name').value.trim();
                    if (!account || !name) { showToast('⚠️','Thiếu thông tin','Nhập số tài khoản và tên.'); return; }
                    info2.qrInfo = { type: 'vietqr', bank, account, name };
                }
                users2[currentUser] = info2; saveUsers(users2);
                showToast('📱','Đã lưu QR','Mã QR sẽ xuất hiện trong hóa đơn.'); closeProfileSettings();
            } else {
                await _origSaveProfileSettings();
            }
        };

        // ===== OVERRIDE updateNavAvatar để hỗ trợ ảnh =====
        var _origUpdateNavAvatar = updateNavAvatar;
        updateNavAvatar = function(info) {
            var navAv = document.getElementById('nav-avatar-text'); if (!navAv) return;
            if (info && info.avatarImage) {
                navAv.innerHTML = '<img src="'+info.avatarImage+'" style="width:28px;height:28px;object-fit:cover;border-radius:50%;">';
                navAv.style.background = 'transparent'; navAv.style.fontSize = '0';
            } else if (info && info.avatarEmoji) {
                navAv.innerHTML = info.avatarEmoji; navAv.style.background = '#1a2a3a'; navAv.style.fontSize = '16px';
            } else {
                navAv.innerHTML = (info&&info.displayName||currentUser||'?').charAt(0).toUpperCase();
                navAv.style.background = (info&&info.avatarColor)||AVATAR_COLORS[0]; navAv.style.fontSize = '12px';
            }
        };

        // ===== OVERRIDE openProfileSettings để load ảnh sẵn =====
        // (Đã xóa nhánh load "avatar image" cũ ở đây: modal profile-settings-modal không còn phần tử
        // #ps-avatar-preview nào — avatar preview trong modal này đã bị bỏ cùng avatar-picker modal.
        // Avatar preview hiện tại (ở trang Cài đặt) được cập nhật riêng qua avatarUpdateSettingsPreview().)
        var _origOpenPS = openProfileSettings;
        openProfileSettings = function(tab) {
            selectedQrImage = null;
            _origOpenPS(tab);
            // Load QR info hiện tại
            var users = getUsers(); var info = users[currentUser]||{};
            var qrInfo = info.qrInfo||{};
            if (qrInfo.type === 'image' && qrInfo.imageData) {
                selectedQrImage = qrInfo.imageData;
                document.getElementById('qr-uploaded-img').src = qrInfo.imageData;
                document.getElementById('qr-upload-name').innerText = 'Ảnh đã lưu';
                document.getElementById('qr-upload-preview').style.display = 'block';
                switchQrMode('upload');
            } else if (qrInfo.type === 'vietqr') {
                if (qrInfo.bank) document.getElementById('qr-bank').value = qrInfo.bank;
                if (qrInfo.account) document.getElementById('qr-account').value = qrInfo.account;
                if (qrInfo.name) document.getElementById('qr-name').value = qrInfo.name;
                switchQrMode('generate');
            }
        };

        // ===== FIX LOGOUT xóa session =====
        var _origDoLogout2 = doLogout;
        doLogout = function() {
            localStorage.removeItem('gsm_session');
            _origDoLogout2();
        };

        // ===== OVERRIDE exportInvoice: sửa QR + eval =====
        function buildInvoiceHtml(student, mk) {
            var sessions = (student.attendance && student.attendance[mk]) ? student.attendance[mk] : [];
            var totalSessions = sessions.length;
            var totalMoney = computeBillingStats(
                Array.from({ length: totalSessions }, function() { return { status: 'completed', duration: 0 }; }),
                [], (Number(student.rate) || 0) * 1000
            ).expected;
            var paid = getClassCardFeeStatus(student, mk, totalMoney) === 'paid';
            var evalText = (student.monthEvals && student.monthEvals[mk]) || '';

            var parts = mk.split('-'); var y = parseInt(parts[0]), m = parseInt(parts[1]) - 1;
            var days = student.days || [student.day];
            var dayNums = days.map(function(d) { return {'Thứ 2':1,'Thứ 3':2,'Thứ 4':3,'Thứ 5':4,'Thứ 6':5,'Thứ 7':6,'Chủ Nhật':0}[d]; });
            var daysInMonth = new Date(y, m+1, 0).getDate();
            var scheduledSessions = 0;
            for (var d2 = 1; d2 <= daysInMonth; d2++) { if (dayNums.includes(new Date(y,m,d2).getDay())) scheduledSessions++; }
            var absentSessions = scheduledSessions - totalSessions;

            var viMonths = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
            var monthLabel = viMonths[m+1] + ' ' + y;
            var now = new Date();
            var invoiceNum = 'INV-' + y + String(m+1).padStart(2,'0') + '-' + String(student.id).slice(-4);

            // QR block
            var users = getUsers(); var userInfo = users[currentUser]||{};
            var tutorName = userInfo.displayName || currentUser || 'Gia sư';
            var qrInfo = userInfo.qrInfo || null;
            var qrHtml = '';
            if (qrInfo) {
                var bankNames = {'970415':'VietinBank','970436':'Vietcombank','970418':'BIDV','970422':'MB Bank','970426':'TPBank','970432':'VPBank','970407':'Techcombank','970416':'ACB','970405':'Agribank','970423':'Sacombank','970403':'SHB','970448':'OCB'};
                if (qrInfo.type === 'image' && qrInfo.imageData) {
                    qrHtml = '<div style="margin-top:24px;padding:26px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;text-align:center;">'
                        + '<div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:16px;">💳 Quét mã QR để thanh toán học phí</div>'
                        + '<img src="'+qrInfo.imageData+'" style="max-width:280px;max-height:280px;width:100%;border-radius:10px;border:1px solid #bbf7d0;">'
                        + '<div style="font-size:15px;font-weight:700;color:#059669;margin-top:14px;">' + totalMoney.toLocaleString('vi-VN') + ' đ</div>'
                        + '</div>';
                } else if (qrInfo.type === 'vietqr' && qrInfo.account) {
                    var amount = totalMoney;
                    var desc = 'Hoc phi ' + student.name.replace(/\s/g,'') + ' ' + monthLabel.replace(/\s/g,'');
                    var qrUrl = 'https://img.vietqr.io/image/' + qrInfo.bank + '-' + qrInfo.account + '-compact2.png?amount=' + amount + '&addInfo=' + encodeURIComponent(desc) + '&accountName=' + encodeURIComponent(qrInfo.name);
                    qrHtml = '<div style="margin-top:24px;padding:26px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center;">'
                        + '<img src="'+qrUrl+'" crossorigin="anonymous" style="width:240px;height:240px;border-radius:8px;flex-shrink:0;" onerror="this.parentNode.style.display=\'none\'">'
                        + '<div><div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:8px;">💳 Thanh toán chuyển khoản</div>'
                        + '<div style="font-size:13px;color:#374151;line-height:2.1;">'
                        + '<strong>'+(bankNames[qrInfo.bank]||qrInfo.bank)+'</strong><br>'
                        + 'STK: <strong>'+qrInfo.account+'</strong><br>'
                        + 'Chủ TK: <strong>'+qrInfo.name+'</strong><br>'
                        + 'Số tiền: <strong style="color:#059669;font-size:16px;">'+totalMoney.toLocaleString('vi-VN')+' đ</strong>'
                        + '</div></div></div>';
                }
            }

            // Eval block
            var evalHtml = '';
            if (evalText && evalText.trim()) {
                evalHtml = '<div style="margin-top:22px;padding:20px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;">'
                    + '<div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">📝 Nhận xét của gia sư — ' + monthLabel + '</div>'
                    + '<div style="font-size:14px;color:#1a1a2e;line-height:1.8;white-space:pre-wrap;">' + evalText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
                    + '</div>';
            }

            var sessionRows = '';
            if (sessions.length > 0) {
                // Nhóm các ngày thành hàng 4 cột thay vì liệt kê từng dòng
                var dateChunks = [];
                for (var ci = 0; ci < sessions.length; ci += 4) {
                    dateChunks.push(sessions.slice(ci, ci + 4));
                }
                sessionRows = dateChunks.map(function(chunk) {
                    var cells = chunk.map(function(d) {
                        return '<td style="padding:8px 10px;border:1px solid #f0f0f0;color:#374151;font-size:13px;">' + d + '</td>';
                    }).join('');
                    // Pad ô trống nếu chunk cuối không đủ 4
                    while (chunk.length < 4) { cells += '<td style="border:1px solid #f0f0f0;"></td>'; chunk.push(''); }
                    return '<tr>' + cells + '</tr>';
                }).join('');
            }

            var html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Hóa đơn ${monthLabel} – ${student.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Inter,sans-serif;background:#f8fafc;color:#1a1a2e;padding:32px;}.page{max-width:720px;margin:0 auto;}.inv-header{background:linear-gradient(135deg,#064e3b,#065f46);border-radius:16px 16px 0 0;padding:32px 36px;display:flex;justify-content:space-between;align-items:flex-start;}.inv-logo span{font-size:12px;color:rgba(255,255,255,0.6);}.inv-logo strong{display:block;font-size:20px;color:#fff;font-weight:800;}.inv-num span{font-size:11px;color:rgba(255,255,255,0.6);text-align:right;display:block;}.inv-num strong{display:block;font-size:18px;color:#fff;font-weight:700;text-align:right;}.inv-body{background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px 36px;}.inv-meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #f3f4f6;}.meta-block .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:5px;}.meta-block .val{font-size:14px;font-weight:700;color:#111827;}.meta-block .sub{font-size:12px;color:#6b7280;margin-top:2px;}.summary-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;}.sum-card{background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:12px;}.sum-card .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;margin-bottom:6px;}.sum-card .val{font-size:20px;font-weight:800;}table{width:100%;border-collapse:collapse;}th{padding:9px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border-bottom:1px solid #f3f4f6;}.total-row{padding:14px 36px;background:#f0fdf4;border-top:2px solid #10b981;display:flex;justify-content:space-between;align-items:center;}.status-badge{display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;}.badge-g{background:#d1fae5;color:#065f46;}.badge-r{background:#fee2e2;color:#991b1b;}.footer{margin-top:20px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.8;}@media print{body{padding:0;background:#fff;}}</style>
</head><body><div class="page">
<div class="inv-header"><div class="inv-logo"><span>Gia sư chuyên nghiệp</span><strong>${tutorName}</strong></div><div class="inv-num"><span>Số hóa đơn</span><strong>${invoiceNum}</strong></div></div>
<div class="inv-body">
<div class="inv-meta">
  <div class="meta-block"><div class="lbl">Học sinh</div><div class="val">${student.name}</div><div class="sub">${student.subject}</div></div>
  <div class="meta-block"><div class="lbl">Kỳ thanh toán</div><div class="val">${monthLabel}</div><div class="sub">Xuất ngày: ${now.toLocaleDateString('vi-VN')}</div></div>
  <div class="meta-block"><div class="lbl">Lịch học</div><div class="val" style="font-size:13px;">${days.join(', ')}</div><div class="sub">${student.startTime} · ${student.duration}h/buổi</div></div>
  <div class="meta-block"><div class="lbl">Học phí/buổi</div><div class="val" style="color:#059669;">${(student.rate*1000).toLocaleString('vi-VN')} đ</div></div>
</div>
<div class="summary-row">
  <div class="sum-card"><div class="lbl">Theo lịch</div><div class="val" style="color:#0284c7;">${scheduledSessions}</div></div>
  <div class="sum-card"><div class="lbl">Đã dạy</div><div class="val" style="color:#059669;">${totalSessions}</div></div>
  <div class="sum-card"><div class="lbl">Nghỉ</div><div class="val" style="color:${absentSessions>0?'#dc2626':'#9ca3af'};">${absentSessions}</div></div>
  <div class="sum-card"><div class="lbl">Trạng thái</div><div class="val" style="font-size:13px;margin-top:4px;"><span class="status-badge ${paid?'badge-g':'badge-r'}">${paid?'✓ Đã thu':'✗ Chưa thu'}</span></div></div>
</div>
<table><thead><tr>
  <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border:1px solid #f0f0f0;">Ngày 1</th>
  <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border:1px solid #f0f0f0;">Ngày 2</th>
  <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border:1px solid #f0f0f0;">Ngày 3</th>
  <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#9ca3af;background:#f9fafb;border:1px solid #f0f0f0;">Ngày 4</th>
</tr></thead>
<tbody>${sessionRows||'<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;border:1px solid #f0f0f0;">Chưa có buổi nào được chấm công</td></tr>'}</tbody></table>
<div style="margin-top:8px;text-align:right;font-size:12px;color:#6b7280;">Tổng <strong style="color:#059669;">${totalSessions} buổi</strong> × <strong>${(student.rate*1000).toLocaleString('vi-VN')} đ</strong>/buổi</div>
<div class="total-row"><span style="font-size:14px;font-weight:700;color:#065f46;">TỔNG ${monthLabel.toUpperCase()}</span><span style="font-size:24px;font-weight:800;color:#059669;">${totalMoney.toLocaleString('vi-VN')} đ</span></div>
${evalHtml}
${qrHtml}
</div>
<div class="footer">${tutorName} · Hóa đơn tự động · ${now.toLocaleString('vi-VN')}</div>
</div></bo${''}dy></ht${''}ml>`;

            return { html: html, filenameBase: 'HoaDon_' + student.name.replace(/\s+/g,'_') + '_' + mk };
        }

        exportInvoice = function() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            var mk = currentSelectedMonth;
            var result = buildInvoiceHtml(student, mk);

            var blob = new Blob([result.html], {type:'text/html;charset=utf-8'});
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = result.filenameBase + '.html';
            a.click();
            showToast('🧾','Xuất hóa đơn thành công','Mở file bằng trình duyệt rồi gửi cho phụ huynh qua Zalo.');
        };

        // ===== XUẤT HÓA ĐƠN DẠNG ẢNH (PNG) =====
        function exportInvoiceAsImage() {
            var student = classList.find(c => c.id === activeProfileClassId);
            if (!student) return;
            var mk = currentSelectedMonth;
            var result = buildInvoiceHtml(student, mk);

            if (typeof html2canvas === 'undefined') {
                showToast('⚠️','Không thể tạo ảnh','Vui lòng kiểm tra kết nối mạng rồi thử lại.');
                return;
            }

            showToast('⏳','Đang tạo ảnh hóa đơn...','Vui lòng đợi trong giây lát.');

            // Render hóa đơn trong iframe ẩn để chụp ảnh không lẫn giao diện chính
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

                    html2canvas(target, {
                        scale: 2,
                        backgroundColor: '#f8fafc',
                        useCORS: true,
                        allowTaint: false,
                        logging: false
                    }).then(function(canvas) {
                        canvas.toBlob(function(blob) {
                            document.body.removeChild(iframe);
                            if (!blob) {
                                showToast('⚠️','Tạo ảnh thất bại','Hãy thử dùng nút "Xuất hóa đơn" (HTML) thay thế.');
                                return;
                            }
                            var a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = result.filenameBase + '.png';
                            a.click();
                            showToast('🖼️','Tải ảnh hóa đơn thành công','Ảnh PNG đã tải về máy, sẵn sàng gửi qua Zalo.');
                        }, 'image/png');
                    }).catch(function(err) {
                        document.body.removeChild(iframe);
                        console.error(err);
                        showToast('⚠️','Tạo ảnh thất bại','Mã QR ngân hàng có thể chặn xuất ảnh. Hãy thử dùng nút "Xuất hóa đơn" (HTML) thay thế.');
                    });
                }, 400);
            };
        }

        // ===== CHỈNH SỬA LỚP HỌC (STEP 7C) =====
        // Đã tách sang js/students/students.js (openEditClass/closeEditClass/ecUpdateRatePreview/
        // ecBuildTimeGrid/ecOnTimeChange/ecAddManualTime/ecRemoveTime/ecUpdateSelectedChips/
        // saveEditClass/saveEditClassActual + state editingClassId/ecSelectedTimes). Không đổi behavior.

        // Init chạy sau khi đăng nhập (xem doLogin)
