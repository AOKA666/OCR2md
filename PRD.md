---

# Screenshot to Text / Markdown Chrome Extension

## MVP 需求文档（轻交互版，适合发给 Codex）

## 1. 项目目标

开发一个 Chrome 插件，实现以下核心能力：

用户点击插件图标或使用快捷键后，**不弹出大面板**，而是直接进入截图模式。用户拖拽框选页面中的任意区域后，在该区域右下角显示一个轻量操作条，允许用户选择：

* Extract Text
* To Markdown
* Cancel

插件随后执行 OCR 或 OCR + AI 结构化，并将结果以轻量方式展示和复制。

核心原则：

* 不遮挡页面
* 不先弹大窗口
* 截图流程足够快
* 更接近原生截图工具体验

---

## 2. 产品定位

这是一个面向开发者、内容创作者、AI 用户的轻量效率插件。

典型使用场景：

* 截网页局部内容，提取成纯文本
* 截表格 / 文档 / UI 区域，转成 Markdown
* 给 Obsidian / Notion / LLM 提供结构化输入
* 从网页截图中快速提取内容，而不是手动抄写

---

## 3. 目标交互

### 理想交互流程

```text
用户点击插件图标 / 触发快捷键
↓
当前网页进入截图选择模式
↓
鼠标变成十字准星
↓
用户拖拽框选区域
↓
松开鼠标，选区保留高亮
↓
选区右下角出现一个小操作条：
[Extract Text] [To Markdown] [Cancel]
↓
用户点击某个操作
↓
开始处理
↓
结果展示 / 复制
```

### 关键要求

1. 点击插件后**不能先弹出很大的 popup**
2. 截图交互必须发生在网页上
3. 操作按钮必须是 **小型悬浮条**
4. 悬浮条默认放在选区右下角，若空间不足可自动调整到右上角或左下角
5. 整体体验要轻，不像“打开一个小应用”，而像“调用一个系统工具”

---

## 4. MVP 功能范围

### 必做功能

#### 4.1 触发方式

支持两种触发方式：

* 点击插件图标
* 快捷键触发

触发后直接进入截图模式。

---

#### 4.2 区域框选截图

用户在当前网页中拖拽框选任意区域。

要求：

* 页面显示半透明遮罩
* 框选区域高亮
* 鼠标为十字准星
* 支持按 `Esc` 退出
* 松开鼠标后完成区域选择

---

#### 4.3 选区右下角轻量操作条

框选完成后，在选区附近显示一个小型操作条，包含三个按钮：

* Extract Text
* To Markdown
* Cancel

要求：

* 尺寸小
* 不遮挡主要内容
* 样式简洁
* 只在选区完成后出现
* 点击 Cancel 后清除选区并退出截图模式

---

#### 4.4 Extract Text

点击后：

* 对选区截图执行 OCR
* 输出纯文本结果
* 支持英文和中文
* 结果可复制

---

#### 4.5 To Markdown

点击后：

* 先 OCR
* 再调用 AI 将 OCR 文本整理成 Markdown
* 结构尽量保留原始层级

输出尽量包括：

* 标题
* 段落
* 列表
* 表格
* 代码块

---

#### 4.6 结果展示

MVP 阶段不做大面板常驻展示，采用轻量结果卡片。

建议方式：

处理完成后，在页面右侧或选区附近弹出一个 **小结果面板**，内容包括：

* 标题（Text Result / Markdown Result）
* 文本预览区
* Copy 按钮
* Close 按钮

要求：

* 尺寸中小
* 可滚动
* 不遮挡整个页面
* 只在用户处理完成后出现

---

#### 4.7 一键复制

结果卡片中提供：

* Copy Text
* Copy Markdown

复制成功后显示短暂提示：

* Copied

---

## 5. 不做的内容

MVP 暂不包含：

* 登录注册
* 云端历史记录
* 多次截图批处理
* 截图后图片保存
* 本地文件上传识别
* 多语言 UI
* 复杂设置页
* 模型切换
* OCR 引擎切换

---

## 6. 技术实现方案

## 6.1 技术栈

* Chrome Extension Manifest V3
* HTML / CSS / Vanilla JS
* content script 注入页面交互层
* background service worker
* OCR：Tesseract.js
* AI：OpenAI API

---

## 6.2 截图方案

推荐实现：

* 使用 `chrome.tabs.captureVisibleTab` 获取当前可见页面截图
* 通过 content script 获取用户选区坐标
* 用 canvas 按选区坐标裁剪图像
* 得到裁剪后的 base64 图片

