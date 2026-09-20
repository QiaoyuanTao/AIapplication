require("dotenv").config();

const HEFENG_API_KEY = process.env.HEFENG_API_KEY;

// 官方文档: https://dev.qweather.com/docs/api/
// 免费订阅用 devapi.qweather.com，标准/付费订阅用 api.qweather.com
// 可在 .env 里加 QWEATHER_API_HOST=api.qweather.com 来切换
const WEATHER_HOST = process.env.QWEATHER_API_HOST || "devapi.qweather.com";
const GEO_HOST = process.env.QWEATHER_GEO_HOST || "geoapi.qweather.com";

const CODE_MESSAGES = {
  200: "成功",
  204: "请求成功，但该地区暂无数据",
  400: "请求错误：请检查 location / 参数格式",
  401: "认证失败：请检查 HEFENG_API_KEY 是否正确",
  402: "超出免费额度或余额不足，请前往和风控制台查看",
  403: "无权限：该数据需要更高阶的订阅",
  404: "地区不存在：请检查城市名称或 Location ID",
  429: "请求频繁超限，请降低频率后重试",
  500: "和风服务端错误，请稍后重试",
};

function assertKey() {
  if (!HEFENG_API_KEY) {
    throw new Error(
      "缺少和风天气配置：请在 .env 中设置 HEFENG_API_KEY（在和风控制台-项目管理-KEY 管理处获取）",
    );
  }
}

async function fetchJson(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        // 官方同时支持 query 参数 key 和请求头 X-QW-Api-Key，这里两者都带以兼容
        "X-QW-Api-Key": HEFENG_API_KEY,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`和风天气请求超时（${timeoutMs / 1000}s），请重试`);
    }
    throw new Error(`和风天气网络请求失败：${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `和风天气请求失败 [HTTP ${response.status}]：接口未返回 JSON（Geo 404 多为 KEY 未绑定 ${GEO_HOST}，天气 403 多为 KEY 未绑定 ${WEATHER_HOST}，请到和风控制台「设置 - API Host」核对绑定域名）`,
    );
  }
  return data;
}

/**
 * 和风新版接口统一返回 { error: { status, type, title, detail } }，
 * 老版 Geo / v7 返回 { code: "200" }。两种格式都要兼容。
 */
function checkCode(data) {
  if (!data || typeof data !== "object") {
    throw new Error("和风天气返回格式异常");
  }
  if (data.error) {
    const status = data.error.status;
    if (status === 403) {
      throw new Error(
        `和风天气请求失败 [403 Invalid Host]：当前 KEY 未绑定 ${WEATHER_HOST} / ${GEO_HOST}，请到和风控制台「设置 - API Host」查看该 KEY 绑定的域名后再请求（也可在 .env 用 QWEATHER_API_HOST / QWEATHER_GEO_HOST 覆盖）`,
      );
    }
    const hint = CODE_MESSAGES[status] || data.error.detail || "未知错误";
    throw new Error(`和风天气请求失败 [${status}]：${hint}`);
  }
  if (data.code !== "200") {
    const hint = CODE_MESSAGES[data.code] || "未知错误";
    throw new Error(`和风天气请求失败 [${data.code}]：${hint}`);
  }
}

/**
 * 城市搜索（GeoAPI）
 * 官方：GET https://geoapi.qweather.com/v2/city/lookup?location=beijing&key=YOUR_KEY
 *
 * @param {string} city 中文名 / 拼音 / Location ID / 经纬度（116.41,39.92）
 * @returns {Promise<object>} 第一个匹配的 location，如 { name, id, lat, lon, adm1, adm2, country }
 */
async function lookupCity(city) {
  assertKey();
  if (typeof city !== "string" || !city.trim()) {
    throw new Error("城市名不能为空");
  }
  const url =
    `https://${GEO_HOST}/v2/city/lookup` +
    `?location=${encodeURIComponent(city.trim())}` +
    `&key=${HEFENG_API_KEY}&range=cn&number=1&lang=zh`;
  const data = await fetchJson(url);
  checkCode(data);
  if (!Array.isArray(data.location) || data.location.length === 0) {
    throw new Error(`未找到城市「${city}」，请换个关键词或直接传 Location ID`);
  }
  return data.location[0];
}

