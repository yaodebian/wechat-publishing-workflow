import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applyTemplate} from '../src/template.js';
test('rejects nested outer horizontal padding but allows local content padding', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wechat-padding-'));
  const file=path.join(dir,'template.html');
  try {
    for(const style of ['padding:0 8px','padding-left:8px','padding-inline:1rem']) {
      await fs.writeFile(file,`<section style="${style}"><section>{{{content}}}</section></section>`);
      await assert.rejects(applyTemplate('<p>正文</p>',file),/左右 padding/);
    }
    await fs.writeFile(file,'<section style="padding:12px 0">{{{content}}}</section>');
    const result=await applyTemplate('<blockquote style="padding:8px">正文</blockquote>',file);
    assert.match(result,/blockquote style="padding:8px"/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('all built-in themes preserve text, code, links and image geometry', async () => {
  const { renderMarkdown } = await import('../src/markdown.js')
  const { load } = await import('cheerio')
  const content = renderMarkdown('## 原标题\n\n正文 **强调** 与 [链接](https://example.com/a?q=1&b=2)。\n\n> 引用原文\n\n- 列表\n\n```js\nconst x = 1;\n```\n\n| 项目 | 值 |\n| --- | --- |\n| A | 1 |') + '<img src="https://example.com/x.png" style="width:280px" alt="原图">'
  const before = load(content)
  for (const name of ['technical', 'reading', 'business']) {
    const html = await applyTemplate(content, new URL(`../templates/${name}.html`, import.meta.url))
    const after = load(html)
    assert.equal(after('body').text().replace(/\s/g, ''), before('body').text().replace(/\s/g, ''))
    assert.equal(after('pre code').text(), before('pre code').text())
    assert.equal(after('a').attr('href'), before('a').attr('href'))
    assert.equal(after('img').attr('style'), 'width:280px')
    assert.equal(after('img').attr('alt'), '原图')
    assert.equal(after('p').first().css('font-size'), name === 'business' ? '16px' : '17px')
    assert.equal(after('section').first().css('padding-left'), undefined)
  }
})

test('rejects a misspelled theme rather than silently falling back', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-theme-'))
  try {
    const file = path.join(dir, 'template.html')
    await fs.writeFile(file, '<section data-article-theme="typo">{{{content}}}</section>')
    await assert.rejects(applyTemplate('<p>原文</p>', file), /未知排版主题/)
  } finally { await fs.rm(dir, { recursive: true, force: true }) }
})
