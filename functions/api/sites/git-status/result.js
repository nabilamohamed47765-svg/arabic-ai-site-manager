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
  try {
    const user = await getUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const url = new URL(context.request.url);
    const requestId = String(url.searchParams.get("id") || "").trim();

    if (!requestId) {
      return Response.json({ success: false, error: "id مطلوب" }, { status: 400 });
    }

    const request = await context.env.DB.prepare(`
      SELECT id, status, output, error, target_path FROM ssh_requests
      WHERE id = ? AND user_id = ? LIMIT 1
    `).bind(requestId, user.sub).first();

    if (!request) {
      return Response.json({ success: false, error: "الطلب غير موجود" }, { status: 404 });
    }

    return Response.json({
      success: true, status: request.status, target_path: request.target_path,
      output: request.output || null, error: request.error || null
    });

  } catch (error) {
    return Response.json({
      success: false, error: "حدث خطأ أثناء قراءة نتيجة فحص Git", details: error?.message || String(error)
    }, { status: 500 });
  }
}
