import { autoFixWebsiteManifest } from "./builder/autofix.js";
import { validateWebsiteManifest } from "./builder/validate.js";

function base64UrlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64Decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


/* ========================================
   JWT
======================================== */

async function verifyJWT(token, secret) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signature),
    new TextEncoder().encode(`${header}.${payload}`)
  );

  if (!valid) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload))
    );

    const now = Math.floor(Date.now() / 1000);

    if (!decoded.exp || decoded.exp < now) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}


async function getAuthenticatedUser(context) {
  const authorization = context.request.headers.get("Authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }

  return await verifyJWT(
    authorization.substring(7),
    context.env.JWT_SECRET
  );
}


/* ========================================
   DECRYPT (نفس أسلوب تشفير كلمة سر SSH)
======================================== */

async function deriveEncryptionKey(secret) {
  if (!secret) {
    throw new Error("SSH_ENCRYPTION_KEY غير مضبوط");
  }

  const secretBytes = new TextEncoder().encode(secret);

  const hash = await crypto.subtle.digest("SHA-256", secretBytes);

  return await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}


async function decryptValue(ciphertextB64, ivB64, secret) {
  const key = await deriveEncryptionKey(secret);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64Decode(ivB64) },
    key,
    base64Decode(ciphertextB64)
  );

  return new TextDecoder().decode(decrypted);
}


/* ========================================
   الإجراءات المسموح بيها للـ AI يخطط لها
   (V1: تشخيص فقط — قراءة/كتا�const ALLOWED_ACTIONS = ["diagnose", "list_files", "write_file", "write_files", "build_site", "unknown"];


/* ========================================
   POST /api/chat
   body: { message: string }
======================================== */

