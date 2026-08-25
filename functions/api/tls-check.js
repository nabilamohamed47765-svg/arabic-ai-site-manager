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
      const response = await fetch(`https://${cleanHost}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10000)
      });

      return Response.json({
        success: true,
        check: "tls",
        hostname: cleanHost,
        https_ok: true,
        status_code: response.status
      });
    } catch (tlsError) {
      const message = tlsError.message || "";
      const isCertError =
        message.toLowerCase().includes("cert") ||
        message.toLowerCase().includes("ssl") ||
        message.toLowerCase().includes("tls");

      return Response.json({
        success: true,
        check: "tls",
        hostname: cleanHost,
        https_ok: false,
        error: isCertError
          ? "مشكلة في شهادة SSL"
          : "تعذر الاتصال عبر HTTPS",
        details: message
      });
    }
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
