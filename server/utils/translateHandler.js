require("dotenv").config();

const crypto = require("crypto");

const BAIDU_APP_ID = process.env.BAIDU_APP_ID;
const BAIDU_API_KEY = process.env.BAIDU_API_KEY;

const API_URL = "https://fanyi-api.baidu.com/ait/api/aiTextTranslate";

// 官方要求 q 上限 6000 字符，为保证质量建议单次控制在 2000 以内
const MAX_QUERY_LEN = 6000;

const ERROR_MESSAGES = {
  52001: "请求超时：请检查 q 是否为正常文本，from/to 是否在支持语种列表中",
  52002: "百度系统错误，请重试",
  52003: "未授权用户：请检查 appid 是否正确、是否已开通大模型文本翻译服务",
  54000: "必填参数为空：请检查 appid / q / from / to 是否漏传",
  54001: "签名错误或 token 错误：请检查 API Key / 签名生成方法",
  54003: "访问频率受限：请降低调用频率或升级版本",
  54004: "账户余额不足，请前往管理控制台充值",
  54005: "长 query 请求频繁：长度大于 1 万字节的 query 请降低频率，3s 后再试",
  58000: "客户端 IP 非法：请检查开发者信息页填写的服务器 IP",
  58001: "译文语言方向不支持：请检查 to 是否在语言列表里",
  58002: "服务当前已关闭：请前往管理控制台开启服务",
  58003: "此 IP 已被封禁：同一 IP 当日使用多个 APPID 会被封禁当日权限",
  58004: "模型参数错误：model_type 只能是 llm 或 nmt",
  59002: "翻译指令过长：reference 超过 500 字符上限",
  59003: "请求文本过长：q 超过 6000 字符上限",
  59004: "QPS 超限",
  59005: "tag_handling 参数非法：只能是 0 或 1",
  59006: "标签解析失败：标签未闭合或为空",
  59007: "ignore_tags 长度超限：上限为 20",
  90107: "认证未通过或未生效：请前往「我的认证」查看进度",
};

/**
 * 生成 sign 鉴权签名（兼容老版 appid + 密钥方式）
 * 官方算法：sign = MD5(appid + q + salt + 密钥)，32 位小写
 * 注意：拼接时 q 不做 URL encode，发送请求时才 encode（JSON 方式由 fetch 自动处理）
 */
function buildSign(q, salt) {
  const raw = `${BAIDU_APP_ID}${q}${salt}${BAIDU_API_KEY}`;
  return crypto.createHash("md5").update(raw, "utf8").digest("hex");
}

/**
 * 大模型文本翻译
 *
 * 官方示例：
 * curl -X POST "https://fanyi-api.baidu.com/ait/api/aiTextTranslate" \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer YOUR_API_KEY" \
 *   -d '{"appid":"YOUR_APPID","from":"zh","to":"en","q":"你好"}'
 *
 * @param {string} text 待翻译文本，对应官方 q 字段，UTF-8，上限 6000 字符
 * @param {object} [options]
 * @param {string} [options.from='auto'] 翻译源语言，可为 auto
 * @param {string} [options.to='zh'] 翻译目标语言，不可为 auto
 * @param {'llm'|'nmt'} [options.model_type='llm'] llm=大模型翻译(默认)，nmt=机器翻译
 * @param {string} [options.reference] 自定义翻译指令，如"使用学术风格来翻译"，上限 500 字符（仅 llm 有效）
 * @param {0|1} [options.needIntervene] 是否使用自定义术语干预 API，1-是 0-否
 * @param {0|1} [options.tag_handling] 标签保持，1-开 0-关(默认)，仅 model_type=nmt 时有效
 * @param {string[]} [options.ignore_tags] 指定标签间内容不翻译，最多 20 个，仅 nmt + tag_handling=1 时生效
 * @param {boolean} [options.useSign=false] 置 true 则改用 sign 鉴权（无需 Bearer），适合只有 appid + 密钥的老账号
 * @returns {Promise<string>} 拼接后的译文（多段用换行连接）
 * @throws 翻译失败时抛出 Error，message 中包含官方 error_code / error_msg
 */
const translate = async (text, options = {}) => {
  const {
    from = "auto",
    to = "zh",
    model_type = "llm",
    reference,
    needIntervene,
    tag_handling,
    ignore_tags,
    useSign = process.env.BAIDU_AUTH_MODE !== "api-key",
  } = options;

  if (!BAIDU_APP_ID || !BAIDU_API_KEY) {
    throw new Error(
      "缺少百度翻译配置：请在 .env 中设置 BAIDU_APP_ID 和 BAIDU_API_KEY",
    );
  }

  if (typeof text !== "string" || !text.trim()) {
    throw new Error("待翻译文本 q 不能为空");
  }
  const q = text;
  if (q.length > MAX_QUERY_LEN) {
    throw new Error(
      `请求文本过长：q 为 ${q.length} 字符，超过 ${MAX_QUERY_LEN} 上限，请分段请求`,
    );
  }
  if (!from || !to) {
    throw new Error("from / to 不能为空，且 to 不可为 auto");
  }
  if (to === "auto") {
    throw new Error("to 不可设置为 auto，请指定目标语言（如 zh / en）");
  }
  if (model_type !== "llm" && model_type !== "nmt") {
    throw new Error("model_type 只能是 llm 或 nmt");
  }

  const body = {
    appid: BAIDU_APP_ID,
    q,
    from,
    to,
    model_type,
  };
  if (reference !== undefined) body.reference = reference;
  if (needIntervene !== undefined) body.needIntervene = needIntervene;
  if (tag_handling !== undefined) body.tag_handling = tag_handling;
  if (ignore_tags !== undefined) body.ignore_tags = ignore_tags;

  const headers = { "Content-Type": "application/json" };

  if (useSign) {
    // sign 鉴权：body 追加 salt + sign，不带 Authorization 头
    // salt 必须是数字；使用字符串会触发百度 AI 接口的 JSON 解析错误
    const salt = Date.now();
    body.salt = salt;
    body.sign = buildSign(q, salt);
  } else {
    // 官方推荐：API Key 鉴权
    headers.Authorization = `Bearer ${BAIDU_API_KEY}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("百度翻译请求超时（15s），请重试");
    }
    throw new Error(`百度翻译网络请求失败：${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`百度翻译返回非 JSON（HTTP ${response.status}），请重试`);
  }

  if (data.error_code) {
    const hint = ERROR_MESSAGES[data.error_code] || "";
    let extra = "";
    if (String(data.error_code) === "54001" && !useSign) {
      extra =
        "（当前使用 Bearer 鉴权；你的配置看起来是传统 appid + 密钥，" +
        "请改用 sign 鉴权：translate(text, { useSign: true }），或在 .env 设置 BAIDU_AUTH_MODE=api-key 以启用真正的 API Key）";
    }
    throw new Error(
      `百度翻译失败 [${data.error_code}] ${data.error_msg || ""}${hint ? `：${hint}` : ""}${extra}`,
    );
  }

  if (!Array.isArray(data.trans_result)) {
    throw new Error(`百度翻译返回格式异常：${JSON.stringify(data)}`);
  }

  return data.trans_result.map((item) => item.dst).join("\n");
};

module.exports = {
  translate,
  buildSign,
};
