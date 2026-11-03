import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readArticle } from '../src/article.js'

test('reads front matter and removes the first H1 from content', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-article-'))
  const articlePath = path.join(dir, 'article.md')
  await fs.writeFile(articlePath, `---\nauthor: 木木\ndigest: 自定义摘要\ncover: cover.png\ntemplate: ./essay.html\n---\n# 测试标题\n\n正文第一段。\n`)
  const article = await readArticle(articlePath)

  assert.equal(article.title, '测试标题')
  assert.equal(article.author, '木木')
  assert.equal(article.digest, '自定义摘要')
  assert.equal(article.cover, 'cover.png')
  assert.equal(article.template, './essay.html')
  assert.doesNotMatch(article.content, /^# /m)
})

test('uses the first paragraph as a bounded digest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-article-'))
  const articlePath = path.join(dir, 'article.md')
  await fs.writeFile(articlePath, `# 标题\n\n这是自动摘要。\n\n## 小节\n`)
  const article = await readArticle(articlePath)
  assert.equal(article.digest, '这是自动摘要。')
})

test('accepts an article directory containing index.md', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-article-dir-'))
  await fs.writeFile(path.join(dir, 'index.md'), '# 目录文章\n\n正文。\n')
  const article = await readArticle(dir)
  assert.equal(article.title, '目录文章')
  assert.equal(article.absolutePath, path.join(dir, 'index.md'))
})
