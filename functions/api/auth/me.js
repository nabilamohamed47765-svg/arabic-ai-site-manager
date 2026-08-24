function base64UrlDecode(value) {
  value = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

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

async function verifyJWT(token, secret) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const data =
    `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(data)
  );

  if (!valid) {
    return null;
  }

  const payloadJson =
    new TextDecoder().decode(
      base64UrlDecode(encodedPayload)
    );

  const payload =
    JSON.parse(payloadJson);

  const now =
    Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < now) {
    return null;
  }

  return payload;
}

export async function onRequestGet(context) {

  try {

    if (!context.env.JWT_SECRET) {
      return Response.json(
        {
          error: "JWT_SECRET غير مضبوط"
        },
        { status: 500 }
      );
    }

    const authorization =
      context.request.headers.get("Authorization");

    if (!authorization ||
        !authorization.startsWith("Bearer ")) {

      return Response.json(
        {
          error: "غير مصرح. يجب إرسال JWT."
        },
        { status: 401 }
      );
    }

    const token =
      authorization.substring(7);

    const payload =
      await verifyJWT(
        token,
        context.env.JWT_SECRET
      );

    if (!payload) {
      return Response.json(
        {
          error: "جلسة غير صالحة أو منتهية"
        },
        { status: 401 }
      );
    }

    const user =
      await context.env.DB
        .prepare(`
          SELECT
            id,
            email,
            created_at
          FROM users
          WHERE id = ?
        `)
        .bind(payload.sub)
        .first();

    if (!user) {
      return Response.json(
        {
          error: "المستخدم غير موجود"
        },
        { status: 401 }
      );
    }

    return Response.json({
      authenticated: true,
      user
    });

  } catch (error) {

    return Response.json(
      {
        error: "حدث خطأ أثناء التحقق من الجلسة"
      },
      { status: 500 }
    );

  }
}