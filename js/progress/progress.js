// js/progress/progress.js
import { supabaseClient } from '../core/supabase.js';
import { showToast } from '../core/toast.js';

window.initProgressModule = initProgressModule;

export async function initProgressModule() {
    console.log('Progress module initialized');
    const pageEl = document.getElementById('tp-page-progress');
    pageEl.innerHTML = '<div class="block-card"><h3>📈 Tiến độ học tập</h3><div id="progress-student-list"></div></div>';
    await loadStudents();
}

async function loadStudents() {
    const listEl = document.getElementById('progress-student-list');
    listEl.innerHTML = '<p>Đang tải...</p>';

    const { data: students, error } = await supabaseClient
        .from('students')
        .select('id, name, subject')
        .eq('tutor_id', activeTutorId)
        .order('name');

    if (error) {
        console.error('Error loading students:', error);
        listEl.innerHTML = '<p>Có lỗi xảy ra khi tải học sinh.</p>';
        return;
    }

    if (!students || students.length === 0) {
        listEl.innerHTML = '<p>Chưa có học sinh nào.</p>';
        return;
    }

    listEl.innerHTML = students.map(s => `
        <div class="block-card" style="margin-bottom:10px; cursor:pointer;" onclick="openStudentProgress('${s.id}', '${escapeHtmlAttr(s.name)}', '${escapeHtmlAttr(s.subject || 'Chưa rõ môn')}')">
            <div style="display:flex; justify-content:space-between;">
                <strong>${escapeHtml(s.name)}</strong>
                <span>${escapeHtml(s.subject || '')}</span>
            </div>
        </div>
    `).join('');
}

