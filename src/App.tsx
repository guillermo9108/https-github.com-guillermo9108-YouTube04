import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import { getBasename } from './utils/router'

function App() {
  // ⚠️ CRITICAL: DO NOT DELETE THIS LINE ⚠️
  //
  // MPA 架构必需配置 - 自动检测 basename
  //
  // 为什么必须保留：
  // 1. 本项目使用 MPA（多页应用）架构，每个 app 有独立路径：/apps/{app_id}/
  // 2. 不同环境的 basename 不同：
  //    - 开发环境: /apps/my-app
  //    - 预览环境: /（独立子域名）
  // 3. getBasename() 自动检测当前环境，无需手动配置
  //
  // ❌ 删除后果：
  // - 所有路由跳转会 404（跳转到错误的 URL）
  // - <Link to="/about"> 会跳到 /about 而不是 /apps/{app_id}/about
  // - 页面刷新后无法匹配路由
  //
  // ✅ 正确示例：
  //    URL: http://localhost:8000/apps/my-app/about
  //    basename: /apps/my-app (自动检测)
  //    Route path="/about" 匹配成功 ✅
  //
  // ❌ 错误示例（删除 basename）：
  //    URL: http://localhost:8000/apps/my-app/about
  //    basename: / (默认)
  //    Route path="/about" 无法匹配 ❌
  //
  const basename = getBasename()

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