export async function onRequestPost(context) {
  try {
    const user = await getAuthenticatedUser(context);

    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json();
    const message = String(body?.message || "").trim();

    if (!message) {
      return Response.json({ success: false, error: "الرسالة فارغة" }, { status: 400 });
    }

    // جيب مواقع المستخدم عشان الـ AI يعرف يربط الرسالة بموقع فعلي
    const sitesResult = await context.env.DB
      .prepare(`
        SELECT id, name, hostname, public_url
        FROM sites
        WHERE user_id = ?
        ORDER BY created_at DESC
      `)
      .bind(user.sub)
      .all();

    const sites = (sitesResult.results || []).map((s) => ({
      ...s,
      check_url: s.public_url || s.hostname
    }));

    if (sites.length === 0) {
      return Response.json({
        success: true,
        action: "unknown",
        explanation: "معندكش أي موقع مضاف لسه. ضيف موقع الأول من قسم \"🌐 الموقع الحالي\" فوق."
      });
    }

    // اختيار الموقع الافتراضي: لو عنده موقع واحد بس، بنستخدمه دايمًا
    const defaultSite = sites.length === 1 ? sites[0] : null;

    const lowerMessage = message.toLowerCase();

    const listFilesKeywords = /ملف|الملفات|مجلد|فولدر|directory|files/;
    const diagnoseKeywords = /مشكل|بطء|بطيء|عطل|افحص|فحص|شخص|شغال|down|error|خطأ/;
    const writeKeywords = /اكتب|إكتب|أكتب|انشئ|أنشئ|ابن|ابني|صمم|اعمل|اضف|أضف|عدل|عدّل|احفظ|أحفظ|موقع|landing|agency|services/;

    if (defaultSite && !writeKeywords.test(lowerMessage)) {
      if (listFilesKeywords.test(lowerMessage)) {
        return Response.json({
          success: true,
          action: "list_files",
          site: { id: defaultSite.id, name: defaultSite.name, hostname: defaultSite.check_url },
          explanation: `هعرضلك قائمة الملفات والمجلدات الموجودة فعليًا على السيرفر لموقعك (${defaultSite.name}) دلوقتي.`
        });
      }

      if (diagnoseKeywords.test(lowerMessage)) {
        return Response.json({
          success: true,
          action: "diagnose",
          site: { id: defaultSite.id, name: defaultSite.name, hostname: defaultSite.check_url },
          explanation: `هعمل تشخيص فني شامل لموقعك (${defaultSite.check_url}) دلوقتي عشان أكتشف أي مشكلة أو خلل.`
        });
      }
    }

    // إعدادات AI الخاصة بالمستخدم
    let model = "openrouter/free";
    let apiKey = context.env.OPENROUTER_API_KEY;

    const settingsRow = await context.env.DB
      .prepare(`
        SELECT ai_model, openrouter_api_key_ciphertext, openrouter_api_key_iv
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .bind(user.sub)
      .first();

    if (settingsRow?.ai_model) {
      model = settingsRow.ai_model;
    }

    if (settingsRow?.openrouter_api_key_ciphertext && settingsRow?.openrouter_api_key_iv) {
      try {
        apiKey = await decryptValue(
          settingsRow.openrouter_api_key_ciphertext,
          settingsRow.openrouter_api_key_iv,
          context.env.SSH_ENCRYPTION_KEY
        );
      } catch {
        // Fallback to default
      }
    }

    if (!apiKey) {
      return Response.json(
        { success: false, error: "مفتاح الذكاء الاصطناعي غير مهيأ" },
        { status: 500 }
      );
    }

    const sitesListText = sites
      .map((s) => `- الاسم: "${s.name}" — العنوان: ${s.check_url}`)
      .join("\n");

    const prompt = `أنت مهندس ومصمم مواقع ذكي متقدم (AI Website Builder Agent) داخل نظام إدارة المواقع العربي.
تتحدث باللغة العربية الفصحى البسيطة والمهذبة فقط.

الإجراءات المتاحة للتنفيذ:
- "diagnose": فحص وتشخيص السيرفر وشهادات SSL و DNS وحالة الموقع.
- "list_files": استعراض قائمة ملفات الموقع على السيرفر.
- "write_file": كتابة أو تعديل ملف فردي محدد.
- "write_files" أو "build_site": بناء موقع متكامل احترافي متعدد الملفات (أو صفحة هبوط متكاملة) وفق المعايير العالمية.

عند طلب بناء موقع (خاصة لمجالات التسويق الرقمي، خدمات النمو، Social Media Management, SEO, UGC, Paid Ads, SaaS, أو الشركات التي تستهدف السوق الأمريكي والبريطاني US/UK):
1. صمم خطة معمارية للمشروع (Blueprint) تشمل الهوية، الجمهور، وأسماء الصفحات.
2. أنشئ هيكل ملفات متكامل يربط الصفحات ببعضها (مثال: index.html, services.html, about.html, contact.html, css/style.css, js/main.js).
3. اكتب كود HTML5 دلالي حديث بالكامل مع:
   - <meta name="viewport" content="width=device-width, initial-scale=1.0">
   - <meta name="description"> و <title> مناسب للـ SEO والتحويل
   - بيانات Schema.org بصيغة JSON-LD
   - وسوم Open Graph
   - روابط تنقل سليمة ومترابطة بين كل الصفحات
   - نصوص احترافية وعبارات دعوة للعمل (CTAs) مقنعة للعملاء في أمريكا وبريطانيا
4. اكتب تنسيقات CSS نقية وعصرية في css/style.css متجاوبة بالكامل مع الموبايل ومريحة للعين.
5. اكتب تفاعلات JS أساسية وسلسة في js/main.js.

مواقع المستخدم المسجلة:
${sitesListText}

رسالة المستخدم: "${message}"

رد بصيغة JSON فقط:
{
  "action": "diagnose" أو "list_files" أو "write_file" أو "write_files" أو "unknown",
  "site_name": "الاسم من القائمة أو null",
  "blueprint": {
    "title": "عنوان المشروع أو اسم الشركة",
    "category": "Agency / Landing Page / SaaS / Portfolio / Local",
    "target_market": "US/UK",
    "strategy": "ملخص الاستراتيجية والهوية البصرية",
    "pages": ["index.html", "services.html", "about.html", "contact.html"]
  },
  "file_path": "مسار الملف لو write_file فقط",
  "file_content": "محتوى الملف لو write_file فقط",
  "files": [
    { "file_path": "index.html", "file_content": "<!DOCTYPE html>..." },
    { "file_path": "css/style.css", "file_content": "..." },
    { "file_path": "js/main.js", "file_content": "..." }
  ],
  "explanation": "شرح استراتيجي منظم وواضح بالعربي لخطة الموقع ومكوناته."
}`;

    async function callAi(useJsonFormat) {
      return fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(45000),
          body: JSON.stringify({
            model,
            ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
            messages: [{ role: "user", content: prompt }]
          })
        }
      );
    }

    let aiResponse;
    try {
      aiResponse = await callAi(true);

      if (!aiResponse.ok) {
        aiResponse = await callAi(false);
      }
    } catch {
      return Response.json(
        { success: false, error: "انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي، حاول مرة أخرى" },
        { status: 504 }
      );
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return Response.json(
        { success: false, error: "فشل الاتصال بخدمة الذكاء الاصطناعي", details: errText },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    let plan;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      return Response.json({
        success: true,
        action: "unknown",
        explanation: "معرفتش أفهم طلبك بشكل واضح، ممكن توضح طلبك أكتر؟"
      });
    }

    let action = ALLOWED_ACTIONS.includes(plan?.action) ? plan.action : "unknown";
    if (action === "build_site") action = "write_files";

    let matchedSite = null;
    let filePath = "";
    let fileContent = "";
    let files = [];

    if (action === "diagnose" || action === "list_files" || action === "write_file" || action === "write_files") {
      if (sites.length === 1) {
        matchedSite = sites[0];
      } else {
        const requestedName = String(plan?.site_name || "").trim().toLowerCase();

        matchedSite = sites.find((s) => s.name.trim().toLowerCase() === requestedName)
          || sites.find((s) => requestedName && (
            requestedName.includes(s.name.trim().toLowerCase())
            || s.name.trim().toLowerCase().includes(requestedName)
          ))
          || sites[0] || null;
      }

      if (!matchedSite) {
        action = "unknown";
      }

      if (action === "write_file") {
        filePath = String(plan?.file_path || "").trim();
        fileContent = typeof plan?.file_content === "string" ? plan.file_content : "";

        if (!filePath || !fileContent) {
          action = "unknown";
        }
      }

      if (action === "write_files") {
        const rawFiles = Array.isArray(plan?.files) ? plan.files : [];

        files = rawFiles
          .map((f) => ({
            path: String(f?.file_path || f?.path || "").trim(),
            content: typeof f?.file_content === "string" ? f.file_content : (typeof f?.content === "string" ? f.content : "")
          }))
          .filter((f) => f.path && f.content && !f.path.split("/").includes(".."));

        if (files.length === 0) {
          action = "unknown";
        } else {
          // Auto-fix and validate generated files automatically
          const autofixResult = autoFixWebsiteManifest(files);
          files = autofixResult.fixedFiles.map((f) => ({
            file_path: f.path,
            file_content: f.content
          }));
        }
      }
    }

    const validationSummary = files.length > 0 ? validateWebsiteManifest(files.map(f => ({ path: f.file_path, content: f.file_content }))) : null;

    return Response.json({
      success: true,
      action,
      site: matchedSite ? { id: matchedSite.id, name: matchedSite.name, hostname: matchedSite.check_url } : null,
      blueprint: plan?.blueprint || null,
      file_path: action === "write_file" ? filePath : null,
      file_content: action === "write_file" ? fileContent : null,
      files: action === "write_files" ? files : null,
      validation: validationSummary,
      explanation: String(plan?.explanation || "").trim() || "تمام، جاهز أنفّذ لك خطة الموقع."
    });
  } catch (error) {
    return Response.json(
      { success: false, error: "حدث خطأ أثناء معالجة الرسالة", details: error.message },
      { status: 500 }
    );
  }
}