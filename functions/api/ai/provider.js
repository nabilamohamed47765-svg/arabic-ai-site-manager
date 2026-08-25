/**
 * AI Provider Abstraction Layer
 * Supports Google Gemini (AI Studio), OpenRouter, OpenAI-compatible APIs, Anthropic, and Custom Providers.
 */

export const SUPPORTED_PROVIDERS = [
  { id: "gemini", name: "Google Gemini (AI Studio)", defaultModel: "gemini-2.0-flash", defaultUrl: "https://generativelanguage.googleapis.com" },
  { id: "openrouter", name: "OpenRouter", defaultModel: "google/gemini-2.0-flash-001", defaultUrl: "https://openrouter.ai/api/v1" },
  { id: "openai", name: "OpenAI / Compatible API (DeepSeek, Groq, Ollama)", defaultModel: "gpt-4o-mini", defaultUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic Claude", defaultModel: "claude-3-5-haiku-20241022", defaultUrl: "https://api.anthropic.com/v1" },
  { id: "custom", name: "Custom API Endpoint", defaultModel: "custom-model", defaultUrl: "" }
];

/**
 * Normalizes and executes chat completion across different AI providers.
 */
export async function callAIProvider({
  provider = "openrouter",
  baseUrl = "",
  apiKey = "",
  model = "",
  temperature = 0.7,
  maxTokens = 4000,
  systemPrompt = "",
  userPrompt = "",
  jsonMode = true,
  timeoutMs = 50000
}) {
  if (!apiKey) {
    throw new Error("مفتاح API الخاص بالذكاء الاصطناعي مفقود أو غير مهيأ");
  }

  const selectedProvider = provider.toLowerCase();
  const startTime = Date.now();

  if (selectedProvider === "gemini") {
    return await callGemini({ baseUrl, apiKey, model, temperature, maxTokens, systemPrompt, userPrompt, jsonMode, timeoutMs, startTime });
  }

  if (selectedProvider === "anthropic") {
    return await callAnthropic({ baseUrl, apiKey, model, temperature, maxTokens, systemPrompt, userPrompt, jsonMode, timeoutMs, startTime });
  }

  // Default to OpenAI-compatible format (works for OpenAI, OpenRouter, Groq, Together, DeepSeek, Ollama)
  return await callOpenAICompatible({
    provider: selectedProvider,
    baseUrl: baseUrl || (selectedProvider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"),
    apiKey,
    model: model || (selectedProvider === "openrouter" ? "google/gemini-2.0-flash-001" : "gpt-4o-mini"),
    temperature,
    maxTokens,
    systemPrompt,
    userPrompt,
    jsonMode,
    timeoutMs,
    startTime
  });
}

/**
 * Google Gemini API Handler (AI Studio REST API)
 */
async function callGemini({ baseUrl, apiKey, model, temperature, maxTokens, systemPrompt, userPrompt, jsonMode, timeoutMs, startTime }) {
  const modelName = model || "gemini-2.0-flash";
  const rootUrl = (baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const url = `${rootUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const contents = [];
  if (userPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: userPrompt }]
    });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: typeof temperature === "number" ? temperature : 0.7,
      maxOutputTokens: maxTokens || 4000,
      ...(jsonMode ? { responseMimeType: "application/json" } : {})
    }
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(payload)
  });

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson = null;
    try { errorJson = JSON.parse(errorText); } catch {}
    const msg = errorJson?.error?.message || errorText;
    throw new Error(`Google Gemini Error (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return {
    rawText: text,
    parsedJson: jsonMode ? parseJsonSafe(text) : null,
    provider: "gemini",
    model: modelName,
    latencyMs
  };
}

/**
 * OpenAI & OpenRouter Compatible Handler
 */
async function callOpenAICompatible({ provider, baseUrl, apiKey, model, temperature, maxTokens, systemPrompt, userPrompt, jsonMode, timeoutMs, startTime }) {
  const rootUrl = baseUrl.replace(/\/+$/, "");
  const endpoint = rootUrl.endsWith("/chat/completions") ? rootUrl : `${rootUrl}/chat/completions`;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://arabic-ai-site-manager.pages.dev";
    headers["X-Title"] = "Arabic AI Site Manager";
  }

  const payload = {
    model,
    messages,
    temperature: typeof temperature === "number" ? temperature : 0.7,
    max_tokens: maxTokens || 4000,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {})
  };

  let response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(payload)
  });

  // If json_object mode fails on some non-compliant models, retry without response_format
  if (!response.ok && jsonMode) {
    const backupPayload = { ...payload };
    delete backupPayload.response_format;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(backupPayload)
      });
    } catch {}
  }

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson = null;
    try { errorJson = JSON.parse(errorText); } catch {}
    const msg = errorJson?.error?.message || errorText;
    throw new Error(`${provider.toUpperCase()} API Error (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  return {
    rawText: text,
    parsedJson: jsonMode ? parseJsonSafe(text) : null,
    provider,
    model,
    latencyMs
  };
}

/**
 * Anthropic Claude API Handler
 */
async function callAnthropic({ baseUrl, apiKey, model, temperature, maxTokens, systemPrompt, userPrompt, jsonMode, timeoutMs, startTime }) {
  const modelName = model || "claude-3-5-haiku-20241022";
  const rootUrl = (baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const endpoint = `${rootUrl}/messages`;

  const payload = {
    model: modelName,
    max_tokens: maxTokens || 4000,
    temperature: typeof temperature === "number" ? temperature : 0.7,
    messages: [{ role: "user", content: userPrompt }]
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(payload)
  });

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson = null;
    try { errorJson = JSON.parse(errorText); } catch {}
    const msg = errorJson?.error?.message || errorText;
    throw new Error(`Anthropic API Error (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  return {
    rawText: text,
    parsedJson: jsonMode ? parseJsonSafe(text) : null,
    provider: "anthropic",
    model: modelName,
    latencyMs
  };
}

function parseJsonSafe(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : rawText);
  } catch {
    return null;
  }
}
