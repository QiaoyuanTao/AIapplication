const LLM_ENDPOINT = process.env.LLM_ENDPOINT;
const LLM_MODEL = process.env.LLM_MODEL;
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);

// 做一个优化，封装一个带超时机制的 fetch 方法

/**
 *
 * @param {*} url 请求的地址，这里对应的是和大模型进行交互的地址
 * @param {*} options fetch 配置项
 * @param {*} timeout 超时时间
 */
async function fetchWithTimeout(url, options = {}, timeout = LLM_TIMEOUT_MS) {
  const controller = new AbortController();

  // 既然都超过 timeout 时间了，那就说明超时
  // 中止请求
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options, // 将原本的 fetch 配置项展开
      signal: controller.signal, // 允许中途取消请求
    });

    clearTimeout(timeoutId);

    return response;
  } catch (err) {
    clearTimeout(timeoutId);

    // 超时的错误
    if (err.name === "AbortError") throw new Error("请求超时，请稍候重试");

    // 其它类型的错误：原样抛出
    throw err;
  }
}

/**
 * 调用大模型
 * @param {object} params
 * @param {string} params.prompt 提示词
 * @param {boolean} [params.stream=false] 是否流式
 * @param {boolean} [params.think] 是否开启思考，对应 Ollama 的 think 参数。
 *   qwen3 等思考模型在流式时会把思考过程放在每行 JSON 的 thinking 字段里，
 *   正式回答放在 response 字段里。不传则由 Ollama 默认决定。
 * @param {(chunk: { thinking: string, answer: string }) => void} [params.callback]
 *   流式回调，每次收到 thinking / response 增量都会触发一次
 * @returns {Promise<string|{thinking:string,response:string}>}
 *   非流式返回 response 字符串；流式返回 { thinking, response } 完整结果
 */
async function callLLM({ prompt, stream = false, think, callback }) {
  const body = {
    model: LLM_MODEL,
    prompt,
    stream,
  };
  if (think !== undefined) body.think = think;

  const response = await fetchWithTimeout(LLM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok)
    throw new Error(`模型请求失败：${response.status} : ${response.statusText}`);

  // 非流式：只返回正式回答，思考过程不掺入正文
  if (!stream) {
    const data = await response.json();
    if (typeof data.response !== "string") {
      throw new Error("模型返回格式异常");
    }
    return data.response;
  }

  // 流式：Ollama 按行返回 NDJSON，每行形如
  // { "thinking": "...", "response": "", "done": false }
  // { "thinking": "", "response": "你好", "done": false }
  const reader = response.body.getReader(); // 拿到 Reader 对象
  const decoder = new TextDecoder("utf-8"); // 创建一个 utf-8 的解码器

  let buffer = ""; // 残留缓冲：TCP 分包不保证按行对齐，半行留到下一轮
  let fullThinking = ""; // 本次完整的思考过程
  let fullResponse = ""; // 本次完整的正式回答

  while (true) {
    const { done, value } = await reader.read(); // 读取当前块的内容
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        const thinkingChunk =
          typeof data.thinking === "string" ? data.thinking : "";
        const answerChunk =
          typeof data.response === "string" ? data.response : "";
        if (thinkingChunk) fullThinking += thinkingChunk;
        if (answerChunk) fullResponse += answerChunk;
        if (thinkingChunk || answerChunk) {
          callback?.({ thinking: thinkingChunk, answer: answerChunk });
        }
      } catch (e) {
        console.error("JSON解析失败", e.message);
      }
    }
  }

  // 处理最后一段没有换行符的残留
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      const thinkingChunk =
        typeof data.thinking === "string" ? data.thinking : "";
      const answerChunk =
        typeof data.response === "string" ? data.response : "";
      if (thinkingChunk) fullThinking += thinkingChunk;
      if (answerChunk) fullResponse += answerChunk;
      if (thinkingChunk || answerChunk) {
        callback?.({ thinking: thinkingChunk, answer: answerChunk });
      }
    } catch (e) {
      console.error("JSON解析失败", e.message);
    }
  }

  return { thinking: fullThinking, response: fullResponse };
}

module.exports = {
  /**
   * 非流式回复的接口（默认关闭思考，直接返回正文）
   * @param {string} prompt
   * @param {object} [options] 如 { think: false }
   * @returns {Promise<string>}
   */
  callLLM: (prompt, options = {}) =>
    callLLM({
      prompt,
      think: options.think,
    }),

  /**
   * 流式回复接口（透传思考过程）
   * @param {string} prompt
   * @param {(chunk: { thinking: string, answer: string }) => void} callback
   * @param {object} [options] 如 { think: true }
   * @returns {Promise<{thinking:string,response:string}>}
   */
  callLLMStream: (prompt, callback, options = {}) =>
    callLLM({
      prompt,
      stream: true,
      think: options.think,
      callback,
    }),
};
