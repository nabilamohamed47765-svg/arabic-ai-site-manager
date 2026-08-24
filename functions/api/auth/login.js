function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeString(value) {
  return base64UrlEncode(
    new TextEncoder().encode(value)
  );
}

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

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

async function createJWT(user, secret) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + (7 * 24 * 60 * 60)
  };

  const encodedHeader =
    base64UrlEncodeString(JSON.stringify(header));

  const encodedPayload =
    base64UrlEncodeString(JSON.stringify(payload));

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
    ["sign"]
  );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(data)
    );

  return `${data}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;
}

export async function onRequestPost(context) {
  try {
    if (!context.env.JWT_SECRET) {
      return Response.json(
        {
          error: "JWT_SECRET غير مضبوط في Cloudflare"
        },
        { status: 500 }
      );
    }

    const body = await context.request.json();

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const password = String(body.password || "");

    if (!email || !password) {
      return Response.json(
        {
          error: "البريد الإلكتروني وكلمة المرور مطلوبان"
        },
        { status: 400 }
      );
    }

    const user = await context.env.DB
      .prepare(`
        SELECT
          id,
          email,
          password_hash
        FROM users
        WHERE email = ?
      `)
      .bind(email)
      .first();

    if (!user) {
      return Response.json(
        {
          error: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        },
        { status: 401 }
      );
    }

    const parts = String(user.password_hash).split(".");

    if (parts.length !== 2) {
      return Response.json(
        {
          error: "بيانات كلمة المرور غير صالحة"
        },
        { status: 500 }
      );
    }

    const salt = base64UrlDecode(parts[0]);

    const expectedHash =
      base64UrlDecode(parts[1]);

    const actualHash =
      await hashPassword(password, salt);

    if (!constantTimeEqual(
      actualHash,
      expectedHash
    )) {
      return Response.json(
        {
          error: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        },
        { status: 401 }
      );
    }

    const token =
      await createJWT(
        {
          id: user.id,
          email: user.email
        },
        context.env.JWT_SECRET
      );

    return Response.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });

  } catch (error) {
    return Response.json(
      {
        error: "حدث خطأ أثناء تسجيل الدخول"
      },
      { status: 500 }
    );
  }
}
