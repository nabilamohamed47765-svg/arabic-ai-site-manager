import { analyzeProjectStructure } from "../builder/scanner.js";

function base64UrlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
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

export async function onRequestPost(context) {
  try {
    const user = await getAuthenticatedUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const body = await context.request.json().catch(() => ({}));
    const siteId = String(body.site_id || body.id || "").trim();

    if (!siteId) {
      return Response.json({ success: false, error: "معرف الموقع مطلوب" }, { status: 400 });
    }

    const site = await context.env.DB
      .prepare(`
        SELECT id, name, hostname, public_url, working_directory, framework, project_manifest
        FROM sites
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `)
      .bind(siteId, user.sub)
      .first();

    if (!site) {
      return Response.json({ success: false, error: "الموقع غير موجود" }, { status: 404 });
    }

    // Check if there are recent files from backups or previous read requests
    let fileList = [];
    const backupFiles = await context.env.DB
      .prepare(`
        SELECT file_path
        FROM backups
        WHERE site_id = ? AND user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `)
      .bind(siteId, user.sub)
      .all();

    if (backupFiles?.results?.length > 0) {
      fileList = backupFiles.results.map(b => b.file_path).filter(Boolean);
    }

    // If fileList is still small, default to standard root scan
    if (fileList.length === 0) {
      fileList = ["index.html", "css/style.css", "js/main.js", "robots.txt", "sitemap.xml"];
    }

    const manifest = analyzeProjectStructure(fileList, {});
    const nowIso = new Date().toISOString();

    // Persist manifest to D1
    try {
      await context.env.DB
        .prepare(`
          UPDATE sites
          SET framework = ?, project_manifest = ?, last_scanned_at = ?
          WHERE id = ? AND user_id = ?
        `)
        .bind(manifest.framework, JSON.stringify(manifest), nowIso, siteId, user.sub)
        .run();
    } catch {
      // If column hasn't migrated yet in some test environments, continue gracefully
    }

    return Response.json({
      success: true,
      site_id: siteId,
      site_name: site.name,
      framework: manifest.framework,
      manifest,
      message: `تم فحص الموقع بنجاح. تم تحديد بيئة العمل: ${manifest.framework}`
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: "حدث خطأ أثناء فحص الموقع",
      details: error.message
    }, { status: 500 });
  }
}
