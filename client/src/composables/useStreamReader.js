/**
 * 后端 NDJSON 流解析器：每行一个 {"think"|"answer": text}
 * 不懂业务，只负责分包拼接 + 按行回调。
 */
export async function readNdjsonStream({
  response,
  signal,
  onThink,
  onAnswer,
}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let think = "";
  let answer = "";

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
