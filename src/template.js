import fs from 'node:fs/promises'
import { load } from 'cheerio'
import { applyTheme } from './themes.js'

export async function applyTemplate(content, templatePath) {
  const template = await fs.readFile(templatePath, 'utf8')
  if (!template.includes('{{{content}}}')) {
    throw new Error(`模板缺少 {{{content}}} 占位符：${templatePath}`)
  }
  const $ = load(template.replace('{{{content}}}', '<span data-article-content></span>'))
  $('[data-article-content]').parents().each((_, node) => {
    const style = $(node).attr('style') || ''
    for (const declaration of style.split(';')) {
      const [property, value = ''] = declaration.split(':').map(part => part.trim().toLowerCase())
      let horizontal = []
      if (property === 'padding') {
        const parts = value.replace(/!important/g, '').trim().split(/\s+/)
        horizontal = [parts[1] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]]
      } else if (['padding-left', 'padding-right', 'padding-inline', 'padding-inline-start', 'padding-inline-end'].includes(property)) {
        horizontal = value.replace(/!important/g, '').trim().split(/\s+/)
      }
      if (horizontal.some(v => !/^0(?:px|em|rem|%)?$/.test(v))) {
        throw new Error('正文外层容器不得叠加左右 padding；沿用微信平台留白。')
      }
    }
  })
  const theme = $('[data-article-theme]').first().attr('data-article-theme')
  const styled = theme ? applyTheme(content, theme) : content
  return template.replace('{{{content}}}', styled)
}
