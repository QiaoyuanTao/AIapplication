// Ollama /api/chat 原生 function calling 的工具声明。
// 只放 JSON Schema，不放任何执行逻辑，执行逻辑在 registry.js 里。

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description:
        "查询中国城市的天气。只能查询今天、明天、后天。city 必须是中文城市名，如北京、上海、成都。",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "中文城市名，例如：北京",
          },
          date: {
            type: "string",
            enum: ["今天", "明天", "后天"],
            description: "要查询哪一天，默认今天",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translate",
      description:
        "中英文互译。text 是待翻译文本，targetLang 是目标语言：zh 表示译为中文，en 表示译为英文。",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "待翻译的文本",
          },
          targetLang: {
            type: "string",
            enum: ["zh", "en"],
            description: "目标语言，zh=中文，en=英文",
          },
        },
        required: ["text"],
      },
    },
  },
];

module.exports = { TOOL_DEFINITIONS };
