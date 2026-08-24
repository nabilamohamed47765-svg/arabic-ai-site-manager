function base64UrlDecode(value) {
  value = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);

  const bytes = new Uint8Array(
    binary.length
  );

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


async function verifyJWT(
  token,
  secret
) {
  if (!token || !secret) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [
    header,
    payload,
    signature
  ] = parts;

  try {
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
        new TextEncoder().encode(
          `${header}.${payload}`
        )
      );

    if (!valid) {
      return null;
    }

    const decoded =
      JSON.parse(
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
| POST /api/sites/ssh-test/start
|--------------------------------------------------------------------------
*/

export async function onRequestPost(
  context
) {

  try {

    /*
     * ============================================================
     * 1. Verify logged-in user
     * ============================================================
     */

    const user =
      await getUser(context);

    if (!user) {

      return Response.json(
        {
          success: false,
          error: "غير مصرح"
        },
        {
          status: 401
        }
      );

    }


    /*
     * ============================================================
     * 2. Read request_id
     * ============================================================
     */

    let body;

    try {

      body =
        await context.request.json();

    } catch {

      return Response.json(
        {
          success: false,
          error:
            "بيانات الطلب غير صالحة"
        },
        {
          status: 400
        }
      );

    }


    const requestId =
      String(
        body?.request_id || ""
      ).trim();


    if (!requestId) {

      return Response.json(
        {
          success: false,
          error:
            "request_id مطلوب"
        },
        {
          status: 400
        }
      );

    }


    /*
     * ============================================================
     * 3. Get SSH request from D1
     * ============================================================
     */

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
          success: false,
          error:
            "طلب SSH غير موجود"
        },
        {
          status: 404
        }
      );

    }


    /*
     * ============================================================
     * 4. Check request status
     * ============================================================
     */

    if (
      request.status !== "pending"
    ) {

      return Response.json(
        {
          success: false,

          error:
            "طلب SSH ليس في حالة انتظار",

          request_status:
            request.status
        },
        {
          status: 409
        }
      );

    }


    /*
     * ============================================================
     * 5. Check expiration
     * ============================================================
     */

    if (request.expires_at) {

      const expiresAt =
        new Date(
          request.expires_at
        ).getTime();


      if (
        Number.isFinite(expiresAt) &&
        expiresAt < Date.now()
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
            success: false,

            error:
              "انتهت صلاحية طلب SSH"
          },
          {
            status: 410
          }
        );

      }

    }


    /*
     * ============================================================
     * 6. Get GitHub token
     * ============================================================
     *
     * Cloudflare Secret:
     *
     * SSH_EXECUTOR_TOKEN
     *
     * هذا يجب أن يكون GitHub Token
     * وليس Cloudflare API Token.
     */

    const githubToken =
      context.env.SSH_EXECUTOR_TOKEN;


    if (!githubToken) {

      return Response.json(
        {
          success: false,

          error:
            "SSH_EXECUTOR_TOKEN غير مضبوط في Cloudflare",

          hint:
            "أضف Secret باسم SSH_EXECUTOR_TOKEN إلى Cloudflare Pages/Workers"
        },
        {
          status: 500
        }
      );

    }


    /*
     * ============================================================
     * 7. GitHub repository
     * ============================================================
     */

    const repository =
      "nabilamohamed47765-svg/arabic-ai-site-manager";


    /*
     * ============================================================
     * 8. Workflow
     * ============================================================
     */

    const workflowFile =
      "ssh-test.yml";


    /*
     * ============================================================
     * 9. GitHub Actions dispatch URL
     * ============================================================
     */

    const githubUrl =
      `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/dispatches`;


    /*
     * ============================================================
     * 10. Start GitHub Action
     * ============================================================
     */

    let githubResponse;

    try {

      githubResponse =
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

            body:
              JSON.stringify({
                ref: "main",

                inputs: {
                  request_id:
                    requestId
                }
              })
          }
        );

    } catch (githubNetworkError) {

      console.error(
        "GitHub network error:",
        githubNetworkError
      );


      return Response.json(
        {
          success: false,

          error:
            "تعذر الاتصال بـ GitHub",

          details:
            githubNetworkError?.message ||
            String(
              githubNetworkError
            ),

          github_url:
            githubUrl
        },
        {
          status: 502
        }
      );

    }


    /*
     * ============================================================
     * 11. Read GitHub response
     * ============================================================
     */

    const githubResponseText =
      await githubResponse.text();


    /*
     * محاولة تحويل الرد إلى JSON
     */

    let githubData = null;

    try {

      if (githubResponseText) {

        githubData =
          JSON.parse(
            githubResponseText
          );

      }

    } catch {

      githubData = null;

    }


    /*
     * ============================================================
     * 12. GitHub rejected the workflow
     * ============================================================
     */

    if (!githubResponse.ok) {

      console.error(
        "GitHub Actions dispatch failed",
        {
          status:
            githubResponse.status,

          statusText:
            githubResponse.statusText,

          response:
            githubResponseText
        }
      );


      /*
       * نحاول استخراج الرسالة المفهومة
       */

      let githubMessage =
        "Unknown GitHub error";


      if (
        githubData &&
        typeof githubData.message ===
          "string"
      ) {

        githubMessage =
          githubData.message;

      } else if (
        githubResponseText
      ) {

        githubMessage =
          githubResponseText;

      }


      /*
       * رسائل مساعدة حسب HTTP Status
       */

      let hint =
        "راجع استجابة GitHub بالأسفل.";


      if (
        githubResponse.status === 401
      ) {

        hint =
          "GitHub رفض التوكن. تحقق أن SSH_EXECUTOR_TOKEN هو GitHub Token صالح وغير منتهي.";

      }


      if (
        githubResponse.status === 403
      ) {

        hint =
          "GitHub رفض العملية بسبب الصلاحيات. تحقق أن التوكن لديه صلاحية Actions على المستودع.";

      }


      if (
        githubResponse.status === 404
      ) {

        hint =
          "GitHub لم يجد المستودع أو Workflow. تحقق من repository واسم ssh-test.yml والفرع main.";

      }


      if (
        githubResponse.status === 422
      ) {

        hint =
          "GitHub رفض بيانات تشغيل الـ Workflow. تحقق من اسم workflow واسم input request_id والفرع main.";

      }


      return Response.json(
        {
          success: false,

          error:
            "فشل تشغيل GitHub Action",

          /*
           * =====================================================
           * أهم المعلومات التي نحتاجها للتشخيص
           * =====================================================
           */

          github_status:
            githubResponse.status,

          github_status_text:
            githubResponse.statusText,

          github_message:
            githubMessage,

          github_response:
            githubData,

          github_raw_response:
            githubResponseText,

          hint:

            hint,

          repository:
            repository,

          workflow:
            workflowFile,

          ref:
            "main",

          request_id:
            requestId
        },
        {
          status: 502
        }
      );

    }


    /*
     * ============================================================
     * 13. GitHub accepted the dispatch
     * ============================================================
     */

    console.log(
      "GitHub Action dispatched successfully",
      {
        request_id:
          requestId,

        repository:
          repository,

        workflow:
          workflowFile,

        ref:
          "main"
      }
    );


    /*
     * ============================================================
     * 14. Mark request as running
     * ============================================================
     */

    await context.env.DB
      .prepare(`
        UPDATE ssh_requests
        SET
          status = ?
        WHERE id = ?
        AND user_id = ?
      `)
      .bind(
        "running",
        requestId,
        user.sub
      )
      .run();


    /*
     * ============================================================
     * 15. Return success
     * ============================================================
     */

    return Response.json({

      success: true,

      request_id:
        requestId,

      status:
        "running",

      message:
        "تم تشغيل اختبار SSH بنجاح",

      github_status:
        githubResponse.status,

      repository:
        repository,

      workflow:
        workflowFile

    });


  } catch (error) {

    console.error(
      "SSH executor error:",
      error
    );


    /*
     * ============================================================
     * Unexpected error
     * ============================================================
     */

    return Response.json(
      {
        success: false,

        error:
          "حدث خطأ أثناء تشغيل اختبار SSH",

        details:
          error?.message ||
          String(error),

        error_name:
          error?.name ||
          "UnknownError",

        error_stack:
          error?.stack ||
          null
      },
      {
        status: 500
      }
    );

  }

}