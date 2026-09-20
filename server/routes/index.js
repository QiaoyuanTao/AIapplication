// 薄路由层：只做三件事
// 1. 校验 question / think 参数；
// 2. 调 chatService 跑对话，把 think/answer 事件转成 SSE 行；
// 3. 暴露 /history 和 /clear。
// 工具约束、模型调用、历史裁剪都在 services / tools / llm 里。

const express = require("express");
const {
  runChat,
  getHistory,
  clearHistory,
} = require("../services/chatService");

const router = express.Router();

function writeEvent(res, type, text) {
  if (!text) return;
  const field = type === "think" ? "think" : "answer";
  res.write(`${JSON.stringify({ [field]: text })}\n`);
}

router.post("/ask", async (req, res) => {
  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";

  if (!question) {
    return res.status(400).json({ error: "question 不能为空" });
  }
  if (question.length > 4000) {
    return res.status(400).json({ error: "question 过长，请分段提问" });
  }

  const think = req.body?.think !== false;

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 客户端断开（关闭页面/点停止）时取消模型请求，避免 qwen3 空转烧 token
  // 注意：必须监听 res 的 close，而不是 req 的 close。
  // req 是可读流，body 解析完它的 close 就会触发（正常请求也会触发），
  // 用它来 abort 会把所有正常请求都误杀；res 的 close + !writableEnded
  // 才代表“响应还没写完连接就断了”，即真正的客户端断开。
  const stopController = new AbortController();
  const onResClose = () => {
    if (!res.writableEnded) stopController.abort();
  };
  res.on("close", onResClose);

  try {
    await runChat(question, {
      think,
      signal: stopController.signal,
      onEvent: (event) => writeEvent(res, event.type, event.text),
    });
  } catch (err) {
    // 流已开始只能断流，不能再发 JSON 状态码（见 app.js 错误中间件同理）
    console.error("处理对话失败:", err);
    writeEvent(res, "answer", "抱歉，当前请求处理失败，请稍后重试");
  } finally {
    res.end();
  }
});

router.get("/history", (req, res) => {
  res.json(getHistory());
});

// 前端历史拼写可能是 /clear，保留 /claer 做兼容
router.post(["/clear", "/claer"], (req, res) => {
  clearHistory();
  res.json({ message: "历史记录已清空" });
});

module.exports = router;
