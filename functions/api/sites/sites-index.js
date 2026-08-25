function base64UrlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");

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

function base64Encode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function generateId() {
  const bytes = crypto.getRandomValues(
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


/* ========================================
   JWT
======================================== */

async function verifyJWT(token, secret) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;

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
    base64UrlDecode(signature),
    new TextEncoder().encode(
      `${header}.${payload}`
    )
  );

  if (!valid) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(
        base64UrlDecode(payload)
      )
    );

    const now =
      Math.floor(Date.now() / 1000);

    if (
      !decoded.exp ||
      decoded.exp < now
    ) {
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
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  return await verifyJWT(
    authorization.substring(7),
    context.env.JWT_SECRET
  );
}


/* ========================================
   DERIVE AES KEY
======================================== */

async function deriveEncryptionKey(secret) {

  if (!secret) {
    throw new Error(
      "SSH_ENCRYPTION_KEY غير مضبوط"
    );
  }

  const secretBytes =
    new TextEncoder().encode(secret);

  /*
   * نحول الـSecret الحالي إلى
   * SHA-256 = 32 bytes = AES-256
   */

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      secretBytes
    );

  return await crypto.subtle.importKey(
    "raw",
    hash,
    {
      name: "AES-GCM"
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}


/* ========================================
   ENCRYPT SSH PASSWORD
======================================== */

async function encryptPassword(
  password,
  secret
) {

  const key =
    await deriveEncryptionKey(
      secret
    );

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      new TextEncoder().encode(
        password
      )
    );

  return {
    ciphertext:
      base64Encode(
        new Uint8Array(
          encrypted
        )
      ),

    iv:
      base64Encode(iv)
  };
}


/* ========================================
   GET /api/sites
======================================== */