/**
 * 把用户输入解析成官方 location 参数：
 * - 纯数字（如 101010100）视为 Location ID，直接使用
 * - "经度,纬度"（如 116.41,39.92）直接使用
 * - 其他视为地名，走城市搜索换取 Location ID
 */
async function resolveLocation(query) {
  const q = String(query).trim();
  if (/^\d{6,}$/.test(q)) return { id: q, info: null };
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q)) {
    return { id: q.replace(/\s+/g, ""), info: null };
  }
  const info = await lookupCity(q);
  return { id: info.id, info };
}

/**
 * 实时天气
 * 官方：GET https://devapi.qweather.com/v7/weather/now?location=101010100&key=YOUR_KEY
 *
 * @param {string} city 城市名 / Location ID / "经度,纬度"，默认北京
 * @param {object} [options]
 * @param {'zh'|'en'} [options.lang='zh']
 * @param {'m'|'i'} [options.unit='m'] m=公制，i=英制
 * @returns {Promise<object>} { city, id, updateTime, now, fxLink }
 */
async function getWeatherNow(city = "北京", options = {}) {
  assertKey();
  const { lang = "zh", unit = "m" } = options;
  const { id, info } = await resolveLocation(city);
  const url =
    `https://${WEATHER_HOST}/v7/weather/now` +
    `?location=${encodeURIComponent(id)}` +
    `&key=${HEFENG_API_KEY}&lang=${lang}&unit=${unit}`;
  const data = await fetchJson(url);
  checkCode(data);
  return {
    city: info ? info.name : String(city),
    id,
    adm1: info?.adm1,
    adm2: info?.adm2,
    updateTime: data.updateTime,
    now: data.now,
    fxLink: data.fxLink,
  };
}

/**
 * 逐日预报（3天/7天/10天/15天/30天，具体可用天数取决于你的订阅）
 * 官方：GET https://devapi.qweather.com/v7/weather/3d?location=101010100&key=YOUR_KEY
 *
 * @param {string} city 城市名 / Location ID / "经度,纬度"
 * @param {object} [options]
 * @param {3|7|10|15|30} [options.days=3]
 */
async function getWeatherForecast(city = "北京", options = {}) {
  assertKey();
  const { days = 3, lang = "zh", unit = "m" } = options;
  const allowed = [3, 7, 10, 15, 30];
  if (!allowed.includes(days)) {
    throw new Error(`days 只能是 ${allowed.join("/")}，当前为 ${days}`);
  }
  const { id, info } = await resolveLocation(city);
  const url =
    `https://${WEATHER_HOST}/v7/weather/${days}d` +
    `?location=${encodeURIComponent(id)}` +
    `&key=${HEFENG_API_KEY}&lang=${lang}&unit=${unit}`;
  const data = await fetchJson(url);
  checkCode(data);
  return {
    city: info ? info.name : String(city),
    id,
    updateTime: data.updateTime,
    daily: data.daily,
    fxLink: data.fxLink,
  };
}

/**
 * 兼容老调用的入口：getWeather(city) = 实时天气
 * 原代码用的是已下线的 v5 接口（api.heweather.net/v5），现已按官方 v7 重写
 */
async function getWeather(city = "北京", options = {}) {
  return getWeatherNow(city, options);
}

/**
 * 把实时天气格式化成一句中文，方便直接喂给大模型 / 前端展示
 */
function formatNow(result) {
  const n = result.now || {};
  return (
    `${result.city ?? "未知城市"}当前天气：${n.text ?? "未知"}，` +
    `气温 ${n.temp ?? "?"}℃，体感 ${n.feelsLike ?? "?"}℃，` +
    `${n.windDir ?? ""}${n.windScale ?? "?"}级（${n.windSpeed ?? "?"}km/h），` +
    `相对湿度 ${n.humidity ?? "?"}%，能见度 ${n.vis ?? "?"}km，` +
    `更新于 ${result.updateTime ?? "未知时间"}`
  );
}

module.exports = {
  getWeather,
  getWeatherNow,
  getWeatherForecast,
  lookupCity,
  formatNow,
};
