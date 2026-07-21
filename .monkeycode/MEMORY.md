# QQ机器人查询管理 项目记忆

## 部署

- **部署目标**：飞牛 NAS Docker，不部署到云服务器
- **云服务器** (103.236.92.3:41185)：只跑幼儿园项目，**不要在上面改任何东西**
- **构建命令**：`npm run build`，产物在 `dist/`
- **Docker 部署包**：`tar czf qqbot-deploy.tar.gz dist default.conf Dockerfile docker-entrypoint.sh server/`
- **部署命令**（在飞牛终端执行）：
  ```bash
  curl -fsSL <下载url> | tar xz && docker build -t qq-batch-query . && docker stop qq-batch-query 2>/dev/null; docker rm qq-batch-query 2>/dev/null; docker run -d --name qq-batch-query --restart unless-stopped -p 3080:80 -v /vol1/@appstore/docker/qqbot-data:/data qq-batch-query
  ```
- **从 GitHub 部署**（飞牛 Docker 内已有旧项目目录时）：
  ```bash
  git pull && npm run build && docker build -t qq-batch-query . && docker stop qq-batch-query 2>/dev/null; docker rm qq-batch-query 2>/dev/null; docker run -d --name qq-batch-query --restart unless-stopped -p 3080:80 -v /vol1/@appstore/docker/qqbot-data:/data qq-batch-query
  ```
- **飞牛访问**：不能直接 SSH，端口开了但 FN Connect 不走原生 TCP。需通过 FN Connect WebUI 暴露 Docker 端口或用 Web 界面管理。
- **GitHub**：`https://github.com/lyrice1/QQjiqirenchaxun`

## Nginx/Docker 配置

- `default.conf` 代理 `/api/` → `http://172.17.0.1:3100/`（同机 NapCat Docker）
- `default.conf` 代理 `/data-api/` → `http://127.0.0.1:3002`（容器内 Express 后端）
- Dockerfile 使用多阶段构建：backend-deps 阶段安装 server npm 依赖，运行阶段用 nginx:alpine + nodejs
- `docker-entrypoint.sh` 先启动 Node.js 后端，再启动 Nginx
- 数据库文件通过 `-v /vol1/@appstore/docker/qqbot-data:/data` 挂载到宿主机，确保持久化
- NapCat 在飞牛 Docker 中，外部通过 FN Connect（如 `https://9ee993fa6a31-0.ly19941011.5ddd.com/`）访问
- `index.html` 必须设 `Cache-Control: no-cache`，否则旧页面缓存导致需要刷新

## 代码踩坑

### setInterval 必须带延迟参数
```js
// 错误：缺少延迟参数，轮询过于频繁阻塞 UI
setInterval(async () => { ... })
// 正确：
setInterval(async () => { ... }, 1500)
```

### overflow: hidden 阻止 position: sticky
- 父元素有 `overflow: hidden` 时，子元素的 `position: sticky` 会失效
- 要让 `.group-header` sticky，必须从 `.group` 中移除 `overflow: hidden`

### position: sticky 在嵌套结构中的问题
- 如果 sticky 元素嵌套在多层 div 内，可能因中间元素的布局上下文而失效
- 解决方案：将 sticky 元素提升到滚动容器的直接子级，或使用内联 style：`style="position:sticky;top:90px;z-index:5"`
- Vue scoped CSS 的 `position: sticky` 可能因 data 属性 scope 机制失效，用内联 style 绕过

### Vue 模板标签闭合
- 修改模板后先跑 `npm run build` 确认无语法错误
- 常见错误：`<div>` 缺少闭合 `</div>`，build 报 "Element is missing end tag"

### border-radius 在 WebKit 中可能干扰 sticky
- `.panel` 元素的 `border-radius` + `box-shadow` 在 iOS Safari 中可能阻止子元素 sticky 生效
- 如果 sticky 始终无效，尝试移除父元素的 `border-radius` 和 `box-shadow`

## 数据备份

- **服务端存储**：数据存储在 SQLite 数据库 `/data/data.db`（Docker 挂载确保持久化）
- **前端回退**：localStorage 仍保留作为离线缓存，服务端不可用时回退到本地
- `saveGroups()` 同时写入 localStorage（备份 key）和通过 `/data-api/groups` PUT 到服务端
- `loadGroups()` 优先从服务端加载，失败时回退到 localStorage

## 服务端 API

- Express 后端运行在容器内 `127.0.0.1:3002`，Nginx 代理 `/data-api/` → `http://127.0.0.1:3002`
- API 端点：
  - `GET /data-api/groups` - 获取所有分组和项目
  - `PUT /data-api/groups` - 全量保存
  - `POST /data-api/groups/reset` - 重置为默认数据

## 按钮发送行为

- "上车"：发送项目名（如"中视频"），mode=login
- "查询"：发送"项目名+查询"（如"中视频查询"），mode=query
- "管理"：发送"项目名+管理"（如"中视频管理"），mode=manage
- 自定义指令：发送用户输入的内容本身，不拼接项目名
