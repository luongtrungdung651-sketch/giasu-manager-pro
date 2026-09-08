// ===== CORE: SUPABASE CLIENT (tách từ index.html — STEP 7B) =====
// Nguồn duy nhất khởi tạo Supabase client cho toàn app. Mọi module/feature khác
// PHẢI import supabaseClient từ đây, KHÔNG được tự tạo thêm client thứ hai.
import { showToast } from './toast.js';

// Lấy Project URL và anon/publishable key tại: Supabase Dashboard > Project Settings > API
const SUPABASE_URL = 'https://iixfpbaxlnnouifwgeni.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_X1KX1_N7xZf5O8GRUSznBg_LWEOkZcN';

export const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// Expose tối thiểu qua window để script chính (classic script) gọi được như trước khi
// tách. Nếu dòng createClient() ở trên throw (VD: CDN supabase-js load lỗi), module
// này dừng tại đây đúng như bản gốc (nơi supabaseClient trước đây cũng throw ở đúng vị
// trí tương đương) — nhưng vì escapeHtml/formatDate/showToast/... nằm ở module RIÊNG
// (utils.js/toast.js), chúng vẫn được expose bình thường, không bị kéo theo lỗi này.
window.supabaseClient = supabaseClient;

console.log('GiaSu Manager: Supabase loaded');
console.log('Supabase client:', supabaseClient);

// ===== AUTH 2.0 mục 17: MỘT listener onAuthStateChange DUY NHẤT cho toàn app =====
// KHÔNG tạo thêm listener nào khác ở nơi khác — tránh duplicate/gọi load data vô hạn.
// Ở đây xử lý: (1) PASSWORD_RECOVERY — mở modal đặt mật khẩu mới khi user bấm link
// trong email reset; (2) SIGNED_IN kèm type=signup trong URL hash — chỉ để hiện toast
// "Email đã xác minh", KHÔNG điều hướng/tạo session. Việc điều hướng vào dashboard cho
// mọi trường hợp SIGNED_IN (login thường, verify xong, F5) vẫn do doLogin()/
// restoreSupabaseSessionIfAny() đảm nhiệm tường minh tại đúng nơi gọi — không lặp lại
// logic đó ở đây.
supabaseClient.auth.onAuthStateChange(function(event, session) {
    console.log('[AUTH STATE CHANGE]', event);
    if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('reset-password-modal').classList.add('open');
    }
    // Mục 6/7: user vừa bấm link xác minh email trong đăng ký (KHÔNG phải reset mật
    // khẩu, KHÔNG phải F5 phiên cũ) — supabase-js tự parse hash & tự đăng nhập, fire
    // SIGNED_IN. Nhận diện đúng trường hợp này bằng "type=signup" mà Supabase gắn vào
    // hash khi redirect về, rồi CHỈ hiển thị toast xác nhận — không tự điều hướng/tạo
    // session ở đây (restoreSupabaseSessionIfAny() ở DOMContentLoaded đã lo phần đó,
    // tránh trùng lặp logic với listener duy nhất này).
    if (event === 'SIGNED_IN') {
        var hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        if (hashParams.get('type') === 'signup') {
            showToast('🎉', 'Email đã được xác minh!', 'Tài khoản của bạn đã được kích hoạt.');
            // Xoá token nhạy cảm khỏi URL sau khi supabase-js đã xử lý xong, không phá session.
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }
});

(async () => {
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('id, name, subject')
            .limit(1);
        if (error) {
            console.error('Supabase database test FAILED:', error);
            return;
        }
        console.log('Supabase database test SUCCESS:', data);
    } catch (err) {
        console.error('Supabase database test ERROR:', err);
    }
})();
