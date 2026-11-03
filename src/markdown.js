import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import * as cheerio from 'cheerio'

const styles = {
  p: 'margin:15px 0;color:#2b2f33;font-size:17px;line-height:1.85;letter-spacing:0;text-align:left;',
  h2: 'margin:34px 0 17px;padding:0 0 9px;border-bottom:2px solid #14a37f;color:#171a1d;font-size:21px;line-height:1.45;letter-spacing:0;font-weight:700;',
  h3: 'margin:28px 0 14px;color:#1d252b;font-size:19px;line-height:1.5;letter-spacing:0;font-weight:700;',
  h4: 'margin:24px 0 12px;color:#2b2f33;font-size:17px;line-height:1.5;letter-spacing:0;font-weight:700;',
  blockquote: 'box-sizing:border-box;margin:20px 0;padding:14px 18px;border-left:4px solid #14a37f;background:#f4f8f7;color:#3d4b47;',
  ul: 'box-sizing:border-box;margin:10px 0;padding-left:1.3em;color:#2b2f33;',
  ol: 'box-sizing:border-box;margin:10px 0;padding-left:1.3em;color:#2b2f33;',
  li: 'margin:4px 0;font-size:17px;line-height:1.8;letter-spacing:0;',
  a: 'color:#0b7f65;text-decoration:underline;',
  strong: 'color:#101315;font-weight:700;',
  hr: 'margin:32px 0;border:0;border-top:1px solid #e6e8eb;',
  img: 'display:block;box-sizing:border-box;width:auto;max-width:100%;height:auto;margin:24px auto 8px;border-radius:4px;',
  pre: 'box-sizing:border-box;max-width:100%;margin:20px 0;padding:16px;overflow-x:hidden;border:1px solid #303842;border-radius:4px;background:#1f252c;color:#e7edf3;font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;',
  code: 'padding:2px 5px;border-radius:3px;background:#f0f2f4;color:#c7254e;font-family:Menlo,Consolas,monospace;font-size:0.88em;',
  table: 'box-sizing:border-box;width:100%;margin:18px 0;border-collapse:collapse;table-layout:fixed;font-size:13px;line-height:1.55;word-break:break-word;',
  th: 'padding:8px 6px;border:1px solid #dfe3e6;background:#f4f8f7;color:#1d252b;text-align:left;font-weight:700;word-break:break-word;',
  td: 'padding:8px 6px;border:1px solid #dfe3e6;color:#30363b;text-align:left;word-break:break-word;'
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, language) {
    const validLanguage = language && hljs.getLanguage(language)
    return validLanguage
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : md.utils.escapeHtml(code)
  }
})

function mergeStyle(element, style) {
  const current = element.attr('style') || ''
  element.attr('style', `${current}${current && !current.endsWith(';') ? ';' : ''}${style}`)
}

const codeTokenColors = [
  { classes: ['comment', 'quote', 'meta'], color: '#8b949e' },
  { classes: ['keyword', 'selector-tag', 'doctag'], color: '#ff7b72' },
  { classes: ['title', 'name', 'type', 'attribute', 'symbol', 'bullet'], color: '#a5d6ff' },
  { classes: ['string', 'regexp', 'addition'], color: '#a7f3d0' },
  { classes: ['number', 'literal'], color: '#d2a8ff' },
  { classes: ['built_in', 'params', 'variable'], color: '#ffa657' }
]

function preserveCodeWhitespace(node) {
  for (const child of node.children || []) {
    if (child.type === 'text') {
      child.data = child.data
        .replace(/\t/g, '  ')
        .replace(/ /g, '\u00a0')
    } else {
      preserveCodeWhitespace(child)
    }
  }
}

function inlineCodeTokenColors($, code) {
  code.find('span').each((_, node) => {
    const token = $(node)
    const classNames = new Set((token.attr('class') || '').split(/\s+/).map(name => name.replace(/^hljs-/, '')))
    const match = codeTokenColors.find(group => group.classes.some(className => classNames.has(className)))
    if (match) mergeStyle(token, `color:${match.color};`)
  })
}

function normalizeCjkStrongBoundaries(markdown) {
  let fence = null
  return markdown.split('\n').map((line) => {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      fence = fence === marker ? null : fence || marker
      return line
    }
    if (fence) return line

    // CommonMark 不把 “**加粗**后文” 中紧跟中文的结束符识别为可闭合强调。
    // 在非代码片段中插入零宽 HTML 实体，让中文作者无需为了渲染额外加入可见空格。
    return line
      .split(/(`+[^\n]*?`+)/g)
      .map((part, index) => index % 2 === 1
        ? part
        : part.replace(/(\*\*[^*\n]+?\*\*)(?=[\p{Script=Han}])/gu, '$1&#8203;'))
      .join('')
  }).join('\n')
}

export function renderMarkdown(markdown) {
  const $ = cheerio.load(`<main>${md.render(normalizeCjkStrongBoundaries(markdown))}</main>`, null, false)

  for (const [tag, style] of Object.entries(styles)) {
    $(tag).each((_, node) => mergeStyle($(node), style))
  }
  $('blockquote p').css('margin', '0')
  $('pre code').each((_, node) => {
    const code = $(node)
    code.attr('style', 'display:block;max-width:100%;padding:0;background:transparent;color:inherit;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;')

    // 微信编辑器会过滤部分 white-space 样式，也可能吞掉高亮 span 之间的普通空格。
    // 用显式换行和不换行空格保存源码格式，并把高亮颜色内联，避免依赖 class 样式。
    preserveCodeWhitespace(node)
    inlineCodeTokenColors($, code)
    const html = (code.html() || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .replace(/\n/g, '<br>')
    code.html(html)
  })
  $('li').each((_, node) => {
    const item = $(node)
    if (!item.text().trim() && item.find('img,pre,table').length === 0) item.remove()
  })
  $('img').each((_, node) => {
    const image = $(node)
    const alt = image.attr('alt') || ''
    image.attr('alt', alt).attr('data-type', alt === '流程图' ? 'mermaid' : 'illustration')
  })
  $('p').has('> img:only-child').attr('style', 'margin:0;line-height:1;text-align:center;')
  $('script,style,iframe').remove()

  return $('main').html()
    .replace(/<(ul|ol)([^>]*)>\s+(?=<li)/g, '<$1$2>')
    .replace(/<\/li>\s+(?=<li|<\/(?:ul|ol)>)/g, '</li>')
}
