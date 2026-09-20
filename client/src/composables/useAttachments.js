import { computed, onUnmounted, ref } from "vue";

// 附件规范：集中一处，改限制只改这里
export const ATTACH_RULES = {
  // 最多挂 5 个文件
  maxCount: 5,
  // 单个 20MB
  maxSize: 20 * 1024 * 1024,
  // 允许的扩展名白名单
  acceptExts: [
    // 图片
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "bmp",
    "svg",
    // 文档
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "md",
    "csv",
  ],
  // 允许的 MIME 前缀（双保险：扩展名 + MIME 都要过）
  acceptMimes: [
    "image/",
    "application/pdf",
    "text/",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ],
};

// input accept 属性字符串，由白名单自动拼接
export const ATTACH_ACCEPT = [
  "image/*",
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv",
].join(",");

let uid = 0;

function extOf(name) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImage(file) {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindOf(file) {
  const ext = extOf(file.name);
  if (file.type.startsWith("image/")) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  return "file";
}

function validateFile(file, currentCount) {
  if (currentCount >= ATTACH_RULES.maxCount) {
    return `最多上传 ${ATTACH_RULES.maxCount} 个文件`;
  }
  if (file.size <= 0) {
    return "文件为空，无法上传";
  }
  if (file.size > ATTACH_RULES.maxSize) {
    return `「${file.name}」超过 ${formatSize(ATTACH_RULES.maxSize)} 限制`;
  }
  const ext = extOf(file.name);
  const mimeOk = ATTACH_RULES.acceptMimes.some((prefix) =>
    file.type.startsWith(prefix),
  );
  // 部分系统 file.type 为空（如某些 csv/txt），此时只校验扩展名
  if (!ATTACH_RULES.acceptExts.includes(ext) && !(file.type === "" && ext)) {
    return `「${file.name}」格式不支持，仅支持图片与 PDF / Office / 文本`;
  }
  if (file.type && !mimeOk && file.type !== "") {
    return `「${file.name}」类型不支持（${file.type}）`;
  }
  return null;
}

/**
 * 附件管理：校验 + 预览 URL 生命周期 + 增删清空。
 * 只管本地文件状态，不管上传网络请求（后端接好 /upload 后再调）。
 */
export function useAttachments() {
  const files = ref([]);
  const error = ref("");

  const hasFiles = computed(() => files.value.length > 0);
  const totalSize = computed(() =>
    files.value.reduce((sum, item) => sum + item.file.size, 0),
  );

  function addFiles(fileList) {
    error.value = "";
    const list = Array.from(fileList ?? []);
    for (const file of list) {
      const reason = validateFile(file, files.value.length);
      if (reason) {
        error.value = reason;
        continue;
      }
      files.value.push({
        id: ++uid,
        file,
        name: file.name,
        size: file.size,
        sizeText: formatSize(file.size),
        kind: kindOf(file),
        ext: extOf(file.name).toUpperCase(),
        // 仅图片生成对象 URL，SVG 用文本方式防脚本执行
        previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
      });
      if (files.value.length >= ATTACH_RULES.maxCount) break;
    }
    return files.value.length;
  }

  function removeFile(id) {
    const index = files.value.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = files.value.splice(index, 1);
    if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    if (!files.value.length) error.value = "";
  }

  function clear() {
    for (const item of files.value) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    files.value = [];
    error.value = "";
  }

  onUnmounted(() => {
    clear();
  });

  return { files, error, hasFiles, totalSize, addFiles, removeFile, clear };
}
