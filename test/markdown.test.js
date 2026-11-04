import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/markdown.js'

test('compacts list items for the WeChat editor', () => {
  const html = renderMarkdown('- 第一项\n- 第二项\n- 第三项\n')
  assert.doesNotMatch(html, /<\/li>\s+<li/)
  assert.match(html, /<\/li><li/)
})

test('removes empty list items and uses mobile-safe paragraph alignment', () => {
  const html = renderMarkdown('正文。\n\n<ul><li></li><li>有效内容</li></ul>')
  assert.doesNotMatch(html, /<li[^>]*><\/li>/)
  assert.match(html, /text-align:left/)
})

test('keeps fenced code line breaks when WeChat filters white-space styles', () => {
  const html = renderMarkdown('```sh\npwd\nls -la\nrg "keyword"\n```\n')
  assert.equal(html.match(/<br>/g)?.length, 2)
  assert.match(html, /pwd/)
  assert.match(html, /ls/)
  assert.match(html, /rg/)
  assert.match(html, /overflow-wrap:anywhere/)
  assert.match(html, /white-space:pre-wrap/)
})

test('keeps spaces between highlighted tokens after WeChat compacts inline tags', () => {
  const html = renderMarkdown(`\`\`\`ts
type Tool = {
  execute: (args: any) => Promise<any>
}

async function runAgent() {
  const state = { observations: [] as unknown[] }
}
\`\`\`
`)

  assert.match(html, /type<\/span>&nbsp;<span/)
  assert.match(html, /async<\/span>&nbsp;<span/)
  assert.match(html, /&nbsp;&nbsp;/)
  assert.match(html, /style="[^"]*color:/)

  const compacted = html.replace(/>\s+</g, '><')
  assert.match(compacted, /type<\/span>&nbsp;<span[^>]*>Tool/)
  assert.match(compacted, /async<\/span>&nbsp;<span[^>]*>function/)
  assert.match(compacted, /<\/span>&nbsp;<span[^>]*>unknown/)
})

test('renders Chinese strong text when the next sentence has no visible space', () => {
  const html = renderMarkdown('> **教学示例，非真实项目记录：**下面的内容。\n')

  assert.match(html, /<strong[^>]*>教学示例，非真实项目记录：<\/strong>/)
  assert.doesNotMatch(html, /\*\*教学示例/)
})

test('does not rewrite strong-like markers inside fenced or inline code', () => {
  const html = renderMarkdown('```txt\n**不是加粗**中文\n```\n\n`**也不是**中文`\n')

  assert.match(html, /\*\*不是加粗\*\*/)
  assert.match(html, /\*\*也不是\*\*中文/)
})

test('renders copyable plaintext prompts in a readable light block without losing content', () => {
  const html = renderMarkdown('```text\n1. 不要改写正文。\n2. 检查 A < B 与链接 https://example.com/a?q=1&b=2\n```')
  assert.match(html, /font-size: 15px/)
  assert.match(html, /background: #f3f6fa/)
  assert.match(html, /不要改写正文/)
  assert.match(html, /&lt;/)
  assert.match(html, /<br>/)
})
