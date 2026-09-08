// ===== CORE: TOAST (tách từ index.html — STEP 7B) =====
// Toast notification dùng chung cho toàn app (auth, students, lessons, finance,
// reports, admin...). Chỉ thao tác trên #toast-container — không có logic riêng
// của bất kỳ feature nào.

export function showToast(icon, title, msg, duration) {
    var toast = document.getElementById('toast-container');
    toast.querySelector('.toast-icon').innerText = icon;
    toast.querySelector('.toast-text strong').innerText = title;
    toast.querySelector('.toast-text span').innerText = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, duration || 3500);
}

// Expose tối thiểu qua window để script chính (classic script, không phải module) gọi
// được như trước khi tách — độc lập với utils.js/supabase.js, một module lỗi không
// ảnh hưởng module còn lại (giống hệt tính chất "mỗi function declaration độc lập"
// của bản gốc trước khi tách).
window.showToast = showToast;
