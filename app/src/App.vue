<!-- 实现一个简单的路由，引入main和PluginDemo -->
<template>
  <WalkTest v-if="IS_WALK_WINDOW" />
  <div v-else class="app-container">
    <!-- 导航栏 -->
    <nav class="nav-bar" v-if="!isFullScreen">
      <button 
        class="nav-btn" 
        :class="{ active: currentPage === 'main' }"
        @click="currentPage = 'main'"
      >
        主界面
      </button>
      <button 
        class="nav-btn" 
        :class="{ active: currentPage === 'multi' }"
        @click="currentPage = 'multi'"
      >
        多数字人切换
      </button>
      <button 
        class="nav-btn" 
        :class="{ active: currentPage === 'offline' }"
        @click="currentPage = 'offline'"
      >
        离线测试
      </button>
      
    </nav>

    <!-- 内容区域 -->
    <div class="content-container">
      <Main v-if="currentPage === 'main'" @fullScreen="fullScreen" />
      <MultiAvatarDemo v-if="currentPage === 'multi'" />
      <OfflineTest v-if="currentPage === 'offline'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Main from './Main.vue';
import OfflineTest from './OfflineTest.vue';
import MultiAvatarDemo from './MultiAvatarDemo.vue';
import WalkTest from './components/walk-test.vue';

const currentPage = ref('main');
const isFullScreen = ref(false);
  // @ts-ignore
const IS_WALK_WINDOW = window.IS_WALK_WINDOW || false;
declare global {
  interface Window {
    IS_WALK_WINDOW?: boolean; // 声明可选属性，符合实际场景
  }
}
function fullScreen(param: boolean) {
  isFullScreen.value = param;
}
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.nav-btn {
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #f3f4f6;
  color: #374151;
}

.nav-btn:hover {
  background: #e5e7eb;
}

.nav-btn.active {
  background: #4f46e5;
  color: white;
}

.content-container {
  flex: 1;
  background: #f9fafb;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .nav-bar {
    padding: 0.5rem;
  }

  .nav-btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }

  .content-container {
    padding: 1rem;
  }
}
</style>