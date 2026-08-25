export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { hostname } = body || {};

    if (!hostname || typeof hostname !== "string") {
      return Response.json(
        { success: false, error: "hostname مطلوب" },
        { status: 400 }
      );
    }

    const apiKey = context.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return Response.json(
        { success: false, error: "مفتاح الذكاء الاصطناعي غير مهيأ" },
        { status: 500 }
      );
    }

    const cleanHost = hostname
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    const healthUrl = new URL(context.request.url);
    healthUrl.pathname = "/api/health-check-all";

    const healthResponse = await fetch(healthUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: cleanHost })
    });

    const healthData = await healthResponse.json();

    const prompt = `أنت مساعد فني لإدارة السيرفرات. لديك نتائج فحص تقني للموقع "${cleanHost}":

${JSON.stringify(healthData, null, 2)}

حلل النتائج وأعد ردك بصيغة JSON فقط بدون أي نص إضافي، بهذا الشكل بالضبط:
{
  "problem": "وصف مختصر للمشكلة الرئيسية إن وجدت، أو 'لا توجد مشكلة' إن كان كل شيء سليمًا",
  "likely_cause": "السبب المحتمل بالعربي",
  "suggested_steps": ["خطوة 1", "خطوة 2"]
}`;

    const aiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [{ role: "user", content: prompt }]
        })
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return Response.json(
        { success: false, error: "فشل الاتصال بخدمة الذكاء الاصطناعي", details: errText },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    let diagnosis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      diagnosis = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      diagnosis = {
        problem: "تعذر تفسير رد الذكاء الاصطناعي",
        likely_cause: null,
        suggested_steps: [],
        raw: rawText
      };
    }

    return Response.json({
      success: true,
      hostname: cleanHost,
      health: healthData,
      diagnosis
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
