<template>
  <div class="test-api-page">
    <header class="page-header">
      <h1>API 请求测试</h1>
    </header>

    <!-- 模块1: HTTP请求获取Socket链接 -->
    <div class="module-card">
      <h2 class="module-title">模块1: 获取 WebSocket 连接</h2>
      <div class="module-content">
        <div class="input-group">
          <label for="api-url-input">请求 URL</label>
          <input id="api-url-input" type="text" v-model="apiUrl" placeholder="输入HTTP请求的URL" />
        </div>
        <div class="input-group">
          <label for="json-input">请求数据 (JSON格式)</label>
          <textarea id="json-input" v-model="requestBody" rows="3"></textarea>
        </div>
        <button @click="fetchSocketUrl" class="btn btn-primary" :disabled="loading.http">
          <span v-if="loading.http" class="spinner"></span>
          <span v-else>发起请求</span>
        </button>
        <div v-if="httpResponse" class="response-area">
          <h3 class="response-title">HTTP 响应:</h3>
          <pre>{{ formattedHttpResponse }}</pre>
        </div>
      </div>
    </div>

    <!-- 模块2: WebSocket建联 -->
    <div class="module-card">
      <h2 class="module-title">模块2: 建立 WebSocket 连接</h2>
      <div class="module-content">
        <p class="module-description">
          使用上一步获取到的URL或手动输入URL建立WebSocket连接。连接状态会实时显示在下方。
        </p>
        <div class="input-group">
          <label for="socket-url-input">Socket.IO URL</label>
          <input id="socket-url-input" type="text" v-model="socketUrl" placeholder="输入Socket.IO连接的URL" />
        </div>
        <button @click="connectWebSocket" class="btn" :disabled="!socketUrl || socketStatus === '连接成功'">
          建立连接
        </button>
        <button @click="disconnectWebSocket" class="btn" :disabled="!socket?.connected"
          style="margin-left: 10px; background-color: var(--error-color); color: white;">
          断开连接
        </button>
        <div v-if="socketStatus" class="response-area">
          <h3 class="response-title">连接状态:</h3>
          <p :class="['status', statusClass]">{{ socketStatus }}</p>
        </div>
      </div>
    </div>

    <!-- 模块3: 发送WebSocket消息 -->
    <div class="module-card">
      <h2 class="module-title">模块3: 模拟Agent分流发送消息</h2>
      <div class="module-content">
        <p class="module-description">
          在下方的输入框中填入需要发送的内容。点击"发送消息"后，将依次发送三条消息到WebSocket后端。
        </p>
        <div class="input-grid">
          <div class="input-group">
            <label for="msg1">消息 1</label>
            <textarea id="msg1" v-model="messages.msg1" placeholder="输入第一条消息" rows="3"></textarea>
          </div>
          <div class="input-group">
            <label for="msg2">消息 2</label>
            <textarea id="msg2" v-model="messages.msg2" placeholder="输入第二条消息" rows="3"></textarea>
          </div>
          <div class="input-group">
            <label for="msg3">消息 3</label>
            <textarea id="msg3" v-model="messages.msg3" placeholder="输入第三条消息" rows="3"></textarea>
          </div>
        </div>
        <button @click="sendWebSocketMessages" class="btn btn-primary"
          :disabled="socketStatus !== '连接成功' || loading.socketSend">
          <span v-if="loading.socketSend" class="spinner"></span>
          <span v-else>发送消息</span>
        </button>
        <div v-if="socketResponses.length > 0" class="response-area">
          <h3 class="response-title">Socket 响应记录:</h3>
          <ul class="response-list">
            <li v-for="(response, index) in socketResponses" :key="index">
              <pre>{{ response }}</pre>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import request from './js/request';
import Tts from './js/tts';
import { io } from "socket.io-client";

// --- 模块1: HTTP ---
const apiUrl = ref('');
const defaultBody = {
  id: "your-custom-id",
};
const requestBody = ref(JSON.stringify(defaultBody, null, 2));
const httpResponse = ref(null);
const loading = ref({
  http: false,
  socketSend: false,
});

const formattedHttpResponse = computed(() => {
  if (typeof httpResponse.value === 'string') {
    return httpResponse.value;
  }
  return JSON.stringify(httpResponse.value, null, 2);
});

const socketUrl = ref('https://test-lite-msg-proxy.xmov.ai');

async function fetchSocketUrl() {
  loading.value.http = true;
  httpResponse.value = null;
  if (!apiUrl.value) {
    httpResponse.value = '请求失败: 请输入URL';
    loading.value.http = false;
    return;
  }

  try {
    const body = JSON.parse(requestBody.value);
    const responseData = await request(apiUrl.value, {
      method: 'POST',
      data: body,
    });
    httpResponse.value = responseData;
    if (responseData?.socket_url) {
      socketUrl.value = responseData.socket_url;
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      httpResponse.value = `请求失败: JSON格式错误 - ${error.message}`;
    } else {
      httpResponse.value = `请求失败: ${error.message || '未知错误'}`;
    }
  } finally {
    loading.value.http = false;
  }
}

// --- 模块2: WebSocket 连接 ---
const socket = ref(null);
const socketStatus = ref('');

const statusClass = computed(() => {
  switch (socketStatus.value) {
    case '连接成功': return 'status-success';
    case '连接中...': return 'status-connecting';
    case '连接已断开':
    case '连接失败': return 'status-error';
    default: return '';
  }
});

