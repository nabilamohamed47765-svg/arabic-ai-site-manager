async function verifyJWT(token, secret) {
  if (!token || !secret) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
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

function joinPath(base, relative) {
  const cleanBase = base.endsWith("/") ? base : base + "/";
  const cleanRelative = relative.startsWith("/") ? relative.substring(1) : relative;
  return cleanBase + cleanRelative;
}

export async function onRequestPost(context) {
  try {
    const user = await getUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json();
    const siteId = String(body?.id || "").trim();
    const relativePath = String(body?.path || "").trim();
    const content = typeof body?.content === "string" ? body.content : "";
    const overwrite = body?.overwrite === true;

    if (!siteId) {
      return Response.json({ success: false, error: "معرف الموقع مطلوب" }, { status: 400 });
    }

    if (!relativePath) {
      return Response.json({ success: false, error: "اسم/مسار الملف مطلوب" }, { status: 400 });
    }

    if (relativePath.split("/").includes("..")) {
      return Response.json({ success: false, error: "مسار الملف غير مسموح به" }, { status: 400 });
    }

    const site = await context.env.DB.prepare(`
      SELECT id, working_directory, ssh_password_ciphertext, ssh_password_iv
      FROM sites WHERE id = ? AND user_id = ? LIMIT 1
    `).bind(siteId, user.sub).first();

    if (!site) {
      return Response.json({ success: false, error: "الموقع غير موجود" }, { status: 404 });
    }

    if (!site.ssh_password_ciphertext || !site.ssh_password_iv) {
      return Response.json({ success: false, error: "بيانات SSH المشفرة غير موجودة" }, { status: 400 });
    }

    const workingDirectory = site.working_directory || "/";
    const targetPath = joinPath(workingDirectory, relativePath);

    const requestId = crypto.randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000);

    await context.env.DB.prepare(`
      INSERT INTO ssh_requests (id, site_id, user_id, status, operation, target_path, file_content, overwrite_confirmed, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(requestId, siteId, user.sub, "pending", "write", targetPath, content, overwrite ? 1 : 0, now.toISOString(), expires.toISOString()).run();

    return Response.json({
      success: true, request_id: requestId, status: "pending",
      message: "تم إنشاء طلب كتابة الملف بنجاح"
    });

  } catch (error) {
    return Response.json({
      success: false, error: "حدث خطأ أثناء إنشاء طلب الكتابة", details: error.message
    }, { status: 500 });
  }
}