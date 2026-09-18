// js/progress/progress.js
import { supabaseClient } from '../core/supabase.js';
import { showToast } from '../core/toast.js';

window.initProgressModule = initProgressModule;

export async function initProgressModule() {
    console.log('Progress module initialized');
    const pageEl = document.getElementById('tp-page-progress');
    pageEl.innerHTML = `
        <div class="block-card">
            <h3>📈 Tiến độ học tập</h3>
            
            <h4>1-TO-1</h4>
            <div id="progress-1to1-list">Đang tải...</div>
            
            <h4 style="margin-top:20px;">LỚP NHÓM</h4>
            <div id="progress-group-list">Đang tải...</div>
        </div>
    `;
    
    await Promise.all([
        load1to1Students(),
        loadGroupClasses()
    ]);
}

async function load1to1Students() {
    const listEl = document.getElementById('progress-1to1-list');
    
    // Fetch students
    const { data: students, error: studError } = await supabaseClient
        .from('students')
        .select('id, name, subject')
        .eq('tutor_id', activeTutorId)
        .order('name');

    if (studError) {
        listEl.innerHTML = '<p>Lỗi tải danh sách.</p>';
        return;
    }

    // Fetch all 1-to-1 progress for this tutor to calculate averages in JS
    const { data: progress, error: progError } = await supabaseClient
        .from('student_progress')
        .select('student_id, score')
        .eq('source_type', 'one_to_one')
        .eq('tutor_id', activeTutorId);

    if (progError) {
        listEl.innerHTML = '<p>Lỗi tải dữ liệu tiến độ.</p>';
        return;
    }

    if (!students || students.length === 0) {
        listEl.innerHTML = '<p>Chưa có học sinh 1-to-1.</p>';
        return;
    }

    // Map progress to student_id for quick lookup
    const progressMap = {};
    (progress || []).forEach(p => {
        if (!progressMap[p.student_id]) progressMap[p.student_id] = [];
        progressMap[p.student_id].push(Number(p.score));
    });

    listEl.innerHTML = students.map(s => {
        const scores = progressMap[s.id] || [];
        const avg = scores.length > 0 
            ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
            : null;

        const avgDisplay = avg !== null 
            ? `<span style="font-weight:700; color:var(--accent);">${avg}</span>` 
            : '<span style="color:var(--text-sub);">Chưa có dữ liệu</span>';

        return `
            <div class="block-card" style="margin-bottom:10px; cursor:pointer;" onclick="openStudentProgress('${s.id}', '${escapeHtmlAttr(s.name)}', '${escapeHtmlAttr(s.subject || 'Chưa rõ môn')}')">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${escapeHtml(s.name)}</strong>
                    <span>${escapeHtml(s.subject || '')}</span>
                </div>
                <div style="font-size:0.9em; color:var(--text-sub); margin-top:4px;">
                    Điểm trung bình: ${avgDisplay}
                </div>
            </div>
        `;
    }).join('');
}

async function loadGroupClasses() {
    const listEl = document.getElementById('progress-group-list');

    const { data: classes, error } = await supabaseClient
        .from('group_classes')
        .select('id, name')
        .eq('tutor_id', activeTutorId)
        .order('name');

    if (error) {
        listEl.innerHTML = '<p>Lỗi tải lớp nhóm.</p>';
        return;
    }

    if (!classes || classes.length === 0) {
        listEl.innerHTML = '<p>Chưa có lớp nhóm.</p>';
        return;
    }

    // Load enrollments to count students
    const { data: enrollments } = await supabaseClient
        .from('group_class_enrollments')
        .select('group_class_id, student_id')
        .in('group_class_id', classes.map(c => c.id))
        .eq('status', 'active');

    // Load latest group progress for all students in these classes for average calculation
    const classIds = classes.map(c => c.id);
    const { data: progress } = await supabaseClient
        .from('student_progress')
        .select('student_id, score, group_class_id, recorded_at')
        .in('group_class_id', classIds)
        .eq('source_type', 'group')
        .eq('tutor_id', activeTutorId)
        .order('recorded_at', { ascending: false });

    listEl.innerHTML = classes.map(c => {
        const classEnrollments = (enrollments || []).filter(e => e.group_class_id === c.id);
        const studentCount = classEnrollments.length;
        const studentIds = classEnrollments.map(e => e.student_id);
        
        // Calculate average: avg of latest progress per student
        const latestProgress = [];
        studentIds.forEach(sid => {
            const studentRecords = (progress || []).filter(p => p.student_id === sid && p.group_class_id === c.id);
            if (studentRecords.length > 0) {
                latestProgress.push(Number(studentRecords[0].score));
            }
        });

        const avg = latestProgress.length > 0
            ? (latestProgress.reduce((a, b) => a + b, 0) / latestProgress.length).toFixed(1)
            : null;

        return `
            <div class="block-card" style="margin-bottom:10px; cursor:pointer;" onclick="openGroupClassProgressDetail('${c.id}', '${escapeHtmlAttr(c.name)}')">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${escapeHtml(c.name)}</strong>
                    <span>${studentCount} học sinh</span>
                </div>
                <div style="font-size:0.9em; color:gray;">
                    Điểm trung bình: ${avg !== null ? avg : 'Chưa có dữ liệu'}
                </div>
            </div>
        `;
    }).join('');
}

