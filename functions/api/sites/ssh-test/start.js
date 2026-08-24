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
    new TextEncoder().encode(`${header}.${payload}`)
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

    if (
      !decoded.exp ||
      decoded.exp <
        Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return decoded;

  } catch {
    return null;
  }
}

async function getUser(context) {

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

  return await verifyJWT(
    authorization.substring(7),
    context.env.JWT_SECRET
  );
}

export async function onRequestPost(context) {

  try {

    const user =
      await getUser(context);

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

    const requestId =
      String(
        body.request_id || ""
      ).trim();


    if (!requestId) {

      return Response.json(
        {
          error:
            "request_id مطلوب"
        },
        {
          status: 400
        }
      );
    }


    const request =
      await context.env.DB
        .prepare(`
          SELECT
            id,
            site_id,
            user_id,
            status,
            expires_at
          FROM ssh_requests
          WHERE id = ?
          AND user_id = ?
          LIMIT 1
        `)
        .bind(
          requestId,
          user.sub
        )
        .first();


    if (!request) {

      return Response.json(
        {
          error:
            "طلب SSH غير موجود"
        },
        {
          status: 404
        }
      );
    }


    if (
      request.status !== "pending"
    ) {

      return Response.json(
        {
          error:
            "طلب SSH ليس في حالة انتظار"
        },
        {
          status: 409
        }
      );
    }


    if (
      new Date(
        request.expires_at
      ).getTime() < Date.now()
    ) {

      await context.env.DB
        .prepare(`
          UPDATE ssh_requests
          SET status = ?
          WHERE id = ?
          AND user_id = ?
        `)
        .bind(
          "expired",
          requestId,
          user.sub
        )
        .run();


      return Response.json(
        {
          error:
            "انتهت صلاحية طلب SSH"
        },
        {
          status: 410
        }
      );
    }


    const githubToken =
      context.env.GITHUB_ACTIONS_TOKEN;

    if (!githubToken) {

      return Response.json(
        {
          error:
            "GITHUB_ACTIONS_TOKEN غير مضبوط"
        },
        {
          status: 500
        }
      );
    }


    const repository =
      context.env.GITHUB_REPOSITORY;

    if (!repository) {

      return Response.json(
        {
          error:
            "GITHUB_REPOSITORY غير مضبوط"
        },
        {
          status: 500
        }
      );
    }


    const workflowFile =
      "ssh-test.yml";


    const githubUrl =
      `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/dispatches`;


    const githubResponse =
      await fetch(
        githubUrl,
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${githubToken}`,

            "Accept":
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

            "Content-Type":
              "application/json",

            "User-Agent":
              "Arabic-AI-Site-Manager"
          },

          body: JSON.stringify({
            ref: "main",

            inputs: {
              request_id:
                requestId
            }
          })
        }
      );


    if (
      !githubResponse.ok
    ) {

      const githubError =
        await githubResponse.text();

      return Response.json(
        {
          error:
            "فشل تشغيل GitHub Action",

          details:
            githubError
        },
        {
          status: 502
        }
      );
    }


    await context.env.DB
      .prepare(`
        UPDATE ssh_requests
        SET status = ?
        WHERE id = ?
        AND user_id = ?
      `)
      .bind(
        "running",
        requestId,
        user.sub
      )
      .run();


    return Response.json({

      success: true,

      request_id:
        requestId,

      status:
        "running",

      message:
        "تم تشغيل اختبار SSH"
    });


  } catch (error) {

    return Response.json(
      {
        error:
          "حدث خطأ أثناء تشغيل اختبار SSH",

        details:
          error.message
      },
      {
        status: 500
      }
    );

  }
}
