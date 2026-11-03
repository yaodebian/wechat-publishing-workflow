import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { publishArticle } from '../src/pipeline.js'

const skipReview = async () => {}

test('blocks an unreviewed ordinary article before any upload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-pipeline-review-'))
  const articlePath = path.join(dir, 'article.md')
  await fs.writeFile(articlePath, '# 未审查文章\n\n正文。\n')
  await assert.rejects(
    publishArticle(articlePath, { toolRoot: dir, author: '', sourceUrl: '' }, { client: {} }),
    /缺少 editorial-review\.json/
  )
})

test('publishes local images, a cover, and the rendered article through the client', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-pipeline-'))
  const imagePath = path.join(dir, 'inline.png')
  const coverPath = path.join(dir, 'cover.png')
  const templatePath = path.join(dir, 'template.html')
  const articlePath = path.join(dir, 'article.md')
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#14a37f' } }).png().toFile(imagePath)
  await sharp({ create: { width: 900, height: 383, channels: 3, background: '#ffffff' } }).png().toFile(coverPath)
  await fs.writeFile(templatePath, '<section>{{{content}}}</section>')
  await fs.writeFile(articlePath, '# 流水线测试\n\n正文。\n\n![配图](./inline.png)\n')

  const calls = []
  const client = {
    async uploadArticleImage(filePath) {
      calls.push(['image', filePath])
      return 'https://mmbiz.qpic.cn/inline.jpg'
    },
    async uploadCover(filePath) {
      calls.push(['cover', filePath])
      return 'cover-media-id'
    },
    async addDraft(article) {
      calls.push(['draft', article])
      return { media_id: 'draft-media-id' }
    }
  }

  const result = await publishArticle(articlePath, {
    toolRoot: dir,
    template: templatePath,
    defaultCover: coverPath,
    author: '木木',
    sourceUrl: ''
  }, { client, assertPublishable: skipReview })

  assert.equal(result.mediaId, 'draft-media-id')
  assert.deepEqual(calls.map(([kind]) => kind), ['image', 'cover', 'draft'])
  assert.match(calls[2][1].content, /https:\/\/mmbiz\.qpic\.cn\/inline\.jpg/)
  assert.equal(calls[2][1].thumb_media_id, 'cover-media-id')
  assert.equal(calls[2][1].title, '流水线测试')
})

test('requires an article-specific cover when no fallback is configured', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-pipeline-cover-'))
  const templatePath = path.join(dir, 'template.html')
  const articlePath = path.join(dir, 'article.md')
  await fs.writeFile(templatePath, '<section>{{{content}}}</section>')
  await fs.writeFile(articlePath, '# 缺少封面\n\n正文。\n')

  await assert.rejects(
    publishArticle(articlePath, {
      toolRoot: dir,
      template: templatePath,
      author: '',
      sourceUrl: ''
    }, { client: {}, outputDir: path.join(dir, 'output'), assertPublishable: skipReview }),
    /文章缺少封面/
  )
})

test('uses an article-specific template resolved from the article directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-pipeline-article-template-'))
  const coverPath = path.join(dir, 'cover.png')
  const defaultTemplatePath = path.join(dir, 'default.html')
  const essayTemplatePath = path.join(dir, 'essay.html')
  const articlePath = path.join(dir, 'article.md')
  await sharp({ create: { width: 900, height: 383, channels: 3, background: '#ffffff' } }).png().toFile(coverPath)
  await fs.writeFile(defaultTemplatePath, '<section>AGENT DEVELOPMENT{{{content}}}</section>')
  await fs.writeFile(essayTemplatePath, '<main>{{{content}}}</main>')
  await fs.writeFile(articlePath, `---\ncover: ./cover.png\ntemplate: ./essay.html\n---\n# 随笔测试\n\n正文。\n`)

  const client = {
    async uploadCover() {
      return 'cover-media-id'
    },
    async addDraft(article) {
      assert.match(article.content, /^<main>/)
      assert.doesNotMatch(article.content, /AGENT DEVELOPMENT/)
      return { media_id: 'essay-draft-id' }
    }
  }

  const result = await publishArticle(articlePath, {
    toolRoot: dir,
    template: defaultTemplatePath,
    author: '',
    sourceUrl: ''
  }, { client, assertPublishable: skipReview })

  assert.equal(result.mediaId, 'essay-draft-id')
})

test('updates the requested draft media id instead of creating another draft', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-pipeline-update-'))
  const coverPath = path.join(dir, 'cover.png')
  const templatePath = path.join(dir, 'template.html')
  const articlePath = path.join(dir, 'article.md')
  await sharp({ create: { width: 900, height: 383, channels: 3, background: '#ffffff' } }).png().toFile(coverPath)
  await fs.writeFile(templatePath, '<section>{{{content}}}</section>')
  await fs.writeFile(articlePath, '# 更新测试\n\n```txt\n第一行\n第二行\n```\n')

  const calls = []
  const client = {
    async uploadCover() {
      return 'cover-media-id'
    },
    async updateDraft(mediaId, article) {
      calls.push({ mediaId, article })
      return { errcode: 0 }
    }
  }

  const result = await publishArticle(articlePath, {
    toolRoot: dir,
    template: templatePath,
    defaultCover: coverPath,
    author: '木木',
    sourceUrl: ''
  }, { client, draftMediaId: 'existing-draft-id', assertPublishable: skipReview })

  assert.equal(result.operation, 'update')
  assert.equal(result.mediaId, 'existing-draft-id')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].mediaId, 'existing-draft-id')
  assert.match(calls[0].article.content, /第一行<br>第二行/)
})