window.openGroupClassProgressDetail = async function(classId, className) {
    const pageEl = document.getElementById('tp-page-progress');
    pageEl.innerHTML = `
        <div class="block-card">
            <button class="tp-nav-btn" onclick="initProgressModule()">← Quay lại</button>
            <h3 style="margin-top:15px;">${escapeHtml(className)}</h3>
            <div id="group-detail-content">Đang tải...</div>
        </div>
    `;

    const detailEl = document.getElementById('group-detail-content');

    // Load students in class
    const { data: enrollments, error: enrollError } = await supabaseClient
        .from('group_class_enrollments')
        .select('student_id, students(id, name)')
        .eq('group_class_id', classId)
        .eq('status', 'active');

    if (enrollError || !enrollments) {
        detailEl.innerHTML = '<p>Lỗi tải học sinh.</p>';
        return;
    }

    // Load latest progress for these students
    const studentIds = enrollments.map(e => e.student_id);
    const { data: progress, error: progError } = await supabaseClient
        .from('student_progress')
        .select('student_id, score')
        .eq('group_class_id', classId)
        .eq('source_type', 'group')
        .eq('tutor_id', activeTutorId)
        .order('recorded_at', { ascending: false });

    // Calculate Average
    const latestProgressMap = {};
    (progress || []).forEach(p => {
        if (!(p.student_id in latestProgressMap)) {
            latestProgressMap[p.student_id] = Number(p.score);
        }
    });

    const scores = Object.values(latestProgressMap);
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

    detailEl.innerHTML = `
        <div class="block-card" style="text-align:center; margin:15px 0;">
            <div style="color:gray;">Điểm trung bình lớp</div>
            <div style="font-size:2em; font-weight:bold;">${avg !== null ? avg : 'Chưa có'}</div>
        </div>
        <button class="tp-nav-btn" onclick="openProgressForm(null, null, 'Học sinh', 'Chưa rõ', '${classId}')">+ Thêm kết quả</button>
        <div style="margin-top:10px;">
            ${enrollments.map(e => {
                const latestScore = latestProgressMap[e.student_id];
                return `
                    <div class="block-card" style="margin-bottom:5px; cursor:pointer; display:flex; justify-content:space-between;" onclick="openStudentProgress('${e.students.id}', '${escapeHtmlAttr(e.students.name)}', 'Lớp nhóm')">
                        <strong>${escapeHtml(e.students.name)}</strong>
                        <span>${latestScore !== undefined ? latestScore : 'Chưa có điểm'}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

async function loadStudentProgressDetail(studentId, studentName, subject) {
    const { data: progress, error } = await supabaseClient
        .from('student_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('tutor_id', activeTutorId)
        .order('recorded_at', { ascending: true });

    if (error) {
        console.error('Error loading progress:', error);
        document.getElementById('progress-detail-content').innerHTML = '<p>Lỗi tải dữ liệu.</p>';
        return;
    }

    const detailEl = document.getElementById('progress-detail-content');

    if (!progress || progress.length === 0) {
        detailEl.innerHTML = `
            <p>Chưa có dữ liệu tiến độ.</p>
            <button class="tp-nav-btn" onclick="openProgressForm('${studentId}', null, '${escapeHtmlAttr(studentName)}', '${escapeHtmlAttr(subject)}')">+ Thêm kết quả</button>
        `;
        return;
    }

    const scores = progress.map(p => Number(p.score));
    const firstScore = scores[0];
    const currentScore = scores[scores.length - 1];
    const maxScore = Math.max(...scores);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const diff = (currentScore - firstScore).toFixed(2);

    const groupClassIds = [...new Set(
        progress
            .filter(p => p.source_type === 'group' && p.group_class_id)
            .map(p => p.group_class_id)
    )];

    const groupClassNames = await loadGroupClassNames(groupClassIds);

    detailEl.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-bottom:20px;">
            ${renderStatCard('Điểm đầu', firstScore)}
            ${renderStatCard('Điểm hiện tại', currentScore)}
            ${renderStatCard('Cao nhất', maxScore)}
            ${renderStatCard('Trung bình', avgScore)}
            ${renderStatCard('Thay đổi', diff, diff >= 0 ? 'color:green' : 'color:red')}
        </div>
        <div id="progress-chart" style="margin-bottom:20px; height:200px;"></div>
        <h4>Lịch sử đánh giá</h4>
        <button class="tp-nav-btn" onclick="openProgressForm('${studentId}', null, '${escapeHtmlAttr(studentName)}', '${escapeHtmlAttr(subject)}')">+ Thêm kết quả</button>
        <table class="fin-table" style="width:100%; margin-top:10px;">
            <thead><tr><th>Ngày</th><th>Điểm</th><th>Nguồn</th><th>Loại</th><th>Chủ đề</th><th>Hành động</th></tr></thead>
            <tbody>
                ${progress.map(p => {
                    const sourceLabel = p.source_type === 'group'
                        ? `Lớp nhóm${p.group_class_id && groupClassNames[p.group_class_id] ? `<br><small>${escapeHtml(groupClassNames[p.group_class_id])}</small>` : ''}`
                        : '1-to-1';
                    return `<tr>
                        <td>${escapeHtml(p.recorded_at)}</td>
                        <td><strong>${escapeHtml(String(p.score))}</strong></td>
                        <td>${sourceLabel}</td>
                        <td>${escapeHtml(p.assessment_type)}</td>
                        <td>${escapeHtml(p.topic || '-')}</td>
                        <td>
                            <div style="display:flex; gap:4px;">
                                <button class="btn-action-edit" onclick="openProgressForm('${studentId}', '${p.id}', '${escapeHtmlAttr(studentName)}', '${escapeHtmlAttr(subject)}')" aria-label="Sửa kết quả" title="Sửa kết quả">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button class="btn-action-delete" onclick="deleteProgress('${p.id}', '${studentId}', '${escapeHtmlAttr(studentName)}', '${escapeHtmlAttr(subject)}')" aria-label="Xóa kết quả" title="Xóa kết quả">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;

    renderProgressChart(progress);
}

async function loadGroupClassNames(classIds) {
    if (!classIds.length) return {};

    const { data, error } = await supabaseClient
        .from('group_classes')
        .select('id, name')
        .in('id', classIds)
        .eq('tutor_id', activeTutorId);

    if (error) {
        console.error('Error loading group class names:', error);
        return {};
    }

    return Object.fromEntries((data || []).map(c => [c.id, c.name]));
}

function renderStatCard(label, value, style='') {
    return `<div class="block-card" style="padding:10px; text-align:center;">
        <div style="font-size:0.8em; color:gray;">${label}</div>
        <div style="font-size:1.2em; font-weight:bold; ${style}">${value}</div>
    </div>`;
}

function renderProgressChart(progress) {
    const chartEl = document.getElementById('progress-chart');
    if (!chartEl) return;

    const width = Math.max(chartEl.offsetWidth, 320);
    const height = 200;
    const padding = 30;

    const points = progress.map((p, i) => ({
        x: padding + (i * (width - 2 * padding) / (progress.length > 1 ? progress.length - 1 : 1)),
        y: height - padding - (Number(p.score) * (height - 2 * padding) / 10)
    }));

    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    chartEl.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
            <line x1="${padding}" y1="${height-padding}" x2="${width-padding}" y2="${height-padding}" stroke="black" />
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height-padding}" stroke="black" />
            <path d="${path}" fill="none" stroke="blue" stroke-width="2" />
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="blue" />`).join('')}
        </svg>
    `;
}

window.openProgressForm = async function(studentId = null, progressId = null, studentName = 'Học sinh', subject = 'Chưa rõ môn', groupClassId = null) {
    let modal = document.getElementById('progress-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'progress-modal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
        document.body.appendChild(modal);
    }

    let existing = null;
    let contextSourceType = groupClassId ? 'group' : 'one_to_one';

    if (progressId) {
        const { data, error } = await supabaseClient
            .from('student_progress')
            .select('*')
            .eq('id', progressId)
            .eq('tutor_id', activeTutorId)
            .maybeSingle();

        if (error || !data) {
            showToast('❌', 'Không tìm thấy kết quả hoặc bạn không có quyền sửa.', '');
            return;
        }

        existing = data;
        contextSourceType = existing.source_type;
        groupClassId = existing.group_class_id;
    }

    modal.innerHTML = `
        <style>
            .progress-modal-content {
                max-width: 600px;
                width: 95%;
                margin: 20px auto;
                background: var(--bg-card);
                padding: 24px;
                border-radius: var(--radius);
                box-shadow: var(--shadow-lg);
                border: 1px solid var(--border-color);
                max-height: 90vh;
                overflow-y: auto;
            }
            .progress-modal-header { margin-bottom: 20px; }
            .progress-modal-header h3 { margin: 0; font-size: 1.2em; color: var(--text-main); }
            .progress-modal-header p { margin: 5px 0 0; color: var(--text-sub); font-size: 0.9em; }
            
            .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
            
            label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.75em; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.4px; }
            input, select, textarea { width: 100%; padding: 10px; border: 1.5px solid var(--border-color); border-radius: 8px; box-sizing: border-box; font-size: 13px; background: var(--bg-card-sub); color: var(--text-main); font-family: 'Inter', sans-serif; }
            input:focus, select:focus, textarea:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--accent-dim); }
            
            .info-card { background: var(--bg-card-sub); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border-color); }
            .info-card h4 { margin: 0 0 5px; font-size: 0.85em; color: var(--text-sub); text-transform: uppercase; }
            .info-card p { margin: 0; font-size: 1em; font-weight: bold; color: var(--text-main); }
            
            .btn-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; }
            .btn-submit-form { min-width: 120px; }
            
            @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
        </style>
        <div class="progress-modal-content">
            <div class="progress-modal-header">
                <h3>${existing ? 'Chỉnh sửa kết quả' : 'Thêm kết quả học tập'}</h3>
                <p>Ghi nhận kết quả và đánh giá tiến độ học sinh</p>
            </div>
            
            <form id="progress-form">
                ${contextSourceType === 'group' ? `
                    <div class="info-card">
                        <h4>Lớp học</h4>
                        <p>👥 ${groupClassId}</p>
                    </div>
                ` : `
                    <div class="info-card">
                        <h4>Học sinh</h4>
                        <p>👤 ${escapeHtml(studentName)}</p>
                    </div>
                `}

                ${contextSourceType === 'group' ? `
                    <div class="form-grid">
                        <div>
                            <label for="prog-student">Học sinh</label>
                            <select id="prog-student" required><option value="">Đang tải...</option></select>
                        </div>
                        <div>
                            <label for="prog-group-session">Buổi học</label>
                            <select id="prog-group-session"><option value="">Không chọn buổi</option></select>
                        </div>
                    </div>
                ` : ''}

                <div class="form-grid">
                    <div>
                        <label for="prog-date">Ngày đánh giá</label>
                        <input type="date" id="prog-date" required>
                    </div>
                    <div>
                        <label for="prog-score">Điểm</label>
                        <input type="number" id="prog-score" min="0" max="10" step="0.1" placeholder="0 - 10" required>
                    </div>
                </div>

                <div class="form-grid">
                    <div>
                        <label for="prog-type">Loại đánh giá</label>
                        <select id="prog-type">
                            <option>Bài tập</option><option>Kiểm tra</option><option>Đề thi</option><option>Thi thử</option><option>Khác</option>
                        </select>
                    </div>
                    <div>
                        <label for="prog-topic">Chủ đề</label>
                        <input type="text" id="prog-topic" placeholder="Ví dụ: Hàm số">
                    </div>
                </div>

                <label for="prog-comment">Nhận xét</label>
                <textarea id="prog-comment" rows="4" placeholder="Nhận xét chi tiết..."></textarea>

                <div class="btn-row">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('progress-modal').style.display='none'">Hủy</button>
                    <button type="submit" class="btn-submit btn-submit-form">Lưu kết quả</button>
                </div>
            </form>
        </div>
    `;

    const dateEl = document.getElementById('prog-date');
    dateEl.value = existing?.recorded_at || new Date().toISOString().slice(0, 10);
    document.getElementById('prog-score').value = existing?.score ?? '';
    document.getElementById('prog-type').value = existing?.assessment_type || 'Bài tập';
    document.getElementById('prog-topic').value = existing?.topic || '';
    document.getElementById('prog-comment').value = existing?.comment || '';

    if (contextSourceType === 'group') {
        const studentEl = document.getElementById('prog-student');
        const sessionEl = document.getElementById('prog-group-session');

        const { data: enrollments } = await supabaseClient
            .from('group_class_enrollments')
            .select('student_id, students(name)')
            .eq('group_class_id', groupClassId)
            .eq('status', 'active');
            
        studentEl.innerHTML = '<option value="">Chọn học sinh</option>' +
            (enrollments || []).map(e => `<option value="${e.student_id}" ${e.student_id === studentId ? 'selected' : ''}>${escapeHtml(e.students.name)}</option>`).join('');

        const { data: sessions } = await supabaseClient
            .from('group_sessions')
            .select('id, scheduled_date')
            .eq('group_class_id', groupClassId)
            .order('scheduled_date', { ascending: false });

        sessionEl.innerHTML = '<option value="">Không chọn buổi</option>' +
            (sessions || []).map(s => `<option value="${s.id}" ${s.id === existing?.group_session_id ? 'selected' : ''}>${escapeHtml(s.scheduled_date)}</option>`).join('');
    }

    document.getElementById('progress-form').onsubmit = async (e) => {
        e.preventDefault();
        const sId = contextSourceType === 'group' ? document.getElementById('prog-student').value : studentId;
        
        if (!sId) { showToast('⚠️', 'Vui lòng chọn học sinh.', ''); return; }

        await saveProgressRecord(
            sId,
            existing?.id || null,
            studentName,
            subject,
            {
                source_type: contextSourceType,
                group_class_id: groupClassId,
                group_session_id: contextSourceType === 'group' ? document.getElementById('prog-group-session').value : null,
                recorded_at: dateEl.value,
                score: document.getElementById('prog-score').value,
                assessment_type: document.getElementById('prog-type').value,
                topic: document.getElementById('prog-topic').value,
                comment: document.getElementById('prog-comment').value
            }
        );
    };

    modal.style.display = 'flex';
};

async function saveProgressRecord(studentId, progressId, studentName, subject, fields) {
    const data = {
        student_id: studentId,
        tutor_id: activeTutorId,
        source_type: fields.source_type || 'one_to_one',
        group_class_id: fields.group_class_id || null,
        group_session_id: fields.group_session_id || null,
        recorded_at: fields.recorded_at,
        score: fields.score,
        assessment_type: fields.assessment_type,
        topic: fields.topic,
        comment: fields.comment
    };

    // Always verify the student belongs to the tutor before writing.
    const { data: student, error: studentError } = await supabaseClient
        .from('students')
        .select('id')
        .eq('id', studentId)
        .eq('tutor_id', activeTutorId)
        .maybeSingle();

    if (studentError || !student) {
        showToast('❌', 'Học sinh không thuộc tutor hiện tại.', '');
        return;
    }

    if (data.source_type === 'one_to_one') {
        data.group_class_id = null;
        data.group_session_id = null;
    }

    if (data.source_type === 'group') {
        if (!data.group_class_id) {
            showToast('⚠️', 'Vui lòng chọn lớp nhóm.', '');
            return;
        }

        const { data: enrollment, error: enrollmentError } = await supabaseClient
            .from('group_class_enrollments')
            .select('id')
            .eq('group_class_id', data.group_class_id)
            .eq('student_id', studentId)
            .eq('status', 'active')
            .maybeSingle();

        if (enrollmentError || !enrollment) {
            showToast('❌', 'Học sinh không thuộc lớp nhóm đã chọn.', '');
            return;
        }

        const { data: cls, error: classError } = await supabaseClient
            .from('group_classes')
            .select('id')
            .eq('id', data.group_class_id)
            .eq('tutor_id', activeTutorId)
            .maybeSingle();

        if (classError || !cls) {
            showToast('❌', 'Lớp nhóm không thuộc tutor hiện tại.', '');
            return;
        }

        if (data.group_session_id) {
            const { data: session, error: sessionError } = await supabaseClient
                .from('group_sessions')
                .select('id')
                .eq('id', data.group_session_id)
                .eq('group_class_id', data.group_class_id)
                .maybeSingle();

            if (sessionError || !session) {
                showToast('❌', 'Buổi học không thuộc lớp đã chọn.', '');
                return;
            }
        }
    }

    let error;

    if (progressId) {
        ({ error } = await supabaseClient
            .from('student_progress')
            .update(data)
            .eq('id', progressId)
            .eq('tutor_id', activeTutorId));
    } else {
        ({ error } = await supabaseClient
            .from('student_progress')
            .insert([data]));
    }

    if (error) {
        console.error('Error saving progress:', error);
        showToast('❌', 'Lỗi lưu:', error.message);
        return;
    }

    showToast('✅', 'Đã lưu', '');
    document.getElementById('progress-modal').style.display = 'none';
    await loadStudentProgressDetail(studentId, studentName, subject);
}

window.saveProgress = async function(e, studentId, progressId, studentName = 'Học sinh', subject = 'Chưa rõ môn') {
    e.preventDefault();

    const actualProgressId = (progressId === 'null') ? null : progressId;
    const sourceType =
        document.querySelector('input[name="prog-source"]:checked')?.value || 'one_to_one';

    await saveProgressRecord(
        studentId,
        actualProgressId,
        studentName,
        subject,
        {
            source_type: sourceType,
            group_class_id:
                sourceType === 'group'
                    ? (document.getElementById('prog-group-class')?.value || null)
                    : null,
            group_session_id:
                sourceType === 'group'
                    ? (document.getElementById('prog-group-session')?.value || null)
                    : null,
            recorded_at: document.getElementById('prog-date').value,
            score: document.getElementById('prog-score').value,
            assessment_type: document.getElementById('prog-type').value,
            topic: document.getElementById('prog-topic').value,
            comment: document.getElementById('prog-comment').value
        }
    );
};

window.deleteProgress = async function(progressId, studentId, studentName, subject) {
    if (!confirm('Bạn có chắc chắn muốn xóa đánh giá này?')) return;

    const { error } = await supabaseClient
        .from('student_progress')
        .delete()
        .eq('id', progressId)
        .eq('tutor_id', activeTutorId);

    if (error) {
        showToast('❌', 'Lỗi xóa:', error.message);
        return;
    }

    showToast('✅', 'Đã xóa', '');
    await loadStudentProgressDetail(studentId, studentName, subject);
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeHtmlAttr(value) {
    return escapeHtml(value);
}
async function openStudentProgress(studentId, studentName, subject) {
    const pageEl = document.getElementById('tp-page-progress');
    pageEl.innerHTML = `
        <div class="block-card">
            <button class="tp-nav-btn" onclick="initProgressModule()">← Quay lại</button>
            <h3 style="margin-top:15px;">${escapeHtml(studentName)}</h3>
            <div id="progress-detail-content">Đang tải...</div>
        </div>
    `;
    await loadStudentProgressDetail(studentId, studentName, subject);
}

window.openStudentProgress = openStudentProgress; window.openGroupClassProgressDetail = openGroupClassProgressDetail; window.openProgressForm = openProgressForm; window.saveProgress = saveProgress; window.deleteProgress = deleteProgress;
