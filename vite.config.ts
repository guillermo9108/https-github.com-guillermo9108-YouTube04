import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 从环境变量读取端口配置
const BACKEND_PORT = process.env.BACKEND_PORT || '9000';
const FRONTEND_PORT = process.env.FRONTEND_PORT || '9001';

/**
 * ElementSelectorLoader 脚本
 * 用于在 iframe 中接收父窗口的元素选择器脚本注入
 */
const elementSelectorLoaderScript = `
<!-- Element Selector Loader (Auto-injected by Vite) -->
<script>
(function() {
  console.log('[ElementSelectorLoader] Initializing...');
  let scriptInjected = false;
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'inject-element-selector-script') return;
    if (scriptInjected) { console.log('[ElementSelectorLoader] Script already injected, skipping'); return; }
    console.log('[ElementSelectorLoader] Received script injection request');
    const script = event.data.script;
    if (!script) { console.error('[ElementSelectorLoader] No script content received'); return; }
    try {
      const scriptElement = document.createElement('script');
      scriptElement.id = 'element-selector-injected';
      scriptElement.textContent = script;
      const target = document.head || document.body;
      if (target) {
        target.appendChild(scriptElement);
        scriptInjected = true;
        console.log('[ElementSelectorLoader] Script injected and executed successfully');
        if (window.parent) window.parent.postMessage({ type: 'element-selector-script-injected', success: true }, "*");
      } else {
        console.error('[ElementSelectorLoader] No head or body element found');
      }
    } catch (error) {
      console.error('[ElementSelectorLoader] Failed to inject script:', error);
      if (window.parent) window.parent.postMessage({ type: 'element-selector-script-injected', success: false, error: error.message }, "*");
    }
  });
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'element-selector-loader-ready' }, "*");
    console.log('[ElementSelectorLoader] Ready and waiting for injection request');
  }
})();
</script>
`;

/**
 * Vite 插件：自动注入 ElementSelectorLoader
 * 在所有 HTML 响应的 </body> 前注入脚本
 */
function elementSelectorPlugin() {
  return {
    name: 'element-selector-loader',
    transformIndexHtml(html: string) {
      // 检查是否已经有 ElementSelectorLoader
      if (html.includes('ElementSelectorLoader')) {
        return html;
      }
      // 在 </body> 前注入脚本
      return html.replace('</body>', elementSelectorLoaderScript + '</body>');
    }
  };
}

/**
 * Vite 插件：包裹内联模块脚本
 * 解决 AI 生成代码中变量重复声明的问题
 *
 * 问题：当 HTML 中有多个 <script type="module"> 块时，Dev 模式正常，
 * 但 Build 时 Rollup 会合并脚本，导致同名变量冲突报错。
 *
 * 方案：用 IIFE 包裹内联脚本内容，隔离各自作用域。
 */
function wrapInlineModuleScripts() {
  return {
    name: 'wrap-inline-module-scripts',
    apply: 'build' as any, // 仅在构建时生效
    transformIndexHtml: {
      order: 'pre' as any, // 在其他插件之前执行
      handler(html: string) {
        // 匹配内联的 <script type="module">（不包含 src 属性的）
        return html.replace(
          /<script\s+type=["']module["'](?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
          (match, attrs, content) => {
            // 跳过空脚本
            if (!content.trim()) {
              return match;
            }
            // 检查是否有顶级 import/export 语句（这些不能放在 IIFE 中）
            if (/^\s*(import|export)\s/m.test(content)) {
              return match;
            }
            // 用 IIFE 包裹内容以隔离作用域
            const wrappedContent = `(function() {\n"use strict";\n${content}\n})();`;
            return `<script type="module"${attrs}>${wrappedContent}</script>`;
          }
        );
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    elementSelectorPlugin(),
    wrapInlineModuleScripts()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 优化构建速度
    minify: 'esbuild',  // esbuild 比 terser 快 20-40 倍
    sourcemap: false,   // 预览构建跳过 sourcemap 生成
    rollupOptions: {
      output: {
        manualChunks: undefined  // 减少 chunk 分割以加速构建
      }
    }
  }
})
