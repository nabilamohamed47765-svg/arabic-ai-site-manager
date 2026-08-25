import { autoFixWebsiteManifest } from "./builder/autofix.js";
import { validateWebsiteManifest } from "./builder/validate.js";
import { callAIProvider } from "./ai/provider.js";
import { auditPageSEO } from "./builder/seo.js";
import { auditPerformance } from "./builder/performance.js";

function base64UrlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signature),
    new TextEncoder().encode(`${header}.${payload}`)
  );

  if (!valid) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(context) {
  const authorization = context.request.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  return await verifyJWT(authorization.substring(7), context.env.JWT_SECRET);
}

async function deriveEncryptionKey(secret) {
  if (!secret) throw new Error("SSH_ENCRYPTION_KEY غير مضبوط");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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

export async function onRequestPost(context) {
  try {
    const user = await getAuthenticatedUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json().catch(() => ({}));
    const message = String(body?.message || "").trim();

    if (!message) {
      return Response.json({ success: false, error: "الرسالة فارغة" }, { status: 400 });
    }

    // 1. Fetch user's registered sites
    const sitesResult = await context.env.DB
      .prepare(`
        SELECT id, name, hostname, public_url, working_directory, framework, project_manifest
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
        explanation: "لم يتم العثور على مواقع مضافة في حسابك حتى الآن. يرجى إضافة موقع أولاً من تبويب '🌐 المواقع'."
      });
    }

    const defaultSite = sites.length === 1 ? sites[0] : null;
    const lowerMessage = message.toLowerCase();

    // Fast keyword routing
    const listFilesKeywords = /ملف|الملفات|مجلد|فولدر|directory|files/;
    const diagnoseKeywords = /مشكل|بطء|بطيء|عطل|افحص|فحص|شخص|شغال|down|error|خطأ/;
    const writeKeywords = /اكتب|إكتب|أكتب|انشئ|أنشئ|ابن|ابني|صمم|اعمل|اضف|أضف|عدل|عدّل|احفظ|أحفظ|موقع|landing|agency|services|seo|سيو|سرعة/;

    if (defaultSite && !writeKeywords.test(lowerMessage)) {
      if (listFilesKeywords.test(lowerMessage)) {
        return Response.json({
          success: true,
          action: "list_files",
          safety_level: "SAFE",
          site: { id: defaultSite.id, name: defaultSite.name, hostname: defaultSite.check_url },
          explanation: `سأقوم باستعراض قائمة الملفات والمجلدات الموجودة على الخادم لموقعك (${defaultSite.name}).`
        });
      }

      if (diagnoseKeywords.test(lowerMessage)) {
        return Response.json({
          success: true,
          action: "diagnose",
          safety_level: "SAFE",
          site: { id: defaultSite.id, name: defaultSite.name, hostname: defaultSite.check_url },
          explanation: `سأجري فحصاً تشخيصياً شاملاً لموقعك (${defaultSite.check_url}) لرصد الأداء وشهادات SSL واستجابة الخادم.`
        });
      }
    }

    // 2. Fetch User AI Settings & Decrypt API Key
    let provider = "openrouter";
    let baseUrl = "";
    let model = "google/gemini-2.0-flash-001";
    let temperature = 0.7;
    let maxTokens = 4000;
    let apiKey = context.env.OPENROUTER_API_KEY;

    const settingsRow = await context.env.DB
      .prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .bind(user.sub)
      .first();

    if (settingsRow) {
      if (settingsRow.ai_provider) provider = settingsRow.ai_provider;
      if (settingsRow.ai_base_url) baseUrl = settingsRow.ai_base_url;
      if (settingsRow.ai_model) model = settingsRow.ai_model;
      if (typeof settingsRow.ai_temperature === "number") temperature = settingsRow.ai_temperature;
      if (settingsRow.ai_max_tokens) maxTokens = settingsRow.ai_max_tokens;

      if (settingsRow.openrouter_api_key_ciphertext && settingsRow.openrouter_api_key_iv && context.env.SSH_ENCRYPTION_KEY) {
        try {
          apiKey = await decryptValue(
            settingsRow.openrouter_api_key_ciphertext,
            settingsRow.openrouter_api_key_iv,
            context.env.SSH_ENCRYPTION_KEY
          );
        } catch {}
      }
    }

    if (!apiKey) {
      if (provider === "gemini" && context.env.GEMINI_API_KEY) {
        apiKey = context.env.GEMINI_API_KEY;
      } else if (provider === "openrouter" && context.env.OPENROUTER_API_KEY) {
        apiKey = context.env.OPENROUTER_API_KEY;
      }
    }

    if (!apiKey) {
      return Response.json(
        { success: false, error: "مفتاح الذكاء الاصطناعي غير مهيأ. يرجى إضافته من إعدادات الذكاء الاصطناعي." },
        { status: 400 }
      );
    }

    const sitesListText = sites
      .map((s) => `- الاسم: "${s.name}" — العنوان: ${s.check_url} — البيئة: ${s.framework || "غير محدد"}`)
      .join("\n");

    const systemPrompt = `أنت مهندس ومصمم ومسؤول مواقع ذكي وخبير تقني (AI Senior Website Engineer & Technical Partner) داخل منصة Arabic AI Site Manager.
تتحدث باللغة العربية بأسلوب راقٍ، مهني، متعاون، وذكي، مع استخدام المصطلحات التقنية الإنجليزية داخل الكود والمسارات.

مبادئك الأساسية:
1. التفكير النقدي: لا تنفذ الأوامر بشكل أعمى، بل اقترح تحسينات هيكلية (SEO, Conversion, Performance, Security)، وناقش المفاضلات (Trade-offs)، واعرض خطة واضحة قبل طلب التعديل.
2. تصنيف العمليات:
   - "SAFE": القراءة، الفحص، تدقيق SEO، قياس الأداء.
   - "REVIEW REQUIRED": كتابة أو تعديل ملفات HTML/CSS/JS، إضافة صفحات جديدة، تعديل الـ Manifest.
   - "HIGH RISK": الحذف الجماعي، تعديل قواعد البيانات الحساسة أو التهيئات الجذرية.
3. التوافق متعدد الأطر (Framework Agnostic): فهم كامل لأطر العمل المختلفة (Static, React, Next.js, Vue, Nuxt, Laravel, WordPress, Astro, Node.js).
4. المعايير الاحترافية لإنشاء المواقع:
   - كتابة كود HTML5 دلالي متجاوب مع الموبايل بالكامل (<meta name="viewport" content="width=device-width, initial-scale=1.0">).
   - توفير وسم Canonical و OpenGraph كامل وبيانات Schema.org المنظمة بصيغة JSON-LD.
   - تنسيقات CSS نقية وعصرية في css/style.css مع ألوان متباينة ومساحات مريحة.
   - سكربتات JS غير حاجزة للرسم في js/main.js.

مواقع المستخدم المسجلة:
${sitesListText}

رد بصيغة JSON حصراً بالهيكل التالي:
{
  "action": "diagnose" | "list_files" | "scan_site" | "audit_seo" | "audit_performance" | "write_file" | "write_files" | "build_site" | "unknown",
  "safety_level": "SAFE" | "REVIEW REQUIRED" | "HIGH RISK",
  "site_name": "اسم الموقع المستهدف من القائمة أو null",
  "blueprint": {
    "title": "عنوان المشروع أو الصفحة",
    "category": "Agency / SaaS / E-Commerce / Landing / Portfolio / Blog",
    "target_market": "US/UK / Global / Local",
    "strategy": "ملخص الاستراتيجية والهوية البصرية ونية البحث",
    "pages": ["index.html", "services.html", "about.html", "contact.html"]
  },
  "diffs": [
    {
      "file_path": "index.html",
      "summary": "إضافة وسم Canonical و وسوم OpenGraph المنظمة",
      "original_snippet": "...",
      "new_snippet": "..."
    }
  ],
  "file_path": "مسار الملف الفردي إذا كان write_file فقط",
  "file_content": "محتوى الملف الفردي إذا كان write_file فقط",
  "files": [
    { "file_path": "index.html", "file_content": "<!DOCTYPE html>..." },
    { "file_path": "css/style.css", "file_content": "..." },
    { "file_path": "js/main.js", "file_content": "..." }
  ],
  "explanation": "شرح استراتيجي وتحليلي وافٍ بالعربية يوضح المشكلة، الحل، التأثير المتوقع، والخطوات التالية."
}`;

    const aiResult = await callAIProvider({
      provider,
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      systemPrompt,
      userPrompt: `رسالة المستخدم:\n"${message}"`,
      jsonMode: true,
      timeoutMs: 55000
    });

    let plan = aiResult.parsedJson;
    if (!plan && aiResult.rawText) {
      try {
        const jsonMatch = aiResult.rawText.match(/\{[\s\S]*\}/);
        plan = JSON.parse(jsonMatch ? jsonMatch[0] : aiResult.rawText);
      } catch {}
    }

    if (!plan || typeof plan !== "object") {
      return Response.json({
        success: true,
        action: "unknown",
        safety_level: "SAFE",
        explanation: aiResult.rawText || "تم استلام الرد من الذكاء الاصطناعي بنجاح."
      });
    }

    // Find matched site
    let matchedSite = defaultSite;
    if (plan.site_name) {
      matchedSite = sites.find((s) => s.name.toLowerCase() === plan.site_name.toLowerCase()) || matchedSite;
    }

    const responsePayload = {
      success: true,
      action: plan.action || "unknown",
      safety_level: plan.safety_level || (plan.action === "write_files" || plan.action === "write_file" ? "REVIEW REQUIRED" : "SAFE"),
      site: matchedSite ? { id: matchedSite.id, name: matchedSite.name, hostname: matchedSite.check_url } : null,
      explanation: plan.explanation || "تم تجهيز الخطة الهندسية للموقع.",
      blueprint: plan.blueprint || null,
      diffs: plan.diffs || []
    };

    // If multi-file generation requested, run Autofix & Validation
    if ((plan.action === "write_files" || plan.action === "build_site") && Array.isArray(plan.files) && plan.files.length > 0) {
      const fixedResult = autoFixWebsiteManifest(plan.files);
      const validation = validateWebsiteManifest(fixedResult.fixedFiles);

      responsePayload.files = fixedResult.fixedFiles;
      responsePayload.autofix_logs = fixedResult.repairLogs;
      responsePayload.validation = {
        score: validation.score,
        status: validation.status,
        isValid: validation.isValid,
        warnings: validation.warnings,
        errors: validation.errors,
        passed: validation.passed
      };
    } else if (plan.action === "write_file" && plan.file_path && plan.file_content) {
      responsePayload.file_path = plan.file_path;
      responsePayload.file_content = plan.file_content;
    }

    return Response.json(responsePayload);
  } catch (error) {
    return Response.json(
      { success: false, error: "حدث خطأ أثناء معالجة المحادثة", details: error.message },
      { status: 500 }
    );
  }
}
