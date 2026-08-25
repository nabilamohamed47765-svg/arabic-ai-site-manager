function base64UrlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/* ========================================
   JWT
======================================== */

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

/* ========================================
   ENCRYPTION
======================================== */

async function deriveEncryptionKey(secret) {
  if (!secret) throw new Error("SSH_ENCRYPTION_KEY غير مضبوط");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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

const SUPPORTED_PROVIDERS = [
  { id: "gemini", name: "Google Gemini (AI Studio)", defaultModel: "gemini-2.0-flash", defaultUrl: "https://generativelanguage.googleapis.com" },
  { id: "openrouter", name: "OpenRouter", defaultModel: "google/gemini-2.0-flash-001", defaultUrl: "https://openrouter.ai/api/v1" },
  { id: "openai", name: "OpenAI / Compatible API", defaultModel: "gpt-4o-mini", defaultUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic Claude", defaultModel: "claude-3-5-haiku-20241022", defaultUrl: "https://api.anthropic.com/v1" },
  { id: "custom", name: "Custom API Endpoint", defaultModel: "custom-model", defaultUrl: "" }
];

const PRESET_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "google/gemini-2.0-flash-001",
  "openrouter/free",
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "gpt-4o-mini",
  "claude-3-5-haiku-20241022"
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
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .bind(user.sub)
      .first();

    return Response.json({
      success: true,
      ai_provider: row?.ai_provider || "openrouter",
      ai_base_url: row?.ai_base_url || "",
      ai_model: row?.ai_model || "google/gemini-2.0-flash-001",
      ai_temperature: typeof row?.ai_temperature === "number" ? row?.ai_temperature : 0.7,
      ai_max_tokens: row?.ai_max_tokens || 4000,
      has_custom_api_key: !!row?.openrouter_api_key_ciphertext,
      supported_providers: SUPPORTED_PROVIDERS,
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

    if (typeof body.ai_provider === "string" && body.ai_provider.trim()) {
      updates.push("ai_provider = ?");
      values.push(body.ai_provider.trim().toLowerCase());
    }

    if (typeof body.ai_base_url === "string") {
      updates.push("ai_base_url = ?");
      values.push(body.ai_base_url.trim());
    }

    if (typeof body.ai_model === "string" && body.ai_model.trim()) {
      updates.push("ai_model = ?");
      values.push(body.ai_model.trim());
    }

    if (typeof body.ai_temperature === "number") {
      updates.push("ai_temperature = ?");
      values.push(Math.max(0, Math.min(2, body.ai_temperature)));
    }

    if (typeof body.ai_max_tokens === "number") {
      updates.push("ai_max_tokens = ?");
      values.push(Math.max(100, Math.min(32000, body.ai_max_tokens)));
    }

    const apiKey = body.api_key || body.openrouter_api_key;
    if (typeof apiKey === "string" && apiKey.trim()) {
      const encryptionSecret = context.env.SSH_ENCRYPTION_KEY;
      if (!encryptionSecret) {
        return Response.json(
          { error: "SSH_ENCRYPTION_KEY غير مضبوط في Cloudflare" },
          { status: 500 }
        );
      }

      const encrypted = await encryptValue(apiKey.trim(), encryptionSecret);
      updates.push("openrouter_api_key_ciphertext = ?");
      values.push(encrypted.ciphertext);
      updates.push("openrouter_api_key_iv = ?");
      values.push(encrypted.iv);
    }

    if (updates.length === 0) {
      return Response.json(
        { error: "لم يتم إرسال أي تعديل للإعدادات" },
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
      message: "تم حفظ إعدادات الذكاء الاصطناعي بنجاح"
    });
  } catch (error) {
    return Response.json(
      { error: "حدث خطأ أثناء حفظ الإعدادات", details: error.message },
      { status: 500 }
    );
  }
}
