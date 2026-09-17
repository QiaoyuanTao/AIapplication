require("dotenv").config();

const express = require("express");
const cors = require("cors");
const router = require("./routes/index");

// 创建 Express 应用实例，作为整个后端服务的入口
const app = express();

// 允许前端跨域访问，开发阶段前后端分离时通常需要开启
app.use(cors());

// 解析 JSON 请求体，否则 req.body 会是 undefined
app.use(express.json());

// 解析表单类型数据，避免某些请求格式下 body 为空
app.use(express.urlencoded({ extended: true }));

// 挂载业务路由
// 这里不加 /api 前缀，是为了配合 Vite 代理里 rewrite 去掉 /api 的配置
app.use("/", router);

// 统一错误兜底，防止未捕获异常直接暴露堆栈给前端
app.use((err, req, res, next) => {
  console.error("后端发生未处理错误:", err);
  res.status(500).json({
    error: "服务器内部错误",
  });
});

const PORT = 7001;

// 启动服务，监听 7001 端口，供前端代理转发请求使用
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

module.exports = app;
