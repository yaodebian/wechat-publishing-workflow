import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { mermaidDisplayStyle, mermaidDisplayWidth, processHtmlImages } from '../src/images.js'

test('keeps Mermaid diagrams mobile-friendly without enlarging tall diagrams on desktop', () => {
  assert.equal(mermaidDisplayWidth(1600, 300), 540)
  assert.equal(mermaidDisplayWidth(900, 1300), 320)
  assert.equal(mermaidDisplayWidth(900, 1000), 400)
  assert.equal(mermaidDisplayWidth(1100, 1000), 460)
  assert.equal(mermaidDisplayWidth(600, 1500), 320)
  assert.equal(mermaidDisplayStyle(900, 1300), 'width:320px!important;max-width:100%!important;height:auto!important;')
})

test('adds a hard width fallback for WeChat clients that force wxw-img to full width', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-mermaid-width-'))
  const articleDir = path.join(dir, 'article')
  const outputDir = path.join(dir, 'preview', 'normalized')
  await fs.mkdir(articleDir, { recursive: true })
  const imagePath = path.join(articleDir, 'mermaid-test.png')
  await sharp({ create: { width: 600, height: 1500, channels: 3, background: '#ffffff' } }).png().toFile(imagePath)

  const result = await processHtmlImages('<p><img src="./mermaid-test.png" alt="流程图" data-type="mermaid"></p>', {
    articleDir,
    outputDir,
    dryRun: true
  })

  assert.match(result.html, /width="320"/)
  assert.match(result.html, /width:320px!important;max-width:100%!important;height:auto!important;/)
})

test('downloads, normalizes, and uploads remote images', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-remote-image-'))
  const image = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#14a37f' } }).png().toBuffer()
  const uploaded = []
  const result = await processHtmlImages('<p><img src="https://example.test/image.png" alt="远程图"></p>', {
    articleDir: dir,
    outputDir: dir,
    dryRun: false,
    fetch: async () => new Response(image, { headers: { 'content-type': 'image/png' } }),
    upload: async (filePath) => {
      uploaded.push(filePath)
      return 'https://mmbiz.qpic.cn/rehosted.jpg'
    }
  })

  assert.equal(uploaded.length, 1)
  assert.match(result.html, /https:\/\/mmbiz\.qpic\.cn\/rehosted\.jpg/)
  assert.equal(path.extname(uploaded[0]), '.jpg')
})

test('uses a portable relative image URL in dry-run previews', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-preview-image-'))
  const articleDir = path.join(dir, 'article')
  const outputDir = path.join(dir, 'preview', 'normalized')
  await fs.mkdir(articleDir, { recursive: true })
  const imagePath = path.join(articleDir, 'inline.png')
  await sharp({ create: { width: 80, height: 40, channels: 3, background: '#14a37f' } }).png().toFile(imagePath)

  const result = await processHtmlImages('<p><img src="./inline.png" alt="本地图"></p>', {
    articleDir,
    outputDir,
    dryRun: true
  })

  assert.match(result.html, /src="\.\/normalized\/article-[a-f0-9]+\.jpg"/)
  assert.doesNotMatch(result.html, /file:\/\//)
})
