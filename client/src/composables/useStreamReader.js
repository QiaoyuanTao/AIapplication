/**
 * 功能：解析后端 NDJSON 流（每行一个 {"think"|"answer": text}），处理分包拼接并逐行回调。
 * @param {Object} options - 解析选项。
 * @param {Response} options.response - fetch 返回的 Response，需含可读 body。
 * @param {AbortSignal} [options.signal] - 取消信号，当前仅透传占位，实际取消由 fetch 触发。
 * @param {(delta: string, total: string) => void} [options.onThink] - think 增量回调，参数为本次增量与累计全文。
 * @param {(delta: string, total: string) => void} [options.onAnswer] - answer 增量回调，参数为本次增量与累计全文。
 * @returns {Promise<{think: string, answer: string}>} 解析出的完整思考与回答全文。
 */
export async function readNdjsonStream({
  response,
  signal,
  onThink,
  onAnswer,
}) {
  void signal;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let think = "";
  let answer = "";

  /**
   * 功能：解析单行 NDJSON 并触发对应回调。
   * @param {string} line - 单行 JSON 文本。
   * @returns {void} 无返回值，空行直接跳过。
   */
  const handleLine = (line) => {
    if (!line.trim()) return;
    try {
      const data = JSON.parse(line);
      if (typeof data.think === "string" && data.think) {
        think += data.think;
        onThink?.(data.think, think);
      }
      if (typeof data.answer === "string" && data.answer) {
        answer += data.answer;
        onAnswer?.(data.answer, answer);
      }
    } catch (error) {
      console.error("解析 JSON 失败:", error);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) handleLine(line);
    }
    if (buffer.trim()) handleLine(buffer);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader 已关闭时忽略
    }
  }

  return { think, answer };
}