原因：

* 稳定
* 可控
* 适合网页区域截图
* 不需要系统级权限

---

## 6.3 OCR 方案

使用：

* `Tesseract.js`

要求：

* 支持英文
* 支持中文
* 输入为裁剪后的图像
* 输出为纯文本

---

## 6.4 Markdown 结构化方案

点击 `To Markdown` 时：

1. 先获取 OCR 纯文本
2. 将 OCR 文本发送到 LLM
3. 返回结构化 Markdown

模型建议：

* 成本优先：`gpt-4.1-mini`
* 质量优先：更高质量模型可后续再切

Prompt 要求：

* 保留原文结构
* 修正常见 OCR 错误
* 尽量识别标题、列表、表格、代码块
* 不要过度改写原文含义

---

## 7. 页面交互细节

## 7.1 截图模式 UI

进入截图模式后：

* 整个页面有一层浅色遮罩
* 鼠标变十字准星
* 用户拖拽时实时显示选区边框
* 边框清晰可见
* 选区外区域保持半透明

---

## 7.2 操作条样式

操作条必须尽量小，建议类似：

```text
[Extract Text] [To Markdown] [×]
```

样式要求：

* 白底 / 深字
* 圆角
* 阴影轻微
* 高度约 32–36px
* 不使用夸张颜色
* 风格偏系统工具，而不是营销风

---

## 7.3 结果卡片样式

结果卡片要求：

* 中小尺寸
* 固定在右侧，或靠近选区显示
* 内部有滚动区
* 显示结果预览
* 有 Copy 和 Close

不要做成全屏弹层。

---

## 8. 快捷键设计

支持快捷键触发截图模式。

建议默认快捷键：

* `Alt + Shift + S`

说明：

* Chrome 扩展快捷键最终由用户在浏览器扩展快捷键设置中配置
* 代码中需支持 command

---

## 9. 状态流转

### 状态 1：Idle

无任何 UI

### 状态 2：Selecting

用户正在框选区域

### 状态 3：Action Bar Visible

选区完成，显示小操作条

### 状态 4：Processing OCR

显示轻量 loading

### 状态 5：Processing Markdown

显示轻量 loading

### 状态 6：Result Visible

展示结果卡片

### 状态 7：Cancelled

清除所有临时 UI，回到 idle

---

## 10. 错误处理

需要处理以下情况：

### 截图失败

提示：

* Screenshot failed

### OCR 失败

提示：

* Text extraction failed

### Markdown 生成失败

提示：

* Markdown generation failed

### 无识别内容

提示：

* No text detected in selected area

### API key 未配置

提示：

* OpenAI API key not configured

所有错误提示都应为轻量 toast，不要弹系统 alert。

---

## 11. 配置项

MVP 只保留最少配置：

### 必需

* OpenAI API Key

建议放在简单设置页或首次使用时输入。

暂不做复杂配置。

---

## 12. 文件结构建议

```text
screenshot-to-markdown-extension/
├── manifest.json
├── background.js
├── content.js
├── overlay.js
├── ocr.js
├── ai.js
├── result-panel.js
├── options.html
├── options.js
├── styles/
│   ├── overlay.css
│   └── result.css
└── assets/
```

---

## 13. 核心模块说明

### 13.1 background.js

负责：

* 响应插件点击
* 响应快捷键
* 调用截图 API
* 与 content script 通信

### 13.2 content.js / overlay.js

负责：

* 注入截图遮罩层
* 框选区域
* 显示小操作条
* 显示 loading
* 显示结果卡片

### 13.3 ocr.js

负责：

* 调用 Tesseract.js 识别文本

### 13.4 ai.js

负责：

* 调用 OpenAI API
* 将 OCR 文本转为 Markdown

---

## 14. 成功标准

MVP 成功的判断标准：

1. 点击插件后不会出现大 popup
2. 用户能立即进入截图模式
3. 能顺利拖拽选区
4. 选区右下角能出现小操作条
5. 能提取纯文本
6. 能生成 Markdown
7. 能一键复制结果
8. 整体过程轻量流畅

---

## 15. 产品体验要求

这是这版最重要的要求：

### 必须避免

* 点击插件后出现大工具框
* 常驻巨大 sidebar
* 一开始就弹结果窗口
* 很多复杂按钮
* 像小型网页应用一样“占页面”

### 必须做到

* 像系统截图工具
* 先截图，后操作
* 小浮层、小结果卡片
* 尽量不打断用户当前浏览

---
