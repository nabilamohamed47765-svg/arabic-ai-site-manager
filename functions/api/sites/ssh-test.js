function base64Decode(value) {
  const binary = atob(value);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

async function decryptPassword(
  ciphertext,
  ivBase64,
  secret
) {

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        secret
      ),
      {
        name: "AES-GCM"
      },
      false,
      ["decrypt"]
    );

  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64Decode(
          ivBase64
        )
      },
      key,
      base64Decode(
        ciphertext
      )
    );

  return new TextDecoder().decode(
    decrypted
  );
}


function base64UrlDecode(value) {

  value =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    value.length % 4
  ) {
    value += "=";
  }

  const binary =
    atob(value);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


async function verifyJWT(
  token,
  secret
) {

  const parts =
    token.split(".");

  if (
    parts.length !== 3
  ) {
    return null;
  }

  const [
    header,
    payload,
    signature
  ] = parts;

  const data =
    `${header}.${payload}`;

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        secret
      ),
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
      base64UrlDecode(
        signature
      ),
      new TextEncoder().encode(
        data
      )
    );

  if (!valid) {
    return null;
  }

  try {

    const decoded =
      JSON.parse(
        new TextDecoder().decode(
          base64UrlDecode(
            payload
          )
        )
      );

    const now =
      Math.floor(
        Date.now() / 1000
      );

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


async function getUser(
  context
) {

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

  const token =
    authorization.substring(7);

  return await verifyJWT(
    token,
    context.env.JWT_SECRET
  );
}


/*
|--------------------------------------------------------------------------
| POST /api/sites/ssh-test
|--------------------------------------------------------------------------
*/

export async function onRequestPost(
  context
) {

  try {

    const user =
      await getUser(
        context
      );

    if (!user) {

      return Response.json(
        {
          error:
            "غير مصرح"
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


    const site =
      await context.env.DB
        .prepare(`
          SELECT
            id,
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


    if (!site) {

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


    if (
      !site.ssh_password_ciphertext ||
      !site.ssh_password_iv
    ) {

      return Response.json(
        {
          error:
            "بيانات SSH المشفرة غير موجودة"
        },
        {
          status: 400
        }
      );

    }


    /*
     * إنشاء طلب مؤقت.
     */

    const requestId =
      crypto.randomUUID();

    const now =
      new Date();

    const expires =
      new Date(
        now.getTime() +
        5 * 60 * 1000
      );


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
        now.toISOString(),
        expires.toISOString()
      )
      .run();


    /*
     * تحديث حالة الموقع.
     */

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
        "جاري إنشاء اختبار SSH...",
        siteId,
        user.sub
      )
      .run();


    /*
     * ملاحظة:
     *
     * في هذه المرحلة لا نعيد كلمة المرور
     * ولا نرسلها للمتصفح.
     *
     * GitHub Executor سيتم ربطه بالطلب
     * في الخطوة التالية.
     */


    return Response.json({

      success: true,

      request_id:
        requestId,

      status:
        "pending",

      message:
        "تم إنشاء طلب اختبار SSH بنجاح"

    });


  } catch (error) {

    return Response.json(
      {
        error:
          "حدث خطأ أثناء اختبار SSH",

        details:
          error.message
      },
      {
        status: 500
      }
    );

  }

}