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
   (V1: تشخيص فقط — قراءة/كتابة تُضاف لاحقًا كخطوات منفصلة)
======================================== */

const ALLOWED_ACTIONS = ["diagnose", "unknown"];


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
        SELECT id, name, hostname
        FROM sites
        WHERE user_id = ?
        ORDER BY created_at DESC
      `)
      .bind(user.sub)
      .all();

    const sites = sitesResult.results || [];

    if (sites.length === 0) {
      return Response.json({
        success: true,
        action: "unknown",
        explanation: "معندكش أي موقع مضاف لسه. ضيف موقع الأول من قسم \"🌐 الموقع الحالي\" فوق."
      });
    }

    // إعدادات AI الخاصة بالمستخدم (نفس أسلوب ai-diagnose.js)
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
        // نفضل نستخدم مفتاح Cloudflare الافتراضي لو فشل فك التشفير
      }
    }

    if (!apiKey) {
      return Response.json(
        { success: false, error: "مفتاح الذكاء الاصطناعي غير مهيأ" },
        { status: 500 }
      );
    }

    const sitesListText = sites
      .map((s) => `- الاسم: "${s.name}" — العنوان: ${s.hostname}`)
      .join("\n");

    const prompt = `أنت مساعد داخل تطبيق إدارة مواقع، بتتكلم مع مستخدم غير تقني بالعربي.
الإجراءات المتاحة حاليًا للتنفيذ (V1) هي إجراء واحد بس:
- "diagnose": تشخيص فني تلقائي بالذكاء الاصطناعي لموقع معين (يفحص HTTP/DNS/TLS ويطلع مشكلة محتملة وخطوات).

مواقع المستخدم المسجلة:
${sitesListText}

رسالة المستخدم: "${message}"

مهمتك: افهم قصد المستخدم. لو طلبه يتماشى مع تشخيص موقع (مشكلة، بطء، عطل، "افحصلي"، "شخصلي"، أو أي طلب عام عن حالة الموقع)، اختار الموقع الأنسب من القائمة (لو ذكر اسمه أو جزء منه، أو لو عنده موقع واحد بس استخدمه تلقائيًا).
لو طلبه مش متعلق بتشخيص موقع، أو مش واضح أي موقع يقصد ومعندوش موقع واحد بس، رجّع action = "unknown" مع توضيح ودود بالعربي في explanation ليه معرفتش تنفذ الطلب أو محتاج توضيح إيه بالظبط.

رد بصيغة JSON فقط بدون أي نص إضافي، بالشكل ده بالظبط:
{
  "action": "diagnose" أو "unknown",
  "site_hostname": "hostname الموقع المختار أو null",
  "explanation": "شرح قصير وودود بالعربي لخطتك، مثلاً: هعمل تشخيص فني لموقعك (fulan.com) دلوقتي. لو action=unknown يبقى فيه شرح ليه"
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
        explanation: "معرفتش أفهم طلبك بشكل واضح، ممكن تعيد صياغته؟"
      });
    }

    let action = ALLOWED_ACTIONS.includes(plan?.action) ? plan.action : "unknown";
    let matchedSite = null;

    if (action === "diagnose" && plan?.site_hostname) {
      matchedSite = sites.find((s) => s.hostname === plan.site_hostname) || null;

      if (!matchedSite) {
        action = "unknown";
      }
    }

    return Response.json({
      success: true,
      action,
      site: matchedSite ? { id: matchedSite.id, name: matchedSite.name, hostname: matchedSite.hostname } : null,
      explanation: String(plan?.explanation || "").trim() || "تمام، جاهز أنفّذ."
    });
  } catch (error) {
    return Response.json(
      { success: false, error: "حدث خطأ أثناء معالجة الرسالة", details: error.message },
      { status: 500 }
    );
  }
}
