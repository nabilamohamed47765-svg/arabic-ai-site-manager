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

    const url = hostname.startsWith("http")
      ? hostname
      : `https://${hostname}`;

    const startTime = Date.now();
    let result;

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(10000)
      });

      result = {
        reachable: true,
        status_code: response.status,
        response_time_ms: Date.now() - startTime
      };
    } catch (fetchError) {
      result = {
        reachable: false,
        error: fetchError.message || "تعذر الوصول للموقع",
        response_time_ms: Date.now() - startTime
      };
    }

    return Response.json({
      success: true,
      check: "http",
      hostname,
      ...result
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
