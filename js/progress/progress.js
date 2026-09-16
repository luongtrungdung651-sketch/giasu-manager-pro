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

    console.log('DEBUG: Attempting loadStudents for tutor:', activeTutorId);

    const { data: students, error } = await supabaseClient
        .from('students')
        .select('id, name, subject')
        .eq('tutor_id', activeTutorId)
        .order('name');

    if (error) {
        console.error('DEBUG: Error loading students:', error);
        console.error('DEBUG: Error code:', error.code);
        console.error('DEBUG: Error details:', error.details);
        console.error('DEBUG: Error hint:', error.hint);
        listEl.innerHTML = '<p>Có lỗi xảy ra khi tải học sinh (403).</p>';
        return;
    }

    if (!students || students.length === 0) {
        listEl.innerHTML = '<p>Chưa có học sinh nào.</p>';
        return;
    }

    listEl.innerHTML = students.map(s => `
        <div class="block-card" style="margin-bottom:10px; cursor:pointer;" onclick="openStudentProgress('${s.id}', '${s.name}', '${s.subject || 'Chưa rõ môn'}')">
            <div style="display:flex; justify-content:between;">
                <strong>${s.name}</strong>
                <span>${s.subject || ''}</span>
            </div>
        </div>
    `).join('');
}

window.openStudentProgress = async function(studentId, studentName, subject) {
    const pageEl = document.getElementById('tp-page-progress');
    pageEl.innerHTML = `
        <div class="block-card">
            <button class="tp-nav-btn" onclick="initProgressModule()">← Quay lại danh sách</button>
            <h3 style="margin-top:15px;">📈 Tiến độ: ${studentName} (${subject})</h3>
            <div id="progress-detail-content">Đang tải chi tiết...</div>
        </div>
    `;
    await loadStudentProgressDetail(studentId, studentName, subject);
}

