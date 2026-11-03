import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createBodyLock, assertLockedHtml, readBodyLock } from '../src/body-lock.js'
import { publishArticle } from '../src/pipeline.js'

test('locks a source H1 separately from the draft body and accepts Chinese emphasis', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-lock-title-'))
  try {
    const article = path.join(dir, 'index.md')
    const template = path.join(dir, 'template.html')
    await fs.writeFile(template, '<section>{{{content}}}</section>')
    const source = '---\ntitle: 原标题\nbody_lock: ./review/body-lock.json\n---\n\n# 原标题\n\n**保持原文**接着阅读。\n\n[仓库](https://example.com/repo)\n'
    await fs.writeFile(article, source)
    await createBodyLock(article)
    const result = await publishArticle(article, { toolRoot: dir, template }, { dryRun: true })
    const html = await fs.readFile(result.previewPath, 'utf8')
    await assertLockedHtml(article, html)
    await assert.rejects(assertLockedHtml(article, html.replace('接着阅读', '修改正文')), /不一致/)
    await assert.rejects(assertLockedHtml(article, html.replace('</section>', '<p>新增文案</p></section>')), /不一致/)
    await fs.writeFile(article, source.replace('原标题\n\n**', '另一个标题\n\n**'))
    await assert.rejects(readBodyLock(article), /正文已变化/)
  } finally { await fs.rm(dir, { recursive: true, force: true }) }
})
