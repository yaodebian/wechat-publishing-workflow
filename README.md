# 微信公众号排版与草稿工作流

把已经写好的文章交给 AI，完成 **排版、封面设计、配图设计和发送微信草稿箱**。持续迭代的开源工作流，适用于具备文件操作、终端、图片生成和浏览器能力的 AI 助手，不绑定特定模型或客户端。

正文由作者提前完成。工作流不负责选题、研究、写稿、润色、扩写或纠错。

## 给 AI 的使用引导（请 AI 先读）

**本节是给执行任务的 AI 的指令。** 收到用户请求后，先读 [AGENTS.md](AGENTS.md) 和 [WORKFLOW.md](WORKFLOW.md)，再执行：

1. 确认完整原稿和用户授权范围，保留原文快照；锁定标题、摘要、正文、标点、代码、列表、表格和 URL。不得补写摘要、图注、开场或结尾。
2. 为本篇设计封面和有信息价值的配图。封面至少 900×383，约 2.35:1，重要内容放在裁切安全区；图片生成使用当前环境可用工具，精确中文逐字核对。图片只解释原稿已有内容。
3. 每篇使用独立的 `index.md`、`assets/`、`review/`。只调整呈现，不改变阅读文字；封面只用于草稿封面，不重复插入正文。
4. 运行正文锁定、预览和发布检查命令。在手机约 390px 及 PC 宽度检查全文、图片、代码、表格、链接与结尾，核对最终 HTML 和原稿。不得凭命令成功虚构视觉检查通过。
5. `review:publication` 只生成待审检查记录。实际完成检查后，按生成的字段记录证据并批准；不能为了绕过校验填入虚假结论。修改资产后重新绑定哈希。
6. 用户明确授权发送或更新草稿后才运行 `publish`。更新须带 `--media-id`，目标不明先停止核实。创建前查重，写入结果不明先查询，不能盲目重试。
7. 上传后按同一 ID 回读全文并比对原稿，检查微信托管图片、封面及实际微信预览，再报告草稿结果。不得正式发布、群发、排期或删除。

发现文字问题只报告，不静默修改。当前环境缺少图片生成、浏览器或草稿查询能力时，明确报告未完成步骤并保留本地产物；本 CLI 不自动完成图片设计、截图、查重和上传后的平台回读，需要 AI 使用可用工具或由用户在平台配合完成。

可复制给 AI 的任务：

> 请先阅读本仓库 README.md 中「给 AI 的使用引导」、AGENTS.md 和 WORKFLOW.md。处理我提供的完整文章，只做排版、封面和配图设计，不改正文。完成手机/PC预览和一致性验证，先向我展示结果；尚未授权发送草稿箱。

## 安装

需要 Node.js 20+、npm 和 Chrome/Chromium。命令均在仓库根目录运行：

```bash
npm ci
cp .env.example .env
```

在本机 `.env` 填入 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`，或使用现成的 `WECHAT_ACCESS_TOKEN`。不要将凭证发给 AI 对话或提交到 Git。公众号需要对应接口权限，并在微信后台配置运行机器的公网 IP 白名单。必要时设置 `CHROME_PATH`。

仓库只包含空值配置示例，不包含真实凭证、个人文章、草稿 ID、发布记录、截图或历史缓存。

## 文章结构

```text
articles/example/
├── index.md
├── assets/
│   ├── hero.png
│   └── inline-example.png
└── review/
```

`index.md` 示例（标题和摘要须由用户提供）：

```markdown
---
title: 用户提供的标题
author: 用户提供的作者名
digest: 用户提供的摘要
cover: ./assets/hero.png
cover_display: draft_only
body_lock: ./review/body-lock.json
---

用户提供的完整正文。
```

正文配图使用 `![原稿已有的图片说明](./assets/inline-example.png)`。支持 Markdown、代码高亮、表格和 Mermaid；正式上传前将正文图片保存到本篇 `assets/`。

## 执行顺序

先保存完整正文并锁定，再加入图片引用、设计资产及调整排版：

```bash
npm run lock:body -- ./articles/example
npm run preview -- ./articles/example
npm run review:publication -- ./articles/example
```

预览命令输出 HTML 路径。检查记录使用 `editorial-review.json` 这一兼容文件名，其中 `publication_only` 表示只检查正文一致性、资产和视觉，不代表写作审查。打开生成的记录逐项完成实际检查，保留证据；它不是自动批准命令。已有记录不会被覆盖，调整后须保留历史并重新生成检查记录。

获得用户明确的草稿操作授权、且全部检查通过后：

```bash
# 新建草稿（先查重）
npm run publish -- ./articles/example

# 更新已确认的同一个草稿
npm run publish -- ./articles/example --media-id EXISTING_DRAFT_ID
```

命令名 `publish` 在这里仅指写入草稿箱，不会群发或正式发布。CLI 返回的成功只表示接口写入成功；仍须回读和检查微信真实预览。

## 开发与后续优化

```bash
npm test
npm run check
```

源码位于 `src/`，模板位于 `templates/`。默认模板使用 17px 字号，另提供 16px 的 `templates/essay.html`；可用本机 `.env` 中的 `WECHAT_TEMPLATE=./templates/essay.html` 选择，或在文章 front matter 中配置相对于文章目录的 `template` 路径。模板只保留正文占位符 `{{{content}}}`，不添加署名、口号或其他新文案，也不叠加正文外层左右留白。

当前版本保留人工/AI验收环节。后续可持续改善图片工具适配、预览证据采集、草稿查重及回读自动化。欢迎通过 Issue 和 Pull Request 反馈问题；请只提供脱敏示例，不上传真实凭证或私有文章。

采用 MIT 许可证，见 [LICENSE](LICENSE)。
