// Ollama /api/chat 客户端。
// 只负责和模型收发消息，不懂业务工具、不拼 prompt、不做历史裁剪。
// 与旧 generate 接口的区别：
// - 请求体用 messages 数组 + tools 数组，而不是 prompt 字符串；
// - 模型想调工具时，流的 message 里带 tool_calls（非流式在 done 包里）；
// - 思考过程在 message.thinking / 增量包的 message.thinking 里。

const LLM_MODEL = process.env.LLM_MODEL;
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);
const BASE_URL = (process.env.LLM_BASE_URL || "http://localhost:11434").replace(
  /\/$/,
  "",
);
const CHAT_URL = `${BASE_URL}/api/chat`;

async function fetchJson(url, body, { timeoutMs = LLM_TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 外部取消（客户端断开）和超时取消二选一触发即可
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `模型请求失败：${response.status} ${response.statusText}`,
      );
    }
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      if (signal?.aborted) throw new Error("客户端已取消请求");
      throw new Error("请求超时，请稍候重试");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * 非流式 chat，一次拿到完整 message。
 * @param {object} params
 * @param {Array} params.messages [{ role, content, tool_calls?, tool_name? }]
 * @param {Array} [params.tools] TOOL_DEFINITIONS
 * @param {boolean} [params.think] 是否返回 thinking
 * @param {AbortSignal} [params.signal] 客户端断开时取消
 * @returns {Promise<{ content: string, thinking: string, toolCalls: Array }>}
 */
async function chatOnce({ messages, tools, think, signal }) {
  if (!LLM_MODEL) throw new Error("缺少 LLM_MODEL 配置");

  const body = { model: LLM_MODEL, messages, stream: false };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (think !== undefined) body.think = think;

  const response = await fetchJson(CHAT_URL, body, { signal });
  const data = await response.json();
  const message = data.message || {};

  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
        .map((call) => ({
          name: call?.function?.name,
          arguments: call?.function?.arguments || {},
        }))
        .filter((call) => typeof call.name === "string")
    : [];

  return {
    content: typeof message.content === "string" ? message.content : "",
    thinking: typeof message.thinking === "string" ? message.thinking : "",
    toolCalls,
  };
}

/**
 * 流式 chat，最终回答边收边回调。
 * 注意：tool_calls 只在 done 包里完整出现，中间增量包只有 thinking/content。
 * @param {object} params
 * @param {Array} params.messages
 * @param {Array} [params.tools]
 * @param {boolean} [params.think]
 * @param {(chunk: { thinking: string, answer: string }) => void} [params.onToken]
 * @param {AbortSignal} [params.signal] 客户端断开时取消
 * @returns {Promise<{ thinking: string, content: string, toolCalls: Array }>}
 */
async function chatStream({ messages, tools, think, onToken, signal }) {
  if (!LLM_MODEL) throw new Error("缺少 LLM_MODEL 配置");

  const body = { model: LLM_MODEL, messages, stream: true };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (think !== undefined) body.think = think;

  const response = await fetchJson(CHAT_URL, body, { signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let fullThinking = "";
  let fullContent = "";
  let toolCalls = [];

  const handleMessage = (message = {}) => {
    if (typeof message.thinking === "string" && message.thinking) {
      fullThinking += message.thinking;
      onToken?.({ thinking: message.thinking, answer: "" });
    }
    if (typeof message.content === "string" && message.content) {
      fullContent += message.content;
      onToken?.({ thinking: "", answer: message.content });
    }
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls
        .map((call) => ({
          name: call?.function?.name,
          arguments: call?.function?.arguments || {},
        }))
        .filter((call) => typeof call.name === "string");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        handleMessage(JSON.parse(line).message);
      } catch (e) {
        console.error("解析模型流失败", e.message);
      }
    }
  }

  if (buffer.trim()) {
    try {
      handleMessage(JSON.parse(buffer).message);
    } catch (e) {
      console.error("解析模型流失败", e.message);
    }
  }

  return { thinking: fullThinking, content: fullContent, toolCalls };
}

module.exports = { chatOnce, chatStream };
