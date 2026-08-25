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

function sanitizeRelativePath(relPath) {
  if (typeof relPath !== "string") return null;
  let p = relPath.trim().replace(/\\/g, "/");
  p = p.replace(/^\/+/, ""); // strip leading slashes
  if (!p) return null;
  const parts = p.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    return null;
  }
  // Check for safe characters
  if (!/^[a-zA-Z0-9_\-\./@]+$/.test(p)) {
    return null;
  }
  return p;
}

export async function onRequestPost(context) {
  try {
    const user = await getUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json();
    const siteId = String(body?.id || "").trim();
    const rawFiles = Array.isArray(body?.files) ? body.files : [];
    const overwrite = body?.overwrite !== false;

    if (!siteId) {
      return Response.json({ success: false, error: "معرف الموقع مطلوب" }, { status: 400 });
    }

    if (!rawFiles.length) {
      return Response.json({ success: false, error: "مصفوفة الملفات فارغة" }, { status: 400 });
    }

    if (rawFiles.length > 25) {
      return Response.json({ success: false, error: "الحد الأقصى لعدد الملفات في الطلب الواحد هو 25 ملفًا" }, { status: 400 });
    }

    const sanitizedFiles = [];
    let totalSize = 0;

    for (const item of rawFiles) {
      const rel = sanitizeRelativePath(item?.path || item?.file_path);
      if (!rel) {
        return Response.json({ success: false, error: `مسار غير آمن أو غير صالح: ${item?.path || item?.file_path}` }, { status: 400 });
      }

      const content = typeof item?.content === "string" ? item.content : (typeof item?.file_content === "string" ? item.file_content : "");
      const fileSize = new TextEncoder().encode(content).length;

      if (fileSize > 600 * 1024) {
        return Response.json({ success: false, error: `حجم الملف ${rel} يتجاوز الحد الأقصى المسموح (600KB)` }, { status: 400 });
      }

      totalSize += fileSize;
      sanitizedFiles.push({ path: rel, content });
    }

    if (totalSize > 3 * 1024 * 1024) {
      return Response.json({ success: false, error: "حجم حزمة الملفات الإجمالي يتجاوز الحد المسموح (3MB)" }, { status: 400 });
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
    const requestId = crypto.randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + 8 * 60 * 1000);

    const payloadJson = JSON.stringify(sanitizedFiles);

    await context.env.DB.prepare(`
      INSERT INTO ssh_requests (id, site_id, user_id, status, operation, target_path, file_content, overwrite_confirmed, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      requestId,
      siteId,
      user.sub,
      "pending",
      "write_batch",
      workingDirectory,
      payloadJson,
      overwrite ? 1 : 0,
      now.toISOString(),
      expires.toISOString()
    ).run();

    return Response.json({
      success: true,
      request_id: requestId,
      status: "pending",
      files_count: sanitizedFiles.length,
      message: `تم تجهيز طلب كتابة عدد ${sanitizedFiles.length} ملفات بنجاح بنظام Batch Write`
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: "حدث خطأ أثناء إنشاء طلب Batch Write",
      details: error.message
    }, { status: 500 });
  }
}
