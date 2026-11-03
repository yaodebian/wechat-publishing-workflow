import test from 'node:test'
import assert from 'node:assert/strict'
import { mermaidImageMarkdown } from '../src/mermaid.js'
import { renderMarkdown } from '../src/markdown.js'

test('renders Mermaid image paths containing spaces as images', () => {
  const markdown = mermaidImageMarkdown('/tmp/付费课程/15-Code Agent/generated/mermaid-test.png')
  const html = renderMarkdown(markdown)

  assert.match(html, /<img /)
  assert.match(html, /data-type="mermaid"/)
  assert.doesNotMatch(html, /!\[流程图\]/)
})
