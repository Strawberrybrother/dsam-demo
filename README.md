# DS-160 填写参考助手

这是一个贴近 CEAC/DS-160 实际流程的静态网站原型。定位不是聊天机器人，而是快速、安全、明确的字段操作指南：用户选择签证类别和字段后，页面优先显示“这题怎么填”“下一步照做”“提交前核对”“先暂停核对”。

## 当前技术选择

- `index.html`：页面结构，保留静态部署能力
- `styles.css`：响应式工作台界面
- `app.js`：搜索、筛选和渲染逻辑
- `data/ds160-content.js`：字段知识库、签证类别、章节、官方来源和流程要点
- `server.js`：零依赖 Node.js 后端，负责静态文件服务和字段 API
- `assets/ds160-desk.png`：项目内视觉资产

这个结构是为后续迁移到 Next.js 或 Node 做准备的：`data/ds160-content.js` 可以直接迁到 `lib/`、数据库 seed、JSON API 或 CMS。

## 后端选择

第一版后端选择 Node.js，暂时不用 Express/Fastify，原因是：

- 零依赖，部署更快，出错面更小
- 当前字段库已经是 JavaScript 数据，前后端可以共用
- 适合先发布 MVP，再按需要升级到 Next.js、Express、Fastify 或数据库
- 不在前端暴露任何模型 API Key，后续接 AI/RAG 时必须走后端

## 本地运行

```bash
node server.js
```

默认地址：

```text
http://127.0.0.1:4173
```

检查脚本：

```bash
npm run check
```

如果 Windows PowerShell 禁止运行 `npm.ps1`，可用：

```bash
cmd /c npm run check
```

## API

- `GET /api/health`：服务健康检查
- `GET /api/meta`：章节、签证类别、官方来源、流程要点
- `GET /api/fields`：字段列表，支持 `profile`、`section`、`q`
- `GET /api/fields/:id`：字段详情
- `GET /api/sources`：官方来源列表

示例：

```text
/api/fields?profile=fjm&section=student
```

## 产品原则

- 不做开放式聊天入口，避免用户把模型输出当成确定答案
- 每个字段先给可执行步骤，再给解释和官方依据
- 高风险问题优先提示暂停提交并咨询移民律师或领事馆
- 不确定字段只生成安全核对清单，不编造官方规则或直接判断答案
- 字段库标注为“常见字段覆盖”，不宣称是 DS-160 官方全量字段清单
- 当前前端仅开放 B1/B2；F/M/J、H/L/O/P/R、K、E 等类别按钮先置灰，待逐类验证后再开放

## 字段覆盖说明

当前字段库有 55 个常见字段。它不是官方全量清单，因为 DS-160 会根据签证类别、国籍、年龄、职业、旅行目的和前序回答动态显示问题。美国国务院 FAQ 也说明，部分申请人会因赴美目的被要求提供额外信息。

后续如要接近“全量覆盖”，建议按签证类别建立场景矩阵，例如 B1/B2、F1、J1、H1B、L1、O1、K1、E2，并逐类记录 CEAC 实际页面字段和显示条件。

## 官方依据

当前内容主要依据：

- CEAC DS-160 Instructions Page: https://ceac.state.gov/GenNIV/Default.aspx
- U.S. Department of State DS-160 page: https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/forms/ds-160-online-nonimmigrant-visa-application.html
- U.S. Department of State DS-160 FAQ: https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/forms/ds-160-online-nonimmigrant-visa-application/ds-160-faqs.html

## 使用方式

直接用浏览器打开 `index.html` 即可。

## 内容边界

本工具仅供 DS-160 填写理解与准备参考，不构成法律意见。涉及拒签、犯罪记录、移民违规、虚假陈述、身份失效或安全背景问题时，应咨询有资质的移民律师或领事馆。