async function loadStudentProgressDetail(studentId, studentName, subject) {
    console.log('DEBUG: Attempting loadStudentProgressDetail for student:', studentId, 'tutor:', activeTutorId);

    const { data: progress, error } = await supabaseClient
        .from('student_progress')
        .select('*')
        .eq('student_id', studentId)
        .order('recorded_at', { ascending: true });

    if (error) {
        console.error('DEBUG: Error loading progress:', error);
        console.error('DEBUG: Error code:', error.code);
        console.error('DEBUG: Error details:', error.details);
        console.error('DEBUG: Error hint:', error.hint);
        document.getElementById('progress-detail-content').innerHTML = '<p>Lỗi tải dữ liệu (403).</p>';
        return;
    }

    const detailEl = document.getElementById('progress-detail-content');

    if (!progress || progress.length === 0) {
        detailEl.innerHTML = `
            <p>Chưa có dữ liệu tiến độ.</p>
            <button class="tp-nav-btn" onclick="openProgressForm('${studentId}', null, '${studentName}', '${subject}')">+ Thêm kết quả</button>
        `;
        return;
    }

    // Calculations
    const scores = progress.map(p => p.score);
    const firstScore = scores[0];
    const currentScore = scores[scores.length - 1];
    const maxScore = Math.max(...scores);
    const avgScore = (scores.reduce((a, b) => a + Number(b), 0) / scores.length).toFixed(2);
    const diff = (currentScore - firstScore).toFixed(2);

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
        <button class="tp-nav-btn" onclick="openProgressForm('${studentId}', null, '${studentName}', '${subject}')">+ Thêm kết quả</button>
        <table class="fin-table" style="width:100%; margin-top:10px;">
            <thead><tr><th>Ngày</th><th>Điểm</th><th>Loại</th><th>Chủ đề</th><th>Hành động</th></tr></thead>
            <tbody>
                ${progress.map(p => `<tr>
                    <td>${p.recorded_at}</td>
                    <td><strong>${p.score}</strong></td>
                    <td>${p.assessment_type}</td>
                    <td>${p.topic || '-'}</td>
                    <td>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn-action-edit" onclick="openProgressForm('${studentId}', '${p.id}', '${studentName}', '${subject}')" aria-label="Sửa kết quả" title="Sửa kết quả">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="btn-action-delete" onclick="deleteProgress('${p.id}', '${studentId}', '${studentName}', '${subject}')" aria-label="Xóa kết quả" title="Xóa kết quả">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
    renderProgressChart(progress);
}

function renderStatCard(label, value, style='') {
    return `<div class="block-card" style="padding:10px; text-align:center;">
        <div style="font-size:0.8em; color:gray;">${label}</div>
        <div style="font-size:1.2em; font-weight:bold; ${style}">${value}</div>
    </div>`;
}

function renderProgressChart(progress) {
    const chartEl = document.getElementById('progress-chart');
    const width = chartEl.offsetWidth;
    const height = 200;
    const padding = 30;

    const points = progress.map((p, i) => ({
        x: padding + (i * (width - 2 * padding) / (progress.length > 1 ? progress.length - 1 : 1)),
        y: height - padding - (p.score * (height - 2 * padding) / 10)
    }));

    let path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    chartEl.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
            <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="black" />
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="black" />
            <path d="${path}" fill="none" stroke="blue" stroke-width="2" />
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="blue" />`).join('')}
        </svg>
    `;
}

window.openProgressForm = function(studentId, progressId = null, studentName = 'Học sinh', subject = 'Chưa rõ môn') {
    let modal = document.getElementById('progress-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'progress-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.onclick = (e) => { if(e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-box">
            <h3>${progressId ? 'Sửa' : 'Thêm'} kết quả</h3>
            <form onsubmit="saveProgress(event, '${studentId}', '${progressId}', '${studentName}', '${subject}')">
                <input type="date" id="prog-date" required>
                <input type="number" id="prog-score" min="0" max="10" step="0.1" placeholder="Điểm (0-10)" required>
                <select id="prog-type">
                    <option>Bài tập</option>
                    <option>Kiểm tra</option>
                    <option>Đề thi</option>
                    <option>Thi thử</option>
                    <option>Đánh giá năng lực</option>
                    <option>Khác</option>
                </select>
                <input type="text" id="prog-topic" placeholder="Chủ đề">
                <textarea id="prog-comment" placeholder="Nhận xét"></textarea>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button type="button" class="btn-action-cancel" onclick="document.getElementById('progress-modal').style.display='none'">Hủy</button>
                    <button type="submit" class="btn-action-save">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        Lưu
                    </button>
                </div>
            </form>
        </div>
    `;
    modal.style.display = 'flex';
};

window.saveProgress = async function(e, studentId, progressId, studentName = 'Học sinh', subject = 'Chưa rõ môn') {
    e.preventDefault();
    // Handle the "null" string passed from the template
    const actualProgressId = (progressId === 'null') ? null : progressId;

    const data = {
        student_id: studentId,
        tutor_id: activeTutorId,
        recorded_at: document.getElementById('prog-date').value,
        score: document.getElementById('prog-score').value,
        assessment_type: document.getElementById('prog-type').value,
        topic: document.getElementById('prog-topic').value,
        comment: document.getElementById('prog-comment').value
    };

    let error;
    if (actualProgressId) {
        ({ error } = await supabaseClient.from('student_progress').update(data).eq('id', actualProgressId));
    } else {
        ({ error } = await supabaseClient.from('student_progress').insert([data]));
    }

    if (error) {
        showToast('❌', 'Lỗi lưu:', error.message);
    } else {
        showToast('✅', 'Đã lưu', '');
        document.getElementById('progress-modal').style.display = 'none';

        // Refresh detail view
        await loadStudentProgressDetail(studentId, studentName, subject);
    }
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
    } else {
        showToast('✅', 'Đã xóa', '');
        await loadStudentProgressDetail(studentId, studentName, subject);
    }
};