window.openStudentProgress = async function(studentId, studentName, subject) {
    const pageEl = document.getElementById('tp-page-progress');
    pageEl.innerHTML = `
        <div class="block-card">
            <button class="tp-nav-btn" onclick="initProgressModule()">← Quay lại danh sách</button>
            <h3 style="margin-top:15px;">📈 Tiến độ: ${escapeHtml(studentName)} (${escapeHtml(subject)})</h3>
            <div id="progress-detail-content">Đang tải chi tiết...</div>
        </div>
    `;
    await loadStudentProgressDetail(studentId, studentName, subject);
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

window.openProgressForm = async function(studentId, progressId = null, studentName = 'Học sinh', subject = 'Chưa rõ môn') {
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
    }

    modal.innerHTML = `
        <div class="modal-box">
            <h3>${existing ? 'Sửa' : 'Thêm'} kết quả</h3>
            <form id="progress-form">
                <label>Nguồn kết quả</label>
                <div style="display:flex; gap:16px; margin:8px 0 14px;">
                    <label>
                        <input type="radio" name="prog-source" value="one_to_one"
                            ${(!existing || existing.source_type === 'one_to_one' || !existing.source_type) ? 'checked' : ''}>
                        1-to-1
                    </label>
                    <label>
                        <input type="radio" name="prog-source" value="group"
                            ${(existing?.source_type === 'group') ? 'checked' : ''}>
                        Lớp nhóm
                    </label>
                </div>

                <div id="prog-group-fields" style="display:none;">
                    <label for="prog-group-class">Lớp</label>
                    <select id="prog-group-class">
                        <option value="">Đang tải...</option>
                    </select>

                    <label for="prog-group-session">
                        Buổi học <span style="font-weight:normal; color:gray;">(không bắt buộc)</span>
                    </label>
                    <select id="prog-group-session">
                        <option value="">Không chọn buổi</option>
                    </select>
                </div>

                <label for="prog-date">Ngày</label>
                <input type="date" id="prog-date" required>

                <label for="prog-score">Điểm</label>
                <input type="number" id="prog-score" min="0" max="10" step="0.1" placeholder="Điểm (0-10)" required>

                <label for="prog-type">Loại đánh giá</label>
                <select id="prog-type">
                    <option>Bài tập</option>
                    <option>Kiểm tra</option>
                    <option>Đề thi</option>
                    <option>Thi thử</option>
                    <option>Đánh giá năng lực</option>
                    <option>Khác</option>
                </select>

                <label for="prog-topic">Chủ đề</label>
                <input type="text" id="prog-topic" placeholder="Chủ đề">

                <label for="prog-comment">Nhận xét</label>
                <textarea id="prog-comment" placeholder="Nhận xét"></textarea>

                <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                    <button type="button" class="btn-action-cancel" onclick="document.getElementById('progress-modal').style.display='none'">Hủy</button>
                    <button type="submit" class="btn-action-save">Lưu</button>
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

    const sourceInputs = [...document.querySelectorAll('input[name="prog-source"]')];
    const groupFields = document.getElementById('prog-group-fields');
    const groupClassEl = document.getElementById('prog-group-class');
    const groupSessionEl = document.getElementById('prog-group-session');

    async function loadStudentGroupClasses(selectedId = null, selectedSessionId = null) {
        groupClassEl.innerHTML = '<option value="">Đang tải lớp...</option>';
        groupSessionEl.innerHTML = '<option value="">Không chọn buổi</option>';

        const { data: enrollments, error } = await supabaseClient
            .from('group_class_enrollments')
            .select('group_class_id')
            .eq('student_id', studentId)
            .eq('status', 'active');

        if (error) throw error;

        const classIds = [...new Set(
            (enrollments || [])
                .map(e => e.group_class_id)
                .filter(Boolean)
        )];

        if (!classIds.length) {
            groupClassEl.innerHTML = '<option value="">Học sinh chưa thuộc lớp nhóm</option>';
            return;
        }

        const { data: classes, error: classError } = await supabaseClient
            .from('group_classes')
            .select('id, name, subject, tutor_id')
            .in('id', classIds)
            .eq('tutor_id', activeTutorId)
            .order('name');

        if (classError) throw classError;

        if (!classes || classes.length === 0) {
            groupClassEl.innerHTML = '<option value="">Không có lớp nhóm của tutor hiện tại</option>';
            return;
        }

        groupClassEl.innerHTML =
            '<option value="">Chọn lớp</option>' +
            classes.map(c => `
                <option value="${c.id}">
                    ${escapeHtml(c.name)}${c.subject ? ` — ${escapeHtml(c.subject)}` : ''}
                </option>
            `).join('');

        if (selectedId && classes.some(c => c.id === selectedId)) {
            groupClassEl.value = selectedId;
            await loadGroupSessions(selectedSessionId);
        }
    }

    async function loadGroupSessions(selectedSessionId = null) {
        groupSessionEl.innerHTML = '<option value="">Đang tải buổi học...</option>';

        const classId = groupClassEl.value;

        if (!classId) {
            groupSessionEl.innerHTML = '<option value="">Không chọn buổi</option>';
            return;
        }

        const { data: cls, error: clsError } = await supabaseClient
            .from('group_classes')
            .select('id')
            .eq('id', classId)
            .eq('tutor_id', activeTutorId)
            .maybeSingle();

        if (clsError || !cls) {
            groupSessionEl.innerHTML = '<option value="">Không tìm thấy lớp</option>';
            return;
        }

        const { data: sessions, error } = await supabaseClient
            .from('group_sessions')
            .select('id, scheduled_date, start_time, status')
            .eq('group_class_id', classId)
            .order('scheduled_date', { ascending: false });

        if (error) {
            console.error('Error loading group sessions:', error);
            groupSessionEl.innerHTML = '<option value="">Không tải được buổi học</option>';
            return;
        }

        groupSessionEl.innerHTML =
            '<option value="">Không chọn buổi</option>' +
            (sessions || []).map(s => `
                <option value="${s.id}">
                    ${escapeHtml(s.scheduled_date)}
                    ${s.start_time ? ` — ${escapeHtml(s.start_time)}` : ''}
                    ${s.status ? ` — ${escapeHtml(s.status)}` : ''}
                </option>
            `).join('');

        if (selectedSessionId && (sessions || []).some(s => s.id === selectedSessionId)) {
            groupSessionEl.value = selectedSessionId;
        }
    }

    async function toggleSource() {
        const source = document.querySelector('input[name="prog-source"]:checked')?.value || 'one_to_one';

        groupFields.style.display = source === 'group' ? 'block' : 'none';

        if (source === 'group') {
            try {
                await loadStudentGroupClasses(
                    existing?.group_class_id || null,
                    existing?.group_session_id || null
                );
            } catch (err) {
                console.error('Error loading student group classes:', err);
                groupClassEl.innerHTML = '<option value="">Không tải được lớp</option>';
            }
        }
    }

    sourceInputs.forEach(input => input.addEventListener('change', toggleSource));
    groupClassEl.addEventListener('change', () => loadGroupSessions());

    await toggleSource();

    document.getElementById('progress-form').onsubmit = async (e) => {
        e.preventDefault();

        const sourceType =
            document.querySelector('input[name="prog-source"]:checked')?.value || 'one_to_one';

        const groupClassId =
            sourceType === 'group' ? (groupClassEl.value || null) : null;

        const groupSessionId =
            sourceType === 'group' ? (groupSessionEl.value || null) : null;

        if (sourceType === 'group' && !groupClassId) {
            showToast('⚠️', 'Vui lòng chọn lớp nhóm.', '');
            return;
        }

        await saveProgressRecord(
            studentId,
            existing?.id || null,
            studentName,
            subject,
            {
                source_type: sourceType,
                group_class_id: groupClassId,
                group_session_id: groupSessionId,
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
