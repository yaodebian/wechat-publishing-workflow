#!/usr/bin/env node
import path from 'node:path'
import { Command } from 'commander'
import { loadConfig, toolRoot } from './config.js'
import { publishArticle } from './pipeline.js'

const program = new Command()
  .name('wechat-publisher')
  .description('将 Markdown、Mermaid 和本地配图一起推送到微信公众号草稿箱')

function addSharedOptions(command) {
  return command
    .argument('<article>', 'Markdown 文章路径')
    .option('--cover <path>', '覆盖文章封面路径')
    .option('--author <name>', '覆盖作者名')
    .option('--digest <text>', '覆盖摘要')
    .option('--source-url <url>', '覆盖原文链接')
    .option('--template <path>', '覆盖富文本模板')
    .option('--output <dir>', '指定构建产物目录')
    .option('--media-id <id>', '更新指定 media_id 的现有草稿')
}

async function run(articlePath, options, dryRun) {
  const config = { ...loadConfig({ author: options.author, sourceUrl: options.sourceUrl }), toolRoot }
  const result = await publishArticle(articlePath, config, {
    dryRun,
    cover: options.cover,
    author: options.author,
    digest: options.digest,
    sourceUrl: options.sourceUrl,
    template: options.template ? path.resolve(options.template) : undefined,
    outputDir: options.output,
    draftMediaId: options.mediaId
  })

  if (dryRun) {
    console.log(`预览已生成：${result.previewPath}`)
    console.log(`Mermaid 图表：${result.mermaidImages.length} 张；本地图片：${result.localImages.length} 张`)
  } else {
    console.log(`草稿${result.operation === 'update' ? '更新' : '创建'}成功：${result.article.title}`)
    console.log(`草稿 media_id：${result.mediaId}`)
    console.log(`本地预览：${result.previewPath}`)
  }
}

addSharedOptions(program.command('preview').description('只在本地构建和预览，不调用微信接口'))
  .action((article, options) => run(article, options, true))

addSharedOptions(program.command('publish').description('构建并发布到微信公众号草稿箱'))
  .action((article, options) => run(article, options, false))

program.parseAsync().catch((error) => {
  console.error(`发布失败：${error.message}`)
  if (process.env.DEBUG && error.stack) console.error(error.stack)
  process.exitCode = 1
})
