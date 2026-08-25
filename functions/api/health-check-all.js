async function checkHttp(hostname) {
  const url = hostname.startsWith("http") ? hostname : `https://${hostname}`;
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000)
    });
    return {
      reachable: true,
      status_code: response.status,
      response_time_ms: Date.now() - start
    };
  } catch (error) {
    return {
      reachable: false,
      error: error.message,
      response_time_ms: Date.now() - start
    };
  }
}

async function checkDns(hostname) {
  try {
    const dnsResponse = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: "application/dns-json" } }
    );
    const dnsData = await dnsResponse.json();
    const answers = (dnsData.Answer || []).map((a) => ({
      type: a.type,
      data: a.data,
      ttl: a.TTL
    }));
    return { resolved: answers.length > 0, records: answers };
  } catch (error) {
    return { resolved: false, error: error.message };
  }
}

async function checkTls(hostname) {
  try {
    const response = await fetch(`https://${hostname}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    });
    return { https_ok: true, status_code: response.status };
  } catch (error) {
    const message = error.message || "";
    const isCertError =
      message.toLowerCase().includes("cert") ||
      message.toLowerCase().includes("ssl") ||
      message.toLowerCase().includes("tls");
    return {
      https_ok: false,
      error: isCertError ? "مشكلة في شهادة SSL" : "تعذر الاتصال عبر HTTPS",
      details: message
    };
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { hostname } = body || {};

    if (!hostname || typeof hostname !== "string") {
      return Response.json(
        { success: false, error: "hostname مطلوب" },
        { status: 400 }
      );
    }

    const cleanHost = hostname
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    const [http, dns, tls] = await Promise.all([
      checkHttp(cleanHost),
      checkDns(cleanHost),
      checkTls(cleanHost)
    ]);

    return Response.json({
      success: true,
      hostname: cleanHost,
      checked_at: new Date().toISOString(),
      http,
      dns,
      tls
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
