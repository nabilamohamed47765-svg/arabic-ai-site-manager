export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare("SELECT 1 AS ok")
      .first();

    return Response.json({
      status: "online",
      database: result?.ok === 1 ? "connected" : "error",
      service: "Arabic AI Site Manager"
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        database: "error",
        message: error.message
      },
      { status: 500 }
    );
  }
}
