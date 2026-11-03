import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { readArticle } from './article.js'
import { renderMermaidBlocks } from './mermaid.js'
import { renderMarkdown } from './markdown.js'
import { processHtmlImages, normalizeImage } from './images.js'
import { applyTemplate } from './template.js'
import { WeChatClient } from './wechat.js'
import { readBodyLock, assertLockedHtml } from './body-lock.js'
import { assertEditorialArticlePublishable } from './editorial-review.js'

function buildId(articlePath) {
  const basename = path.basename(articlePath, path.extname(articlePath)).replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 48)
  const hash = crypto.createHash('sha1').update(path.resolve(articlePath)).digest('hex').slice(0, 8)
  return `${basename}-${hash}`
}

export async function publishArticle(articlePath, config, options = {}) {
  const article = await readArticle(articlePath, config)
  await readBodyLock(article.absolutePath)
  if (!options.dryRun) {
    const assertPublishable = options.assertPublishable || (async (absolutePath) => {
      await assertEditorialArticlePublishable(absolutePath)
    })
    await assertPublishable(article.absolutePath)
  }
  const outputDir = path.resolve(options.outputDir || path.join(config.toolRoot || process.cwd(), '.build', buildId(article.absolutePath)))
  const generatedDir = path.join(outputDir, 'generated')
  const normalizedDir = path.join(outputDir, 'normalized')
  await fs.mkdir(outputDir, { recursive: true })

  const mermaid = await renderMermaidBlocks(article.content, generatedDir, { chromePath: config.chromePath })
  const rendered = renderMarkdown(mermaid.markdown)
  const lockTemplate = options.template || (article.template ? path.resolve(article.baseDir, article.template) : config.template)
  await assertLockedHtml(article.absolutePath, await applyTemplate(rendered, lockTemplate))
  const client = options.client || new WeChatClient(config)
  const processed = await processHtmlImages(rendered, {
    articleDir: article.baseDir,
    outputDir: normalizedDir,
    dryRun: options.dryRun,
    upload: (filePath) => client.uploadArticleImage(filePath)
  })
  const articleTemplate = article.template
    ? path.resolve(article.baseDir, article.template)
    : undefined
  const content = await applyTemplate(processed.html, options.template || articleTemplate || config.template)
  await assertLockedHtml(article.absolutePath, content)
  const previewPath = path.join(outputDir, 'article.html')
  await fs.writeFile(previewPath, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${article.title}</title></head><body>${content}</body></html>`, 'utf8')

  if (options.dryRun) {
    return { mode: 'preview', article, previewPath, mermaidImages: mermaid.images, localImages: processed.images }
  }

  const coverPath = options.cover
    ? path.resolve(options.cover)
    : article.cover
      ? path.resolve(article.baseDir, article.cover)
      : config.defaultCover
  if (!coverPath) {
    throw new Error('文章缺少封面：请在 front matter 中配置 cover，或使用 --cover 指定图片')
  }
  const normalizedCover = await normalizeImage(coverPath, normalizedDir, 'cover')
  const thumbMediaId = await client.uploadCover(normalizedCover)
  const draftArticle = {
    title: article.title,
    author: options.author ?? article.author,
    digest: options.digest ?? article.digest,
    content,
    content_source_url: options.sourceUrl ?? article.sourceUrl,
    thumb_media_id: thumbMediaId,
    show_cover_pic: 0,
    need_open_comment: article.needOpenComment,
    only_fans_can_comment: article.onlyFansCanComment
  }
  if (options.draftMediaId) {
    await client.updateDraft(options.draftMediaId, draftArticle)
    return {
      mode: 'publish',
      operation: 'update',
      article,
      previewPath,
      mediaId: options.draftMediaId,
      mermaidImages: mermaid.images,
      localImages: processed.images
    }
  }

  const response = await client.addDraft(draftArticle)
  return {
    mode: 'publish',
    operation: 'create',
    article,
    previewPath,
    mediaId: response.media_id,
    mermaidImages: mermaid.images,
    localImages: processed.images
  }
}
