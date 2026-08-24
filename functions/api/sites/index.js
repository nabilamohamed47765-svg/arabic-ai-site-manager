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

  const [header, payload, signature] = parts;

  const data =
    `${header}.${payload}`;

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

  const valid =
    await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(data)
    );

  if (!valid) {
    return null;
  }

  try {

    const decoded =
      JSON.parse(
        new TextDecoder().decode(
          base64UrlDecode(payload)
        )
      );

    const now =
      Math.floor(Date.now() / 1000);

    if (!decoded.exp || decoded.exp < now) {
      return null;
    }

    return decoded;

  } catch {
    return null;
  }
}

async function getAuthenticatedUser(context) {

  const authorization =
    context.request.headers.get(
      "Authorization"
    );

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return null;
  }

  const token =
    authorization.substring(7);

  return await verifyJWT(
    token,
    context.env.JWT_SECRET
  );
}

function generateId() {

  const bytes =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


/* =========================================
   GET /api/sites
========================================= */

export async function onRequestGet(context) {

  try {

    const user =
      await getAuthenticatedUser(context);

    if (!user) {

      return Response.json(
        {
          error: "غير مصرح"
        },
        {
          status: 401
        }
      );
    }

    const result =
      await context.env.DB
        .prepare(`
          SELECT
            id,
            name,
            url,
            status,
            created_at
          FROM sites
          WHERE user_id = ?
          ORDER BY created_at DESC
        `)
        .bind(user.sub)
        .all();

    return Response.json({
      success: true,
      sites: result.results || []
    });

  } catch (error) {

    return Response.json(
      {
        error: "حدث خطأ أثناء جلب المواقع",
        details: error.message
      },
      {
        status: 500
      }
    );
  }
}


/* =========================================
   POST /api/sites
========================================= */

export async function onRequestPost(context) {

  try {

    const user =
      await getAuthenticatedUser(context);

    if (!user) {

      return Response.json(
        {
          error: "غير مصرح"
        },
        {
          status: 401
        }
      );
    }

    const body =
      await context.request.json();

    const name =
      String(body.name || "").trim();

    const url =
      String(body.url || "").trim();

    if (!name || !url) {

      return Response.json(
        {
          error:
            "اسم الموقع والرابط مطلوبان"
        },
        {
          status: 400
        }
      );
    }

    try {

      new URL(url);

    } catch {

      return Response.json(
        {
          error:
            "رابط الموقع غير صالح"
        },
        {
          status: 400
        }
      );
    }

    const id =
      generateId();

    await context.env.DB
      .prepare(`
        INSERT INTO sites (
          id,
          user_id,
          name,
          url,
          status
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        user.sub,
        name,
        url,
        "active"
      )
      .run();

    return Response.json(
      {
        success: true,
        message:
          "تمت إضافة الموقع بنجاح",
        site: {
          id,
          name,
          url,
          status: "active"
        }
      },
      {
        status: 201
      }
    );

  } catch (error) {

    return Response.json(
      {
        error:
          "حدث خطأ أثناء إضافة الموقع",
        details:
          error.message
      },
      {
        status: 500
      }
    );
  }
}