export async function onRequestGet(
  context
) {

  try {

    const user =
      await getAuthenticatedUser(
        context
      );

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
            hostname,
            public_url,
            port,
            username,
            working_directory,
            status,
            ssh_test_status,
            ssh_test_message,
            ssh_tested_at,
            created_at,
            updated_at
          FROM sites
          WHERE user_id = ?
          ORDER BY created_at DESC
        `)
        .bind(
          user.sub
        )
        .all();


    return Response.json({
      success: true,
      sites:
        result.results || []
    });


  } catch (error) {

    return Response.json(
      {
        error:
          "حدث خطأ أثناء جلب المواقع",

        details:
          error.message
      },
      {
        status: 500
      }
    );
  }
}


/* ========================================
   POST /api/sites
======================================== */

export async function onRequestPost(
  context
) {

  try {

    const user =
      await getAuthenticatedUser(
        context
      );

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
      String(
        body.name || ""
      ).trim();


    const hostname =
      String(
        body.hostname || ""
      ).trim();


    const publicUrl =
      String(
        body.public_url || ""
      ).trim();


    const port =
      Number(
        body.port || 22
      );


    const username =
      String(
        body.username || ""
      ).trim();


    const password =
      String(
        body.ssh_password || ""
      );


    const workingDirectory =
      String(
        body.working_directory ||
        "/"
      ).trim();


    if (
      !name ||
      !hostname ||
      !username ||
      !password
    ) {

      return Response.json(
        {
          error:
            "اسم الموقع وHostname وUsername وSSH Password مطلوبة"
        },
        {
          status: 400
        }
      );
    }


    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {

      return Response.json(
        {
          error:
            "رقم SSH Port غير صالح"
        },
        {
          status: 400
        }
      );
    }


    const encryptionSecret =
      context.env.SSH_ENCRYPTION_KEY;


    if (!encryptionSecret) {

      return Response.json(
        {
          error:
            "SSH_ENCRYPTION_KEY غير مضبوط في Cloudflare"
        },
        {
          status: 500
        }
      );
    }


    const encrypted =
      await encryptPassword(
        password,
        encryptionSecret
      );


    const id =
      generateId();


    await context.env.DB
      .prepare(`
        INSERT INTO sites (
          id,
          user_id,
          name,
          hostname,
          public_url,
          port,
          username,
          working_directory,
          status,
          ssh_password_ciphertext,
          ssh_password_iv,
          ssh_test_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        user.sub,
        name,
        hostname,
        publicUrl || null,
        port,
        username,
        workingDirectory,
        "active",
        encrypted.ciphertext,
        encrypted.iv,
        "not_tested"
      )
      .run();


    return Response.json(
      {
        success: true,

        message:
          "تمت إضافة الموقع وحفظ بيانات SSH بشكل مشفر",

        site: {
          id,
          name,
          hostname,
          public_url: publicUrl || null,
          port,
          username,
          working_directory:
            workingDirectory,
          status:
            "active",
          ssh_test_status:
            "not_tested"
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


/* ========================================
   POST /api/sites/ssh-test
======================================== */

export async function onRequestPostSSHTest(
  context
) {

  try {

    const user =
      await getAuthenticatedUser(
        context
      );

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


    const siteId =
      String(
        body.id || ""
      ).trim();


    if (!siteId) {

      return Response.json(
        {
          error:
            "معرف الموقع مطلوب"
        },
        {
          status: 400
        }
      );
    }


    const siteResult =
      await context.env.DB
        .prepare(`
          SELECT
            id,
            name,
            hostname,
            port,
            username,
            ssh_password_ciphertext,
            ssh_password_iv
          FROM sites
          WHERE id = ?
          AND user_id = ?
          LIMIT 1
        `)
        .bind(
          siteId,
          user.sub
        )
        .first();


    if (!siteResult) {

      return Response.json(
        {
          error:
            "الموقع غير موجود"
        },
        {
          status: 404
        }
      );
    }


    const requestId =
      generateId();


    const expiresAt =
      new Date(
        Date.now() +
        5 * 60 * 1000
      ).toISOString();


    await context.env.DB
      .prepare(`
        INSERT INTO ssh_requests (
          id,
          site_id,
          user_id,
          status,
          created_at,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        requestId,
        siteId,
        user.sub,
        "pending",
        new Date().toISOString(),
        expiresAt
      )
      .run();


    await context.env.DB
      .prepare(`
        UPDATE sites
        SET
          ssh_test_status = ?,
          ssh_test_message = ?,
          ssh_tested_at = NULL
        WHERE id = ?
        AND user_id = ?
      `)
      .bind(
        "testing",
        "جاري اختبار اتصال SSH...",
        siteId,
        user.sub
      )
      .run();


    return Response.json({
      success: true,

      request_id:
        requestId,

      status:
        "pending",

      message:
        "تم إنشاء طلب اختبار SSH"
    });


  } catch (error) {

    return Response.json(
      {
        error:
          "حدث خطأ أثناء إنشاء اختبار SSH",

        details:
          error.message
      },
      {
        status: 500
      }
    );
  }
}


/* ========================================
   DELETE /api/sites
======================================== */

export async function onRequestDelete(
  context
) {

  try {

    const user =
      await getAuthenticatedUser(
        context
      );

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


    const siteId =
      String(
        body.id || ""
      ).trim();


    if (!siteId) {

      return Response.json(
        {
          error:
            "معرف الموقع مطلوب"
        },
        {
          status: 400
        }
      );
    }


    const result =
      await context.env.DB
        .prepare(`
          DELETE FROM sites
          WHERE id = ?
          AND user_id = ?
        `)
        .bind(
          siteId,
          user.sub
        )
        .run();


    if (
      !result.meta ||
      result.meta.changes === 0
    ) {

      return Response.json(
        {
          error:
            "الموقع غير موجود أو لا تملك صلاحية حذفه"
        },
        {
          status: 404
        }
      );
    }


    return Response.json({
      success: true,

      message:
        "تم حذف الموقع من النظام بنجاح"
    });


  } catch (error) {

    return Response.json(
      {
        error:
          "حدث خطأ أثناء حذف الموقع",

        details:
          error.message
      },
      {
        status: 500
      }
    );
  }
}