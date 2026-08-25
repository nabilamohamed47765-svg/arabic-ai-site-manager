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
    const backupId = String(url.searchParams.get("id") || "").trim();
    const siteId = String(url.searchParams.get("site_id") || "").trim();

    if (backupId) {
      const backup = await context.env.DB.prepare(`
        SELECT id, site_id, file_path, file_content, description, created_at
        FROM backups WHERE id = ? AND user_id = ? LIMIT 1
      `).bind(backupId, user.sub).first();

      if (!backup) {
        return Response.json({ success: false, error: "النسخة الاحتياطية غير موجودة" }, { status: 404 });
      }

      return Response.json({
        success: true,
        backup: {
          id: backup.id,
          file_path: backup.file_path,
          content: backup.file_content || "",
          description: backup.description,
          created_at: backup.created_at
        }
      });
    }

    if (!siteId) {
      return Response.json({ success: false, error: "site_id مطلوب" }, { status: 400 });
    }

    const { results } = await context.env.DB.prepare(`
      SELECT id, file_path, description, created_at
      FROM backups
      WHERE site_id = ? AND user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(siteId, user.sub).all();

    return Response.json({ success: true, backups: results || [] });

  } catch (error) {
    return Response.json({
      success: false, error: "حدث خطأ أثناء جلب النسخ الاحتياطية", details: error?.message || String(error)
    }, { status: 500 });
  }
}
