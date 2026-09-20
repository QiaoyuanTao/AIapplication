require("dotenv").config();

const express = require("express");
const cors = require("cors");
const router = require("./routes/index");

// 创建 Express 应用实例，作为整个后端服务的入口
// 注意：本文件只创建并导出 app，不监听端口，启动逻辑在 server.js 里，
// 方便测试 require(app) 时不会占用端口。
const app = express();

// CORS 白名单：开发默认放行本地 Vite，前端走 Vite 代理时其实同源，
// 生产请在 .env 设置 CLIENT_ORIGIN=https://你的域名（多个用逗号分隔）
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));

// 限制 JSON 体大小，防止超大 prompt 打爆内存
app.use(express.json({ limit: "1mb" }));

// 解析表单类型数据，避免某些请求格式下 body 为空
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 挂载业务路由
// 这里不加 /api 前缀，是为了配合 Vite 代理里 rewrite 去掉 /api 的配置
app.use("/", router);

// 统一错误兜底，防止未捕获异常直接暴露堆栈给前端
// 注意：NDJSON 流已经开始写后不能再发 JSON 状态码，只能直接断流
app.use((err, req, res, next) => {
  console.error("后端发生未处理错误:", err);
  if (res.headersSent) {
    return res.end();
  }
  res.status(500).json({
    error: "服务器内部错误",
  });
});

module.exports = app;