function connectWebSocket() {
  if (!socketUrl.value) {
    socketStatus.value = '连接失败: 无效的URL';
    return;
  }

  if (socket.value && socket.value.connected) {
    socketStatus.value = '连接已建立，无需重复连接';
    return;
  }

  socketStatus.value = '连接中...';
  try {
    if (socket.value) {
      socket.value.disconnect();
    }
    socket.value = io(socketUrl.value);

    socket.value.on("connect", () => {
      socketStatus.value = '连接成功';
      console.log("Socket.IO 已连接, ID:", socket.value.id);
    });

    socket.value.on("disconnect", (reason) => {
      socketStatus.value = '连接已断开';
      console.log("Socket.IO 已断开, 原因:", reason);
    });

    socket.value.on("connect_error", (error) => {
      socketStatus.value = `连接失败: ${error.message}`;
      console.error("Socket.IO 连接错误:", error);
    });

    socket.value.onAny((eventName, ...args) => {
      console.log(`收到事件 ${eventName}，数据:`, args);
      const receivedData = {
        event: eventName,
        data: args,
        timestamp: new Date().toLocaleTimeString(),
        type: 'received',
      };
      socketResponses.value.push(JSON.stringify(receivedData, null, 2));
    });
  } catch (error) {
    socketStatus.value = `连接失败: ${error.message}`;
    console.error(error);
  }
}

function disconnectWebSocket() {
  if (socket.value) {
    socket.value.disconnect();
  }
}

// --- 模块3: WebSocket 消息 ---
const messages = ref({
  msg1: '',
  msg2: '',
  msg3: '',
});
const socketResponses = ref([]);

async function sendWebSocketMessages() {
  if (!socket.value || !socket.value.connected) {
    alert('Socket.IO 未连接!');
    return;
  }
  loading.value.socketSend = true;
  const messagesToSend = [messages.value.msg1, messages.value.msg2, messages.value.msg3];

  for (const msg of messagesToSend) {
    if (msg) {
      const payload = {
        type: 'sent',
        timestamp: new Date().toLocaleTimeString(),
        content: msg
      };
      socket.value.send(JSON.stringify(payload));
      socketResponses.value.push(JSON.stringify(payload, null, 2)); // 将发送的消息也添加到记录中
      await new Promise(resolve => setTimeout(resolve, 500)); // 模拟分流间隔
    }
  }
  loading.value.socketSend = false;
}
</script>

<style scoped>
/* Google Fonts - Roboto */

.test-api-page {
  --primary-color: #1976D2;
  --primary-color-hover: #1565C0;
  --background-color: #f5f5f5;
  --card-background-color: #ffffff;
  --text-color: #212121;
  --secondary-text-color: #757575;
  --border-color: #e0e0e0;
  --success-color: #4CAF50;
  --error-color: #F44336;
  --warning-color: #FFC107;
  --font-family: 'Roboto', sans-serif;

  font-family: var(--font-family);
  background-color: var(--background-color);
  color: var(--text-color);
  padding: 24px;
  max-width: 900px;
  margin: 20px auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.page-header {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 2.25rem;
  font-weight: 500;
  color: var(--primary-color);
  text-align: center;
}

.module-card {
  background-color: var(--card-background-color);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 24px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: box-shadow 0.3s ease;
}

.module-card:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.module-title {
  font-size: 1.5rem;
  font-weight: 500;
  padding: 16px 24px;
  background-color: rgba(25, 118, 210, 0.05);
  border-bottom: 1px solid var(--border-color);
  color: var(--primary-color);
}

.module-content {
  padding: 24px;
}

.module-description {
  color: var(--secondary-text-color);
  margin-bottom: 1.5rem;
  line-height: 1.6;
}

.input-group {
  margin-bottom: 1.5rem;
}

.input-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-color);
  font-size: 0.875rem;
}

textarea,
input[type="text"] {
  width: -webkit-fill-available;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 1rem;
  font-family: var(--font-family);
  transition: border-color 0.3s, box-shadow 0.3s;
  background-color: #fafafa;
}

textarea:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
}

textarea {
  resize: vertical;
}

#json-input {
  min-height: 120px;
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.btn {
  padding: 10px 20px;
  font-size: 1rem;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s, box-shadow 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
  box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 3px 1px -2px rgba(0, 0, 0, 0.12), 0 1px 5px 0 rgba(0, 0, 0, 0.2);
}

.btn-primary:hover {
  background-color: var(--primary-color-hover);
  box-shadow: 0 3px 3px 0 rgba(0, 0, 0, 0.14), 0 1px 7px 0 rgba(0, 0, 0, 0.12), 0 3px 1px -1px rgba(0, 0, 0, 0.2);
}

.btn:disabled {
  background-color: #cccccc;
  color: #888888;
  cursor: not-allowed;
  box-shadow: none;
}

.response-area {
  margin-top: 24px;
  padding: 16px;
  background-color: #f9f9f9;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.response-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text-color);
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  background-color: #efefef;
  padding: 12px;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
}

.response-list {
  list-style-type: none;
  padding: 0;
}

.response-list li {
  margin-bottom: 8px;
}

.status {
  font-weight: 700;
  padding: 8px 12px;
  border-radius: 4px;
  display: inline-block;
}

.status-success {
  background-color: rgba(76, 175, 80, 0.1);
  color: var(--success-color);
}

.status-error {
  background-color: rgba(244, 67, 54, 0.1);
  color: var(--error-color);
}

.status-connecting {
  background-color: rgba(255, 193, 7, 0.1);
  color: var(--warning-color);
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 1s ease-in-out infinite;
  margin-right: 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>