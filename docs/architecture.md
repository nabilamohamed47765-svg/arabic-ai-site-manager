# البنية المعمارية

GitHub (مصدر الكود)
  → GitHub Actions (يشغّل Wrangler عند كل push إلى main)
  → Cloudflare Pages/Workers (Frontend + API + D1) — نشر مباشر عبر API Token، بدون ربط Git داخل Cloudflare
  → GitHub Actions (تنفيذ SSH لاحقًا، عند الطلب فقط، عبر Secrets مشفرة)
  → مواقع المستخدم عبر SSH
  → رجوع النتائج إلى Cloudflare (D1) وعرضها في الشات

## القرارات
- النشر يتم عبر GitHub Actions + Wrangler (وليس ميزة "Connect to Git" في Cloudflare)،
  بسبب خلل معروف حاليًا في تدفق ربط GitHub داخل واجهة Cloudflare. هذا الأسلوب أكثر استقرارًا
  ويجعل GitHub فعليًا هو المصدر الوحيد للتحكم في النشر.
- SSH لا يُنفَّذ داخل Cloudflare Worker مباشرة (بروتوكول SSH غير مدعوم عمليًا هناك)،
  بل عبر GitHub Actions لاحقًا لأنه بيئة تحتوي SSH client جاهز وتُشغَّل عند الطلب فقط (بدون VPS دائم).
- قاعدة البيانات: Cloudflare D1 (مجاني).
- المصادقة: JWT مبني يدويًا داخل D1.
- مزود الذكاء الاصطناعي: OpenRouter خلف واجهة قابلة للتبديل.
