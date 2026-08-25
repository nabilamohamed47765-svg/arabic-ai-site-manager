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

    try {
      const dnsResponse = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanHost)}&type=A`,
        { headers: { accept: "application/dns-json" } }
      );

      const dnsData = await dnsResponse.json();

      const answers = (dnsData.Answer || []).map((a) => ({
        type: a.type,
        data: a.data,
        ttl: a.TTL
      }));

      return Response.json({
        success: true,
        check: "dns",
        hostname: cleanHost,
        resolved: answers.length > 0,
        records: answers
      });
    } catch (dnsError) {
      return Response.json({
        success: true,
        check: "dns",
        hostname: cleanHost,
        resolved: false,
        error: dnsError.message
      });
    }
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
