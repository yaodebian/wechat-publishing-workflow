import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

function firstParagraph(markdown) {
  const withoutBlocks = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')

  return withoutBlocks
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .find(Boolean) ?? ''
}

export async function readArticle(articlePath, defaults = {}) {
  const requestedPath = path.resolve(articlePath)
  const requestedStat = await fs.stat(requestedPath)
  const absolutePath = requestedStat.isDirectory()
    ? path.join(requestedPath, 'index.md')
    : requestedPath
  const source = await fs.readFile(absolutePath, 'utf8')
  const parsed = matter(source)
  const titleMatch = parsed.content.match(/^#\s+(.+)$/m)
  const title = parsed.data.title || titleMatch?.[1]?.trim() || path.basename(absolutePath, path.extname(absolutePath))
  const content = titleMatch
    ? parsed.content.replace(titleMatch[0], '').replace(/^\s+/, '')
    : parsed.content
  const digest = String(parsed.data.digest || firstParagraph(content)).slice(0, 120)

  return {
    absolutePath,
    baseDir: path.dirname(absolutePath),
    title,
    content,
    author: parsed.data.author ?? defaults.author ?? '',
    digest,
    cover: parsed.data.cover,
    template: parsed.data.template,
    sourceUrl: parsed.data.source_url ?? parsed.data.sourceUrl ?? defaults.sourceUrl ?? '',
    needOpenComment: Number(parsed.data.need_open_comment ?? 0),
    onlyFansCanComment: Number(parsed.data.only_fans_can_comment ?? 0)
  }
}
