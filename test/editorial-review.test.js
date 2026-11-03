import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { createEditorialReviewTemplate, inspectEditorialPublication } from '../src/editorial-review.js'

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')

async function fixture(collectionName = '日常学习', number = 1) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editorial-quality-'))
  const articleDir = path.join(root, collectionName, `${number}-测试内容`)
  const assets = path.join(articleDir, 'assets')
  const design = path.join(articleDir, 'design')
  const reviewDir = path.join(articleDir, 'review')
  await fs.mkdir(assets, { recursive: true })
  await fs.mkdir(design, { recursive: true })
  await fs.mkdir(reviewDir, { recursive: true })
  const articlePath = path.join(articleDir, 'index.md')
  const article = '---\ntitle: 测试内容\ncover: ./assets/hero.png\n---\n# 测试内容\n\n这是正文。\n'
  await fs.writeFile(articlePath, article)
  await fs.writeFile(path.join(design, 'cover.md'), '封面设计与确定性标题记录')
  await sharp({ create: { width: 900, height: 383, channels: 3, background: '#eeeeee' } }).png().toFile(path.join(assets, 'hero.png'))
  const preview = Buffer.from('mobile-preview')
  await fs.writeFile(path.join(reviewDir, 'mobile-preview.png'), preview)
  return { root, articleDir, articlePath, article, preview, cover: await fs.readFile(path.join(assets, 'hero.png')) }
}

function approve(review, preview) {
  review.reviewStatus = 'approved'
  review.reviewedBy = '测试审校者'
  review.reviewedAt = '2026-09-02T00:00:00.000Z'
  Object.assign(review.articleContract, {
    primaryMode: 'opinion', reader: '关心 Agent 的开发者', readerJob: '理解作者判断', promise: '看懂判断依据', evidenceBoundary: '仅基于当前观察', endingPurpose: '给出有边界的结论'
  })
  Object.assign(review.explanation, { applicable: false, rationale: '观点已经由具体事实支撑，不需要机制复述' })
  Object.assign(review.cover, {
    sourceKind: 'hybrid', designSource: './design/cover.md', topicAccuracy: '与正文主题一致', selectionRationale: '用主题场景建立识别', textAccuracy: '中文标题逐字核对', mobileThumbnailEvidence: '缩略图可辨认'
  })
  for (const key of Object.keys(review.checks)) review.checks[key] = `${key} 已复核`
  review.previewEvidence = { path: './review/mobile-preview.png', sha256: hash(preview), viewport: '390×844' }
  return review
}

test('creates a publishing-only review without requesting prose editing', async () => {
  const item = await fixture()
  const review = await createEditorialReviewTemplate(item.articlePath)
  assert.equal(review.reviewStatus, 'draft')
  assert.equal(review.articleSha256, hash(item.article))
  assert.equal('runningCase' in review.articleContract, false)
  assert.equal(review.reviewScope, 'publication_only')
  assert.equal(review.explanation.applicable, false)
})

test('accepts an approved non-course editorial review', async () => {
  const item = await fixture()
  const review = approve(await createEditorialReviewTemplate(item.articlePath), item.preview)
  await fs.writeFile(path.join(item.articleDir, 'editorial-review.json'), JSON.stringify(review))
  const result = await inspectEditorialPublication(item.articlePath)
  assert.deepEqual(result.errors, [])
})

test('invalidates the generic review after the article changes', async () => {
  const item = await fixture()
  const review = approve(await createEditorialReviewTemplate(item.articlePath), item.preview)
  await fs.writeFile(path.join(item.articleDir, 'editorial-review.json'), JSON.stringify(review))
  await fs.appendFile(item.articlePath, '\n新增内容。\n')
  const result = await inspectEditorialPublication(item.articlePath)
  assert.match(result.errors.join('\n'), /正文修改后必须重新审查/)
})

test('requires remote images to be localized before hash-bound publication review', async () => {
  const item = await fixture()
  await fs.appendFile(item.articlePath, '\n![远程证据](https://example.com/evidence.png)\n')
  const review = approve(await createEditorialReviewTemplate(item.articlePath), item.preview)
  await fs.writeFile(path.join(item.articleDir, 'editorial-review.json'), JSON.stringify(review))
  const result = await inspectEditorialPublication(item.articlePath)
  assert.match(result.errors.join('\n'), /无法绑定哈希的远程/)
})

test('keeps the draft cover out of the article body', async () => {
  const item = await fixture()
  await fs.appendFile(item.articlePath, '\n![封面](./assets/hero.png)\n')
  const review = approve(await createEditorialReviewTemplate(item.articlePath), item.preview)
  await fs.writeFile(path.join(item.articleDir, 'editorial-review.json'), JSON.stringify(review))
  const result = await inspectEditorialPublication(item.articlePath)
  assert.match(result.errors.join('\n'), /正文不能再次引用/)
})

test('applies the same publishing checks regardless of collection name', async () => {
  const item = await fixture('示例合集', 15)
  const result = await inspectEditorialPublication(item.articlePath)
  assert.equal(result.applies, true)
  const review = await createEditorialReviewTemplate(item.articlePath)
  assert.ok(review)
})
