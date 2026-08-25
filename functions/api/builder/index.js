import { TEMPLATES } from "./templates.js";
import { validateWebsiteManifest } from "./validate.js";
import { autoFixWebsiteManifest } from "./autofix.js";

async function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  function base64UrlDecode(value) {
    value = value.replace(/-/g, "+").replace(/_/g, "/");
    while (value.length % 4) value += "=";
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, base64UrlDecode(signature),
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

async function getUser(context) {
  const authorization = context.request.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  return await verifyJWT(authorization.substring(7), context.env.JWT_SECRET);
}

export async function onRequestGet(context) {
  // Returns available templates
  return Response.json({
    success: true,
    templates: TEMPLATES
  });
}

export async function onRequestPost(context) {
  try {
    const user = await getUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json();
    const action = String(body?.action || "validate").toLowerCase();
    const files = Array.isArray(body?.files) ? body.files : [];

    if (action === "validate") {
      const validation = validateWebsiteManifest(files);
      return Response.json({
        success: true,
        validation
      });
    }

    if (action === "autofix") {
      const fixResult = autoFixWebsiteManifest(files);
      return Response.json({
        success: true,
        fixed_files: fixResult.fixedFiles,
        repair_logs: fixResult.repairLogs,
        validation: fixResult.finalValidation
      });
    }

    return Response.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });

  } catch (error) {
    return Response.json({
      success: false,
      error: "حدث خطأ أثناء معالجة طلب البناء",
      details: error.message
    }, { status: 500 });
  }
}
