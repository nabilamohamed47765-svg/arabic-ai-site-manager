function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toBase64Url(bytes);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(16));

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

  return {
    salt: toBase64Url(salt),
    hash: toBase64Url(new Uint8Array(derivedBits))
  };
}

export async function onRequestPost(context) {
  try {
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

    if (password.length < 8) {
      return Response.json(
        {
          error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
        },
        { status: 400 }
      );
    }

    const existing = await context.env.DB
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (existing) {
      return Response.json(
        {
          error: "هذا البريد مسجل بالفعل"
        },
        { status: 409 }
      );
    }

    const { salt, hash } = await hashPassword(password);

    const id = randomId();

    const passwordHash = `${salt}.${hash}`;

    await context.env.DB
      .prepare(`
        INSERT INTO users (
          id,
          email,
          password_hash
        )
        VALUES (?, ?, ?)
      `)
      .bind(id, email, passwordHash)
      .run();

    return Response.json(
      {
        success: true,
        message: "تم إنشاء الحساب بنجاح",
        user: {
          id,
          email
        }
      },
      { status: 201 }
    );

  } catch (error) {
    return Response.json(
      {
        error: "حدث خطأ أثناء إنشاء الحساب",
        details: error.message
      },
      { status: 500 }
    );
  }
    }
