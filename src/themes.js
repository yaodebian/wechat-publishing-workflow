import { load } from 'cheerio'

const palettes = {
  technical: { accent: '#2563a6', tint: '#f1f6fc', ink: '#243447', size: '17px', leading: '1.85' },
  reading: { accent: '#8c5839', tint: '#faf5ef', ink: '#39332e', size: '17px', leading: '1.95' },
  business: { accent: '#496052', tint: '#f2f6f3', ink: '#283a30', size: '16px', leading: '1.85' }
}

// Inline declarations survive platforms that discard stylesheets and classes.
// Only presentation changes: never replace text, URLs, code or image attributes.
export function applyTheme(content, name) {
  const theme = palettes[name]
  if (!theme) throw new Error(`未知排版主题：${name}`)
  const $ = load(content, null, false)
  const rules = {
    p: { color: theme.ink, 'font-size': theme.size, 'line-height': theme.leading, margin: '16px 0' },
    li: { color: theme.ink, 'font-size': theme.size, 'line-height': theme.leading },
    'h1,h2,h3,h4': { color: theme.ink },
    h1: { 'font-size': '25px', 'line-height': '1.45', margin: '30px 0 20px' },
    h2: { 'border-bottom': `2px solid ${theme.accent}`, 'font-size': '21px', margin: '34px 0 18px' },
    h3: { color: theme.accent, 'font-size': '19px' },
    blockquote: { 'border-left': `3px solid ${theme.accent}`, background: theme.tint, padding: '12px 16px' },
    'blockquote p': { margin: '0', color: theme.ink },
    a: { color: theme.accent },
    strong: { color: theme.ink },
    th: { background: theme.tint, color: theme.ink },
    td: { color: theme.ink },
    'code:not(pre code)': { color: theme.accent, background: theme.tint }
  }
  if (name === 'reading') {
    rules.h2['border-bottom'] = '0'
    rules.h2.padding = '0'
    rules.h2.margin = '38px 0 20px'
    rules.h2['font-size'] = '22px'
  }
  if (name === 'business') {
    rules.h2['border-bottom'] = '1px solid #cbd8ce'
    rules.table = { 'font-size': '14px', 'line-height': '1.65' }
    rules['th,td'] = { padding: '10px 7px' }
  }
  for (const [selector, style] of Object.entries(rules)) $(selector).css(style)
  return $.html()
}
