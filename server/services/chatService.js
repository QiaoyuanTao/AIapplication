// 对话编排层：把「模型决策 -> 工具执行 -> 模型总结」串起来。
// 路由层只管收 question、转发事件；这里管全部业务逻辑。
// 流程（最多 MAX_TOOL_ROUNDS 轮工具调用）：
// 1. 首轮流式 chat（带 tools）：无工具则流式内容就是回答，有工具则 done 包带 tool_calls；
// 2. 有 tool_calls 就逐个 runTool，结果以 role=tool 的消息追加回去，再问模型；
// 3. 后续轮次同样流式输出正文；最后一轮去掉 tools，逼模型收敛为正文总结。

const { chatStream } = require("../llm/ollamaChat");
const { TOOL_DEFINITIONS } = require("../tools/definitions");
const { runTool } = require("../tools/registry");

const MAX_HISTORY = 10;
const MAX_TOOL_ROUNDS = 3;
const MAX_TOOL_NAME_LEN = 64;

const SYSTEM_PROMPT =
  "你是一个中文智能助手，请严格使用中文回答。需要查天气或翻译时调用对应工具，不要编造数据。";

const conversations = [];
// 注意：这是单进程内存存储，所有请求共享同一份历史，仅适合本地学习演示。
// 多用户/生产环境请按 sessionId 或 userId 切分存储（如 Redis/数据库）。

function getHistory() {
  return [...conversations];
}

function clearHistory() {
  conversations.length = 0;
}

/** 只保留白名单内的工具调用，防止模型编造工具名。 */
function sanitizeToolCalls(toolCalls = []) {
  const allowed = new Set(TOOL_DEFINITIONS.map((t) => t.function.name));
  return toolCalls
    .filter(
      (call) =>
        typeof call.name === "string" &&
        call.name.length <= MAX_TOOL_NAME_LEN &&
        allowed.has(call.name) &&
        call.arguments &&
        typeof call.arguments === "object",
    )
    .slice(0, MAX_TOOL_ROUNDS);
}

/** 工具执行结果转成 tool 消息。失败也转为文本，不中断对话。 */
async function executeToolCalls(toolCalls, signal) {
  const toolMessages = [];
  for (const call of toolCalls) {
    if (signal?.aborted) throw new Error("客户端已取消请求");
    try {
      const result = await runTool(call.name, call.arguments);
      toolMessages.push({ role: "tool", tool_name: call.name, content: result });
    } catch (err) {
      console.error(`${call.name}工具调用失败`, err);
      toolMessages.push({
        role: "tool",
        tool_name: call.name,
        content: `工具执行失败：${err.message}`,
      });
    }
  }
  return toolMessages;
}

function buildMessages(question) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversations.flatMap((item) =>
      item.role === "user"
        ? [{ role: "user", content: item.content }]
        : [{ role: "assistant", content: item.content }],
    ),
    { role: "user", content: question },
  ];
}

/**
 * 用无 tools 的流式 chat 把工具结果总结成自然语言。
 */
async function summarizeWithModel(messages, { think, signal, onEvent, target }) {
  const streamed = await chatStream({
    messages,
    think,
    signal,
    onToken: (chunk) => {
      if (chunk.thinking) {
        target.thinking += chunk.thinking;
        onEvent?.({ type: "think", text: chunk.thinking });
      }
      if (chunk.answer) {
        target.content += chunk.answer;
        onEvent?.({ type: "answer", text: chunk.answer });
      }
    },
  });
  target.thinking = streamed.thinking || target.thinking;
  target.content = streamed.content || target.content;
}

/**
 * 跑完对话，流式推送 think/answer 事件。
 * @param {string} question
 * @param {object} [options]
 * @param {boolean} [options.think=true]
 * @param {AbortSignal} [options.signal] 客户端断开时取消
 * @param {(event: { type: "think"|"answer", text: string }) => void} [options.onEvent]
 * @returns {Promise<{ thinking: string, content: string }>}
 */
async function runChat(question, { think = true, signal, onEvent } = {}) {
  const messages = buildMessages(question);
  const result = { thinking: "", content: "" };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) throw new Error("客户端已取消请求");
    // 最后一轮不再给 tools，逼模型收敛为正文回答。
    const tools = round === MAX_TOOL_ROUNDS ? undefined : TOOL_DEFINITIONS;
    const streamed = await chatStream({
      messages,
      tools,
      think,
      signal,
      onToken: (chunk) => {
        // 决策轮（首轮且尚未执行工具）的正文只是模型的思考性铺垫，
        // 真正面向用户的总结在工具执行后输出，这里只透传 thinking。
        if (round > 0 || messages.some((m) => m.role === "tool")) {
          if (chunk.thinking) {
            result.thinking += chunk.thinking;
            onEvent?.({ type: "think", text: chunk.thinking });
          }
          if (chunk.answer) {
            result.content += chunk.answer;
            onEvent?.({ type: "answer", text: chunk.answer });
          }
        } else if (chunk.thinking) {
          result.thinking += chunk.thinking;
          onEvent?.({ type: "think", text: chunk.thinking });
        }
      },
    });
    // 首轮无工具：流式内容本身就是回答，直接采用
    if (round === 0 && sanitizeToolCalls(streamed.toolCalls).length === 0) {
      result.thinking = streamed.thinking || result.thinking;
      result.content = streamed.content;
      // chatStream 已逐 token 透传 thinking，但首轮 answer 被暂扣，这里补发
      if (streamed.content) {
        onEvent?.({ type: "answer", text: streamed.content });
      }
      messages.push({ role: "assistant", content: result.content });
      break;
    }

    const toolCalls = sanitizeToolCalls(streamed.toolCalls);
    if (toolCalls.length === 0) {
      // 非首轮无工具：流式内容就是总结，直接采用
      result.thinking = streamed.thinking || result.thinking;
      result.content = streamed.content || result.content;
      messages.push({ role: "assistant", content: result.content });
      break;
    }

    messages.push({
      role: "assistant",
      content: streamed.content || "",
      tool_calls: toolCalls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    });

    const toolMessages = await executeToolCalls(toolCalls, signal);
    messages.push(...toolMessages);

    if (round === MAX_TOOL_ROUNDS) {
      // 达到上限：再做一次无 tools 的总结，避免把干巴巴的工具原文甩给用户
      await summarizeWithModel(messages, {
        think,
        signal,
        onEvent,
        target: result,
      });
      messages.push({ role: "assistant", content: result.content });
    }
  }

  conversations.push(
    { role: "user", content: question },
    { role: "assistant", content: result.content, thinking: result.thinking || undefined },
  );
  if (conversations.length > MAX_HISTORY) {
    conversations.splice(0, conversations.length - MAX_HISTORY);
  }

  return result;
}

module.exports = { runChat, getHistory, clearHistory };
