// 服务启动入口：只做 listen。
// app.js 只创建并导出 app，方便测试 require 而不占端口。
const app = require("./app");

const PORT = Number(process.env.PORT || 7001);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
