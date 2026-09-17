async function showHistory(params) {
  try {
    const res = await fetch("/api/history");
    if (res.ok) {
      return res.json();
    } else {
      throw new Error("获取历史记录失败");
    }
  } catch (error) {
    console.log(error);
    alert("获取历史记录失败");
  }
}
