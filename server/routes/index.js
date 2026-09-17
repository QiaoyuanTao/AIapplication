const express = require("express");

const { getWeather } = require("../utils/weatherHandler");
const { translate } = require("../utils/translateHandler");
const {
  buildFunctionCallPrompt,
  buildAnswerPrompt,
} = require("../utils/promptTemplates");
const { callLLM, callLLMStream } = require("../utils/LLM");

const router = express.Router();

// 支持上下文，用数组存储会话记录，下一次会话一同发送给大模型
const conversations = [];

const toolMap = {
  getWeather,
  translate,
};

/**
 * 统一把 LLM 流式增量转发给前端
 * @param {object} res Express 响应对象
 * @param {object} chunk { thinking, answer }
 * @returns {{ thinking: string, answer: string }} 本次转发的增量
 */
function forwardChunk(res, chunk) {
  const thinking = chunk.thinking || "";
  const answer = chunk.answer || "";
  if (thinking) res.write(`${JSON.stringify({ think: thinking })}\n`);
  if (answer) res.write(`${JSON.stringify({ answer })}\n`);
  return { thinking, answer };
}

router.post("/ask", async (req, res) => {
  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";

  if (!question) {
    return res.status(400).json({ error: "question 不能为空" });
  }

  // 前端可传 think=false 关闭思考；默认 true，透传 qwen3 的思考过程
  const think = req.body?.think !== false;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 思考过程单独存，不混入正文，避免污染上下文
  let finalThinking = "";
  let finalResponse = "";

  try {
    const functionCallPrompt = buildFunctionCallPrompt(question);
    // 工具判断不需要展示思考过程，直接关闭 think
    const functionCallResult = await callLLM(functionCallPrompt, {
      think: false,
    });

    if (functionCallResult.trim() === "无函数调用") {
      const prompt = [
        "你是一个中文智能助手请严格使用中文来回答用户问题",
        ...conversations.map(
          (item) => `${item.role === "user" ? "用户" : "助手"}:${item.content}`,
        ),
        `用户的问题:${question}`,
      ].join("\n");

      const result = await callLLMStream(
        prompt,
        (chunk) => {
          const { thinking, answer } = forwardChunk(res, chunk);
          finalThinking += thinking;
          finalResponse += answer;
        },
        { think },
      );
      finalThinking = result.thinking || finalThinking;
      finalResponse = result.response || finalResponse;
    } else {
      const parsedToolCalls = JSON.parse(functionCallResult);
      const toolCalls = Array.isArray(parsedToolCalls)
        ? parsedToolCalls
        : [parsedToolCalls];
      const toolResults = [];

      for (const tool of toolCalls) {
        const { function: functionName, args = {} } = tool;
        const toolHandler = toolMap[functionName];

        if (typeof toolHandler !== "function") {
          console.error(`${functionName}工具不存在`);
          toolResults.push({
            function: functionName,
            args,
            error: "未知工具",
          });
          continue;
        }

        try {
          let result;
          if (functionName === "translate") {
            result = await toolHandler(args.input);
          } else if (functionName === "getWeather") {
            result = await toolHandler(args.city);
          }

          toolResults.push({ function: functionName, args, result });
        } catch (err) {
          console.error(`${functionName}工具调用失败`, err);
          toolResults.push({
            function: functionName,
            args,
            error: err.message,
          });
        }
      }

      const answerPrompt = buildAnswerPrompt(question, toolResults);
      const result = await callLLMStream(
        answerPrompt,
        (chunk) => {
          const { thinking, answer } = forwardChunk(res, chunk);
          finalThinking += thinking;
          finalResponse += answer;
        },
        { think },
      );
      finalThinking = result.thinking || finalThinking;
      finalResponse = result.response || finalResponse;
    }

    conversations.push(
      { role: "user", content: question },
      {
        role: "assistant",
        content: finalResponse,
        thinking: finalThinking || undefined,
      },
    );

    if (conversations.length > 10) {
      conversations.splice(0, conversations.length - 10);
    }
  } catch (err) {
    console.error("处理对话失败:", err);
    res.write(
      `${JSON.stringify({ answer: "抱歉，当前请求处理失败，请稍后重试" })}\n`,
    );
  } finally {
    res.end();
  }
});

// 用户访问历史记录
router.get("/history", (req, res) => {
  res.json(conversations);
});

// 清空历史记录
router.post("/claer", (req, res) => {
  conversations.length = 0;
  res.json({ message: "历史记录已清空" });
});

module.exports = router;
