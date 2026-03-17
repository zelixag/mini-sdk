import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 在 pre 环境加载 vconsole
// @ts-ignore
if (import.meta.env.VITE_IS_VCONSOLE) {
  const script = document.createElement('script');
  script.src = 'https://media.youyan.xyz/youling-lite-sdk/vconsole.js';
  script.onload = function() {
    if (typeof (window as any).VConsole !== 'undefined') {
      new (window as any).VConsole();
    }
  };
  document.head.appendChild(script);
}



createApp(App).mount('#app')
