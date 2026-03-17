
class SaveAndDownload {
  constructor(fileName = "avatarData.js", enabled = false) {
    this.fileName = fileName;
    this.enabled = enabled; // 功能开关
    this.data = {}; // 存储JSON数据
    this.downloadButton = null;
    if (enabled) {
      this.initDownloadButton();
    }
  }

  // 初始化下载按钮
  initDownloadButton() {
    if (!this.enabled) return;
    
    this.downloadButton = document.createElement("a");
    this.downloadButton.style.position = "absolute";
    this.downloadButton.style.left = "0";
    this.downloadButton.style.bottom = "30px";
    this.downloadButton.style.background = "#4CAF50";
    this.downloadButton.style.color = "white";
    this.downloadButton.style.fontSize = "12px";
    this.downloadButton.style.padding = "10px";
    this.downloadButton.style.borderRadius = "4px";
    this.downloadButton.style.textDecoration = "none";
    this.downloadButton.style.zIndex = "1000";
    this.downloadButton.style.cursor = "pointer";
    this.downloadButton.innerHTML = "下载数据提交开发回放";
    this.downloadButton.addEventListener("click", () => {
      this.download();
    });
    document.body.appendChild(this.downloadButton);
  }

  // 写入多个字段
  writeFields(fields) {
    if (!this.enabled) return;
    Object.assign(this.data, fields);
  }

  // 追加多个项目到数组字段
  appendMultipleToArray(fieldName, items) {
    if (!this.enabled) return;
    if (!this.data[fieldName]) {
      this.data[fieldName] = [];
    }
    this.data[fieldName].push(...items);
  }

  // 下载文件
  download() {
    if (!this.enabled) return;
    const jsContent = this.generateJSContent();
    this.downloadFile(jsContent, this.fileName, "application/javascript");
  }

  // 生成JS文件内容
  generateJSContent() {
    const dataString = JSON.stringify(this.data, null, 2);
    return `export default ${dataString};`;
  }

  // 下载文件的具体实现
  downloadFile(content, fileName, contentType) {
    if (!this.enabled) return;
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    
    this.downloadButton.href = url;
    this.downloadButton.download = fileName;
    this.downloadButton.scrollIntoView({ behavior: "smooth", block: "center" });
    
    this.downloadButton.dataset.objectUrl = url;
  }
}

export default SaveAndDownload;
