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

export async function onRequestPost(context) {
  try {
    const user = await getUser(context);
    if (!user) {
      return Response.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return Response.json({ success: false, error: "بيانات الطلب غير صالحة" }, { status: 400 });
    }

    const requestId = String(body?.request_id || "").trim();
    if (!requestId) {
      return Response.json({ success: false, error: "request_id مطلوب" }, { status: 400 });
    }

    const request = await context.env.DB.prepare(`
      SELECT id, site_id, user_id, status, expires_at FROM ssh_requests
      WHERE id = ? AND user_id = ? LIMIT 1
    `).bind(requestId, user.sub).first();

    if (!request) {
      return Response.json({ success: false, error: "طلب Batch Write غير موجود" }, { status: 404 });
    }

    if (request.status !== "pending") {
      return Response.json({
        success: false, error: "طلب الكتابة ليس في حالة انتظار", request_status: request.status
      }, { status: 409 });
    }

    if (request.expires_at) {
      const expiresAt = new Date(request.expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        await context.env.DB.prepare(`UPDATE ssh_requests SET status = ? WHERE id = ? AND user_id = ?`)
          .bind("expired", requestId, user.sub).run();
        return Response.json({ success: false, error: "انتهت صلاحية طلب الكتابة" }, { status: 410 });
      }
    }

    const githubToken = context.env.SSH_EXECUTOR_TOKEN;
    if (!githubToken) {
      return Response.json({ success: false, error: "SSH_EXECUTOR_TOKEN غير مضبوط في Cloudflare" }, { status: 500 });
    }

    const repository = "nabilamohamed47765-svg/arabic-ai-site-manager";
    const workflowFile = "ssh-write-batch.yml";
    const githubUrl = `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/dispatches`;

    let githubResponse;
    try {
      githubResponse = await fetch(githubUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "Arabic-AI-Site-Manager"
        },
        body: JSON.stringify({ ref: "main", inputs: { request_id: requestId } })
      });
    } catch (githubNetworkError) {
      return Response.json({
        success: false, error: "تعذر الاتصال بـ GitHub",
        details: githubNetworkError?.message || String(githubNetworkError)
      }, { status: 502 });
    }

    if (!githubResponse.ok) {
      const githubResponseText = await githubResponse.text();
      let githubData = null;
      try { githubData = githubResponseText ? JSON.parse(githubResponseText) : null; } catch {}
      return Response.json({
        success: false, error: "فشل تشغيل سير العمل المجمع",
        github_status: githubResponse.status,
        github_message: githubData?.message || githubResponseText,
        repository, workflow: workflowFile, ref: "main", request_id: requestId
      }, { status: 502 });
    }

    await context.env.DB.prepare(`UPDATE ssh_requests SET status = ? WHERE id = ? AND user_id = ?`)
      .bind("running", requestId, user.sub).run();

    return Response.json({
      success: true, request_id: requestId, status: "running", message: "تم تشغيل سير عمل Batch Write بنجاح"
    });

  } catch (error) {
    return Response.json({
      success: false, error: "حدث خطأ أثناء تشغيل Batch Write", details: error?.message || String(error)
    }, { status: 500 });
  }
}
