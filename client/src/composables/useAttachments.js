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

/**
 * 功能：取文件名后缀小写，用于白名单校验与类型归类。
 * @param {string} name - 文件名（含扩展名）。
 * @returns {string} 小写扩展名，无后缀返回空串。
 */
function extOf(name) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * 功能：判断文件是否为可预览图片（SVG 除外，防脚本执行）。
 * @param {File} file - 待判断的文件对象。
 * @returns {boolean} true 为可生成对象 URL 预览的图片。
 */
function isImage(file) {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

/**
 * 功能：将字节数格式化为人类可读大小。
 * @param {number} bytes - 字节数。
 * @returns {string} 如 "1.5 MB" 的可读字符串。
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 功能：按 MIME 与扩展名归类附件，用于 chip 边框色与消息区徽标。
 * @param {File} file - 待归类的文件对象。
 * @returns {string} image | pdf | word | excel | ppt | file 其中之一。
 */
function kindOf(file) {
  const ext = extOf(file.name);
  if (file.type.startsWith("image/")) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  return "file";
}

/**
 * 功能：校验单个文件是否可加入附件列表（数量/大小/格式/MIME）。
 * @param {File} file - 待校验的文件对象。
 * @param {number} currentCount - 当前已选附件数，用于上限判断。
 * @returns {string|null} 不合规返回原因文案，合规返回 null。
 */
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
 * 功能：创建附件本地状态管理，负责校验、预览 URL 生命周期与增删清空。
 * @param {void} 无参数。
 * @returns {{files: import("vue").Ref<Array>, error: import("vue").Ref<string>, hasFiles: import("vue").ComputedRef<boolean>, totalSize: import("vue").ComputedRef<number>, addFiles: Function, removeFile: Function, clear: Function}} 附件状态与操作方法集合。
 */
export function useAttachments() {
  const files = ref([]);
  const error = ref("");

  const hasFiles = computed(() => files.value.length > 0);
  const totalSize = computed(() =>
    files.value.reduce((sum, item) => sum + item.file.size, 0),
  );

  /**
   * 功能：将文件选择框拿到的列表逐个校验后加入附件，超限截断。
   * @param {FileList|File[]|null|undefined} fileList - 待加入的文件列表。
   * @returns {number} 加入后的附件总数。
   */
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

  /**
   * 功能：按 id 移除单个附件并回收其预览 URL。
   * @param {number} id - addFiles 时分配的附件 id。
   * @returns {void} 无返回值，不存在直接返回。
   */
  function removeFile(id) {
    const index = files.value.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = files.value.splice(index, 1);
    if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    if (!files.value.length) error.value = "";
  }

  /**
   * 功能：清空全部附件并回收所有预览 URL，发送后与卸载时调用。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
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
