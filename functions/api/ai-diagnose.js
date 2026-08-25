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
   POST /api/ai-diagnose
======================================== */

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { hostname } = body || {};

    if (!hostname || typeof hostname !== "string") {
      return Response.json(
        { success: false, error: "hostname مطلوب" },
        { status: 400 }
      );
    }

    // الإعدادات الافتراضية (لو مفيش مستخدم مسجل دخول أو مفيش إعدادات محفوظة)
    let model = "openrouter/free";
    let apiKey = context.env.OPENROUTER_API_KEY;

    const user = await getAuthenticatedUser(context);

    if (user) {
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
          // لو فشل فك التشفير لأي سبب، نفضل نستخدم مفتاح Cloudflare الافتراضي
        }
      }
    }

    if (!apiKey) {
      return Response.json(
        { success: false, error: "مفتاح الذكاء الاصطناعي غير مهيأ" },
        { status: 500 }
      );
    }

    const cleanHost = hostname
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    const healthUrl = new URL(context.request.url);
    healthUrl.pathname = "/api/health-check-all";

    const healthResponse = await fetch(healthUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: cleanHost })
    });

    const healthData = await healthResponse.json();

    // فحص حتمي (مش معتمد على تفسير الـ AI): أي كود HTTP خارج نطاق 200-299
    // يُعتبر مشكلة، حتى لو السيرفر "بيرد" (reachable=true). ده بيمنع إن
    // موديل ضعيف يفوّت 403/404/500 لمجرد إن فيه استجابة من السيرفر.
    const statusCode = healthData?.http?.status_code;
    const httpStatusIsProblem =
      healthData?.http?.reachable === true &&
      typeof statusCode === "number" &&
      (statusCode < 200 || statusCode >= 400);

    const statusHint = httpStatusIsProblem
      ? `\n\nملحوظة إلزامية: الموقع رجّع كود HTTP رقم ${statusCode}. أي كود خارج نطاق 200-299 هو مشكلة فعلية يجب ذكرها في "problem" حتى لو السيرفر رد (reachable=true) — رد الخطأ نفسه هو الدليل على المشكلة، ماتقولش "لا توجد مشكلة" في الحالة دي.`
      : "";

    const prompt = `أنت مساعد فني لإدارة السيرفرات. ردك لازم يكون بالكامل بالعربية الفصحى البسيطة فقط، ممنوع أي حروف لاتينية أو ترجمة صوتية. لديك نتائج فحص تقني للموقع "${cleanHost}":

${JSON.stringify(healthData, null, 2)}${statusHint}

حلل النتائج وأعد ردك بصيغة JSON فقط بدون أي نص إضافي، بهذا الشكل بالضبط:
{
  "problem": "وصف مختصر للمشكلة الرئيسية إن وجدت، أو 'لا توجد مشكلة' إن كان كل شيء سليمًا",
  "likely_cause": "السبب المحتمل بالعربي",
  "suggested_steps": ["خطوة 1", "خطوة 2"]
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
    } catch (timeoutError) {
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

    let diagnosis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      diagnosis = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      diagnosis = {
        problem: "تعذر تفسير رد الذكاء الاصطناعي",
        likely_cause: null,
        suggested_steps: [],
        raw: rawText
      };
    }

    // شبكة أمان: لو فيه كود HTTP مشكلة فعليًا بس الموديل الضعيف قال
    // "لا توجد مشكلة" برضه، نصحح الرد بدل ما نصدّق الموديل على طول.
    if (httpStatusIsProblem && /لا توجد مشكلة|لا يوجد مشكل/.test(diagnosis?.problem || "")) {
      diagnosis.problem = `الموقع يرجع كود HTTP رقم ${statusCode} بدل صفحة سليمة`;
      diagnosis.likely_cause = diagnosis.likely_cause || "الصفحة الرئيسية غير متاحة أو الصلاحيات/الملفات ناقصة على السيرفر";
      if (!Array.isArray(diagnosis.suggested_steps) || diagnosis.suggested_steps.length === 0) {
        diagnosis.suggested_steps = ["تأكد من وجود ملفات الموقع في المجلد الصحيح على السيرفر عبر SSH", "تأكد من صلاحيات المجلد والملفات"];
      }
    }

    return Response.json({
      success: true,
      hostname: cleanHost,
      health: healthData,
      diagnosis
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
