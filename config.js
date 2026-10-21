// ملف الإعدادات - ارفعه على GitHub باسم: config.js (بجوار index.html و portal.js و conferences.js و logo.png)
// ضع هنا رابط الـ Web App المنتهي بـ /exec، وهو المكان الوحيد اللي تعدّله لما الرابط يتغير.
// الرابط بيفضل ثابت لو حدّثت الكود بـ: Deploy > Manage deployments > ✏️ > Version: New version > Deploy
// (وليس Deploy > New deployment اللي بيطلّع رابط جديد كل مرة).
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxw0EJx2ZA_AyQw_TNW-se_24Dv5HHQM493efIdZ76jKneo4oqL82UF5BXPx_dLX4o3/exec'

  // ---- اختياري: الشعار ----
  // الموقع بيدوّر على الشعار بالترتيب ده: LOGO_URL (لو كتبته) ← ملف logo.png جنب index.html ← صورة Drive الجاهزة.
  // الأفضل ترفع الشعار على GitHub باسم logo.png بجوار index.html (أسرع، وبيشتغل على كارت الـ ID).
  // , LOGO_URL: 'logo.png'
  // , LOGO_DRIVE_ID: '1uRKg8J3YMz16hdAVGBGCWUV3c-S0CF3g'   // لازم الملف يكون مشارك: Anyone with the link

  // ---- اختياري: ألوان الموقع (الافتراضي مأخوذ من الشعار) ----
  // , COLORS: { brown: '#3c2412', brown2: '#6b4426', gold: '#c38622', goldDark: '#96601a', gold2: '#e6c37a' }
};
