# OCR2Markdown 后端（Vercel 部署）

## 目录结构

- `api/markdown.js`：主接口，接收 `ocrText` 并返回 `markdown`
- `api/health.js`：健康检查接口
- `vercel.json`：Vercel 运行时配置

## 1) 部署到 Vercel

1. 把仓库推到 GitHub。
2. 在 Vercel 新建项目并导入该仓库。
3. `Root Directory` 选择 `backend`。
4. Framework Preset 选 `Other`。
5. Deploy。

## 2) 配置环境变量（Vercel Project Settings）

必填：

- `ARK_API_KEY`：你的火山方舟 API Key

可选：

- `ARK_MODEL`：默认 `doubao-seed-1-6-flash-250828`
- `BACKEND_TOKEN`：给你的 API 再加一层 token 鉴权

## 3) 接口定义

- `GET /api/health`：返回 `{ "ok": true }`
- `POST /api/markdown`

请求体：

```json
{
  "ocrText": "你的 OCR 文本"
}
```

成功响应：

```json
{
  "markdown": "转换后的 Markdown"
}
```

如果你设置了 `BACKEND_TOKEN`，请求头需要：

`Authorization: Bearer <BACKEND_TOKEN>`

## 4) 插件配置

修改 `extension/ai.js`：

- `BACKEND_URL = 'https://你的项目域名.vercel.app/api/markdown'`
- 如果启用了后端 token：同步填写 `BACKEND_TOKEN`

