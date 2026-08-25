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

function base64Encode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
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
   ENCRYPTION (نفس أسلوب تشفير كلمة سر SSH)
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


async function encryptValue(value, secret) {
  const key = await deriveEncryptionKey(secret);

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  );

  return {
    ciphertext: base64Encode(new Uint8Array(encrypted)),
    iv: base64Encode(iv)
  };
}


/* ========================================
   قائمة الموديلات المسموحة كاختيار جاهز
   (المستخدم يقدر برضه يكتب موديل تاني يدوي)
======================================== */

const PRESET_MODELS = [
  "openrouter/free",
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001"
];


/* ========================================
   GET /api/settings
======================================== */

export async function onRequestGet(context) {
  try {
    const user = await getAuthenticatedUser(context);

    if (!user) {
      return Response.json({ error: "غير مصرح" }, { status: 401 });
    }

    const row = await context.env.DB
      .prepare(`
        SELECT ai_model, openrouter_api_key_ciphertext
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .bind(user.sub)
      .first();

    return Response.json({
      success: true,
      ai_model: row?.ai_model || "openrouter/free",
      has_custom_api_key: !!row?.openrouter_api_key_ciphertext,
      preset_models: PRESET_MODELS
    });
  } catch (error) {
    return Response.json(
      { error: "حدث خطأ أثناء جلب الإعدادات", details: error.message },
      { status: 500 }
    );
  }
}


/* ========================================
   POST /api/settings
   body: { ai_model?: string, openrouter_api_key?: string }
   (ابعت أي واحد فيهم بس، مش لازم الاتنين مع بعض)
======================================== */

export async function onRequestPost(context) {
  try {
    const user = await getAuthenticatedUser(context);

    if (!user) {
      return Response.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json();

    const updates = [];
    const values = [];

    if (typeof body.ai_model === "string" && body.ai_model.trim()) {
      updates.push("ai_model = ?");
      values.push(body.ai_model.trim());
    }

    if (typeof body.openrouter_api_key === "string" && body.openrouter_api_key.trim()) {
      const encryptionSecret = context.env.SSH_ENCRYPTION_KEY;

      if (!encryptionSecret) {
        return Response.json(
          { error: "SSH_ENCRYPTION_KEY غير مضبوط في Cloudflare" },
          { status: 500 }
        );
      }

      const encrypted = await encryptValue(
        body.openrouter_api_key.trim(),
        encryptionSecret
      );

      updates.push("openrouter_api_key_ciphertext = ?");
      values.push(encrypted.ciphertext);

      updates.push("openrouter_api_key_iv = ?");
      values.push(encrypted.iv);
    }

    if (updates.length === 0) {
      return Response.json(
        { error: "لم يتم إرسال أي تعديل (ai_model أو openrouter_api_key)" },
        { status: 400 }
      );
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(user.sub);

    await context.env.DB
      .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    return Response.json({
      success: true,
      message: "تم حفظ الإعدادات بنجاح"
    });
  } catch (error) {
    return Response.json(
      { error: "حدث خطأ أثناء حفظ الإعدادات", details: error.message },
      { status: 500 }
    );
  }
}