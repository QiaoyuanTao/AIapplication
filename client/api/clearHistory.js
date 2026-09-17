async function clearHistory(params) {
  if (!confirm("确定要清空历史记录吗？")) {
    return;
  }
  try {
    const res = await fetch("/api/history", {
      method: "DELETE",
    });
    if (res.ok) {
      alert("历史记录已清空");
    } else {
      alert("清空历史记录失败");
    }
  } catch (error) {
    console.log(error);
    alert("清空历史记录失败");
  }
}

export default clearHistory;
