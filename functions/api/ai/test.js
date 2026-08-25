import { callAIProvider } from "./provider.js";

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
  try {
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
    let provider = String(body.provider || "").trim().toLowerCase();
    let baseUrl = String(body.base_url || body.baseUrl || "").trim();
    let model = String(body.model || "").trim();
    let apiKey = String(body.api_key || body.apiKey || "").trim();

    // If apiKey is not provided in body, load from user's encrypted settings
    if (!apiKey) {
      const row = await context.env.DB
        .prepare(`
          SELECT ai_provider, ai_base_url, ai_model, openrouter_api_key_ciphertext, openrouter_api_key_iv
          FROM users
          WHERE id = ?
          LIMIT 1
        `)
        .bind(user.sub)
        .first();

      if (row) {
        if (!provider && row.ai_provider) provider = row.ai_provider;
        if (!baseUrl && row.ai_base_url) baseUrl = row.ai_base_url;
        if (!model && row.ai_model) model = row.ai_model;

        if (row.openrouter_api_key_ciphertext && row.openrouter_api_key_iv && context.env.SSH_ENCRYPTION_KEY) {
          try {
            apiKey = await decryptValue(
              row.openrouter_api_key_ciphertext,
              row.openrouter_api_key_iv,
              context.env.SSH_ENCRYPTION_KEY
            );
          } catch {}
        }
      }
    }

    // Default fallbacks if empty
    if (!provider) provider = "openrouter";
    if (!apiKey) {
      if (provider === "openrouter" && context.env.OPENROUTER_API_KEY) {
        apiKey = context.env.OPENROUTER_API_KEY;
      } else if (provider === "gemini" && context.env.GEMINI_API_KEY) {
        apiKey = context.env.GEMINI_API_KEY;
      }
    }

    if (!apiKey) {
      return Response.json({
        success: false,
        connected: false,
        error: "يرجى إدخال مفتاح API للاختبار"
      }, { status: 400 });
    }

    const result = await callAIProvider({
      provider,
      baseUrl,
      apiKey,
      model,
      temperature: 0.2,
      maxTokens: 50,
      systemPrompt: "You are a fast AI latency and connectivity tester. Respond strictly with JSON: {\"status\":\"OK\"}.",
      userPrompt: "Ping test",
      jsonMode: true,
      timeoutMs: 15000
    });

    return Response.json({
      success: true,
      connected: true,
      provider: result.provider,
      model: result.model,
      latency_ms: result.latencyMs,
      message: `تم الاتصال بنجاح بمزود الذكاء الاصطناعي (${result.provider}) في غضون ${result.latencyMs}ms!`
    });
  } catch (error) {
    return Response.json({
      success: false,
      connected: false,
      error: error.message || "فشل الاتصال بمزود الذكاء الاصطناعي"
    }, { status: 502 });
  }
}
