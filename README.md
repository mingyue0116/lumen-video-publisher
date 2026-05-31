# Video Publisher 🎬

> 多平台视频发布助手 — 一键填写抖音、小红书、B站、视频号、Twitter 的发布表单

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT--NC-green)
![Chrome](https://img.shields.io/badge/chrome-mv3-brightgreen)

---

## 为什么做这个工具？

做自媒体的朋友都知道，一条视频要同时在 **抖音、小红书、B站、视频号、Twitter** 发布，意味着你要：

1. 打开 5 个网页
2. 上传 5 次视频
3. 填 5 遍标题
4. 写 5 遍简介
5. 打 5 遍话题标签

这个扩展把这些重复劳动变成 **一键完成**。

## 功能

| 功能 | 说明 |
|------|------|
| 🎥 视频上传 | 自动注入文件，无需手动选择 |
| ✏️ 标题填写 | 自动填入各平台标题输入框 |
| 📝 简介填写 | 自动填入作品简介 |
| 🏷️ 话题标签 | 自动按各平台格式填入标签 |
| 🖼️ 封面上传 | 支持竖版/横版封面注入 |
| 💾 草稿保存 | 文字内容自动保存，防丢失 |
| 🔄 批量发布 | 选择多个平台，顺序自动填写 |
| 🛡️ 反追踪 | 自动拦截平台的监控/指纹请求 |

## 支持的平台

| 平台 | 页面地址 | 状态 |
|------|----------|------|
| ![抖音](https://www.google.com/s2/favicons?domain=douyin.com) 抖音 | creator.douyin.com | ✅ 视频·标题·简介·标签 |
| ![小红书](https://www.google.com/s2/favicons?domain=xiaohongshu.com) 小红书 | creator.xiaohongshu.com | ✅ 视频·标题·简介·标签 |
| ![B站](https://www.google.com/s2/favicons?domain=bilibili.com) B站 | member.bilibili.com | ✅ 视频·标题·简介·标签 |
| ![视频号](https://www.google.com/s2/favicons?domain=weixin.qq.com) 视频号 | channels.weixin.qq.com | ✅ 视频·标题·简介·标签 |
| ![Twitter](https://www.google.com/s2/favicons?domain=x.com) Twitter/X | x.com/compose/post | ✅ 视频·标题·简介·标签 |

## 安装

### 从源码安装

```bash
git clone https://github.com/<your-repo>/video-publisher.git
cd video-publisher
npm install
npm run build
```

1. 打开 Chrome 扩展管理页面 `chrome://extensions`
2. 开启右上角「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择 `build/chrome-mv3-prod` 目录

### 从 Chrome 商店安装

> 即将上线...

## 使用方法

### 快速开始

1. 点击浏览器工具栏的扩展图标 ![icon](icon48.plasmo.aced7582.png) 打开侧边栏
2. 选择要发布的平台
3. 上传视频文件（支持 `.mp4`, `.mov`, `.avi` 等常见格式，<1GB）
4. 填写标题、作品简介、话题标签
5. 点击「**发布到所选平台**」

### 发布流程

```
1. 选择平台 → 2. 上传视频 → 3. 填写信息 → 4. 一键发布
                                            ↓
                    扩展自动打开各平台页面 → 后台填写表单
                                            ↓
                    跳转到第一个平台 → 用户检查 → 手动点发布
```

> **注意**：扩展负责**填写表单**，最终发布需要你在每个平台页面手动点击「发布」按钮。
> 这是为了保护你的账号安全，避免自动发布带来的风险。

### 标签格式说明

不同平台的标签格式不同，扩展会自动适配：

| 平台 | 标签格式 | 示例 |
|------|----------|------|
| 抖音 | `#话题1 #话题2` | #搞笑 #美食 |
| 小红书 | `#话题1 #话题2` | #穿搭 #日常 |
| B站 | 按回车添加，无 `#` 前缀 | 搞笑 → Enter |
| 视频号 | `#话题1 #话题2` | #科技 #数码 |
| Twitter | `#topic1 #topic2` | #funny #tech |

## 项目结构

```
src/
├── background/          # Service Worker
│   └── index.ts         # 打开页面、注入脚本、反追踪
├── contents/            # Content Scripts
│   ├── douyin.ts        # 抖音填充逻辑
│   ├── xiaohongshu.ts   # 小红书填充逻辑
│   ├── bilibili.ts      # B站填充逻辑
│   ├── shipinhao.ts     # 视频号填充逻辑（含 Wujie 适配）
│   ├── twitter.ts       # Twitter 填充逻辑
│   └── publisher.ts     # 通用发布桥接
└── sidepanel/
    └── index.tsx        # 侧边栏 UI（React）
```

## 技术栈

- **[Plasmo](https://www.plasmo.com/)** — 浏览器扩展框架
- **React 18** — 侧边栏 UI
- **TypeScript** — 全栈类型安全
- **Chrome MV3** — 最新扩展规范
- **MAIN world 注入** — 突破 ISOLATED world 限制，直接操作页面 DOM

## 贡献

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支: `git checkout -b feat/xxx`
3. 修改代码
4. 提交 PR

### 开发指南

```bash
# 克隆后安装依赖
npm install

# 构建
git clone <your-fork-url>
npm run build

# 构建产物在 build/chrome-mv3-prod/
# Chrome 加载即可调试
```

### 添加新平台

1. 在 `src/contents/` 下新建 `newplatform.ts`
2. 实现文件注入 + 表单填充逻辑
3. 在 `src/background/index.ts` 的 `PLATFORM_URLS` 添加 URL
4. 在 `src/sidepanel/index.tsx` 的 `PLATFORMS` 添加配置

## 许可证

本项目采用 **MIT License with Non-Commercial Clause** - 详见 [LICENSE](./LICENSE) 文件。

- ✅ 允许个人免费使用
- ✅ 允许修改和贡献代码
- ❌ 禁止商业用途（售卖、付费服务等）
- ❌ 必须保留版权声明

## 免责声明

本工具仅供学习交流使用。请遵守各平台的服务条款。使用者需自行承担使用风险。
