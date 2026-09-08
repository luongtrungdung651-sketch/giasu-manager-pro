// ===== CORE: UTILS (tách từ index.html — STEP 7B) =====
// Các hàm helper thuần (pure), không phụ thuộc bất kỳ feature nào (calendar/students/
// lessons/finance/reports/admin). Chỉ nhận input, trả output — không đọc/ghi state
// của feature nào.

export function escapeHtml(str) {
    var d = document.createElement('div');
    d.innerText = str;
    return d.innerHTML;
}

// Helper dùng chung cho các bảng thống kê Admin (theo Tutor / theo Học sinh) — trước đây mỗi
// bảng tự khai báo riêng, nay gộp lại MỘT bản duy nhất để tránh duplicate function.
export function money(n) { return n.toLocaleString('vi-VN') + ' đ'; }
export function remainingColor(n) { return n > 0 ? '#f472b6' : '#10b981'; }
export function rowHtml(cols) { return '<tr>' + cols.map(function(c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }

export function formatDate(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T00:00:00');
    var days = ['CN','T2','T3','T4','T5','T6','T7'];
    return days[d.getDay()] + ' ' + d.toLocaleDateString('vi-VN');
}

export function getLocalIsoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function timeToFloat(timeStr) {
    var parts = timeStr.split(':');
    return parseInt(parts[0]) + (parseInt(parts[1]) / 60);
}

// Expose tối thiểu qua window để script chính (classic script) gọi được như trước khi
// tách — độc lập với toast.js/supabase.js, một module lỗi không ảnh hưởng module còn lại.
window.escapeHtml = escapeHtml;
window.money = money;
window.remainingColor = remainingColor;
window.rowHtml = rowHtml;
window.formatDate = formatDate;
window.getLocalIsoDate = getLocalIsoDate;
window.timeToFloat = timeToFloat;
