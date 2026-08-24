const express = require("express");
const { Client } = require("ssh2");

const app = express();

app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 10000);

const EXECUTOR_TOKEN =
  process.env.SSH_EXECUTOR_TOKEN || "";

const MAX_COMMAND_LENGTH = 8000;

function jsonError(res, status, message) {
  return res.status(status).json({
    success: false,
    error: message
  });
}

function authenticate(req) {
  const token =
    req.get("X-SSH-Executor-Token") || "";

  if (!EXECUTOR_TOKEN) {
    return false;
  }

  return token === EXECUTOR_TOKEN;
}

function validatePort(port) {
  return (
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  );
}

function validateString(value, maxLength = 500) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "arabic-ai-ssh-executor",
    status: "online"
  });
});

/*
|--------------------------------------------------------------------------
| SSH Test
|--------------------------------------------------------------------------
|
| هذه العملية لا تنفذ أمرًا يرسله المستخدم.
| تقوم فقط بفتح اتصال SSH وتشغيل:
|
| echo SSH_CONNECTION_OK
|
*/

app.post("/ssh/test", async (req, res) => {
  if (!authenticate(req)) {
    return jsonError(
      res,
      401,
      "غير مصرح"
    );
  }

  const {
    hostname,
    port,
    username,
    password
  } = req.body || {};

  if (
    !validateString(hostname, 253) ||
    !validateString(username, 255) ||
    !validateString(password, 4096)
  ) {
    return jsonError(
      res,
      400,
      "بيانات SSH غير مكتملة"
    );
  }

  const sshPort =
    Number(port);

  if (!validatePort(sshPort)) {
    return jsonError(
      res,
      400,
      "SSH Port غير صالح"
    );
  }

  const client =
    new Client();

  let finished = false;

  const finish = (status, body) => {
    if (finished) {
      return;
    }

    finished = true;

    try {
      client.end();
    } catch {}

    return res
      .status(status)
      .json(body);
  };

  const timeout =
    setTimeout(() => {
      finish(
        504,
        {
          success: false,
          error:
            "انتهت مهلة اتصال SSH"
        }
      );
    }, 25000);

  client
    .on("ready", () => {

      client.exec(
        "echo SSH_CONNECTION_OK",
        (error, stream) => {

          if (error) {
            clearTimeout(timeout);

            return finish(
              502,
              {
                success: false,
                error:
                  "تم فتح اتصال SSH لكن فشل تنفيذ اختبار الاتصال"
              }
            );
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("data", (data) => {
              stdout += data.toString();
            })
            .stderr
            .on("data", (data) => {
              stderr += data.toString();
            });

          stream.on(
            "close",
            (code) => {

              clearTimeout(timeout);

              if (
                stdout.trim() ===
                "SSH_CONNECTION_OK"
              ) {

                return finish(
                  200,
                  {
                    success: true,
                    message:
                      "اتصال SSH ناجح",
                    result:
                      "SSH_CONNECTION_OK"
                  }
                );

              }

              return finish(
                502,
                {
                  success: false,
                  error:
                    "فشل اختبار SSH",
                  exit_code:
                    code,
                  details:
                    stderr.trim() ||
                    stdout.trim() ||
                    null
                }
              );
            }
          );
        }
      );
    })

    .on("error", (error) => {

      clearTimeout(timeout);

      let message =
        "فشل اتصال SSH";

      if (
        error &&
        error.code ===
        "ECONNREFUSED"
      ) {
        message =
          "تم رفض اتصال SSH. تحقق من Host وPort.";
      }

      else if (
        error &&
        (
          error.code ===
            "ENOTFOUND" ||
          error.code ===
            "EAI_AGAIN"
        )
      ) {
        message =
          "تعذر العثور على SSH Host.";
      }

      else if (
        error &&
        (
          error.level ===
            "authentication" ||
          String(error.message)
            .toLowerCase()
            .includes("authentication")
        )
      ) {
        message =
          "فشل تسجيل الدخول عبر SSH. تحقق من Username وPassword.";
      }

      return finish(
        502,
        {
          success: false,
          error: message
        }
      );
    })

    .connect({
      host: hostname.trim(),
      port: sshPort,
      username: username.trim(),
      password,
      readyTimeout: 20000,

      /*
       * لا نستخدم SSH Agent
       * ولا Private Keys في هذه المرحلة.
       */
      agent: undefined,
      privateKey: undefined,

      /*
       * مهم:
       * نسمح بالمصادقة بكلمة المرور فقط.
       */
      tryKeyboard: false
    });
});

/*
|--------------------------------------------------------------------------
| مستقبلًا:
| /ssh/command
|
| لن نفعله الآن.
|
| قبل إعطاء AI صلاحية تنفيذ أوامر عامة،
| سنضيف:
|
| - صلاحيات
| - Allowlist
| - Backup
| - Dry Run
| - Confirmation
| - Audit Log
|
|--------------------------------------------------------------------------
*/

app.post("/ssh/command", async (req, res) => {
  return jsonError(
    res,
    403,
    "تنفيذ الأوامر العامة غير مفعل حاليًا"
  );
});

/*
|--------------------------------------------------------------------------
| Invalid Route
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  return jsonError(
    res,
    404,
    "المسار غير موجود"
  );
});

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Arabic AI SSH Executor listening on port ${PORT}`
    );

  }
);
