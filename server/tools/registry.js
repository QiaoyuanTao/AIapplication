// 工具注册表：名字 -> 执行函数。
// 约束点：
// 1. registry 只认 TOOL_DEFINITIONS 里声明过的名字，未声明的一律拒绝执行；
// 2. 入参做白名单校验，多余字段直接丢弃；
// 3. 返回值统一为字符串，方便拼进 tool 消息和存历史。

const {
  getWeatherNow,
  getWeatherForecast,
  formatNow,
} = require("../utils/weatherHandler");
const { translate } = require("../utils/translateHandler");

const DATE_TO_OFFSET = { 今天: 0, 明天: 1, 后天: 2 };

async function runGetWeather(args = {}) {
  const city = typeof args.city === "string" ? args.city.trim() : "";
  if (!city) throw new Error("getWeather 缺少 city 参数");

  const date = DATE_TO_OFFSET[args.date] !== undefined ? args.date : "今天";
  const offset = DATE_TO_OFFSET[date];

  if (offset === 0) {
    const result = await getWeatherNow(city);
    return formatNow(result);
  }

  const { daily } = await getWeatherForecast(city, { days: 3 });
  const day = daily?.[offset];
  if (!day) throw new Error(`暂无${date}的预报数据`);
  return (
    `${city}${date}天气：白天${day.textDay}，夜间${day.textNight}，` +
    `气温 ${day.tempMin}~${day.tempMax}℃，${day.windDirDay}${day.windScaleDay}级，` +
    `湿度 ${day.humidity}%`
  );
}

async function runTranslate(args = {}) {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!text) throw new Error("translate 缺少 text 参数");

  const targetLang = args.targetLang === "en" ? "en" : "zh";
  return translate(text, {
    from: "auto",
    to: targetLang,
    model_type: "llm",
  });
}

const TOOL_RUNNERS = {
  getWeather: runGetWeather,
  translate: runTranslate,
};

/**
 * 按工具名执行，返回字符串结果。
 * 未注册的工具名直接抛错，不会执行任意函数。
 */
async function runTool(name, args = {}) {
  const runner = TOOL_RUNNERS[name];
  if (typeof runner !== "function") {
    throw new Error(`未知工具：${name}`);
  }
  const result = await runner(args);
  return typeof result === "string" ? result : JSON.stringify(result);
}

module.exports = { TOOL_RUNNERS, runTool };
