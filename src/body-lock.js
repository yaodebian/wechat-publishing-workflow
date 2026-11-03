import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import { load } from 'cheerio'

const md = new MarkdownIt({ html: false, linkify: true })
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
// Only standalone image references may be added after writing handoff.
export const proseSource = (body) => body.replace(/(^|\n)!\[[^\]\n]*\]\([^\n]+\)[\t ]*\n?/g, '').trim()
export function readingText(html) {
  const $ = load(html)
  $('script,style').remove()
  return $('body').text().replace(/\s+/gu, '')
}
export async function readBodyLock(articlePath) {
  const source = await fs.readFile(articlePath, 'utf8')
  const parsed = matter(source)
  if (!parsed.data.body_lock) return null
  const base = path.dirname(articlePath)
  const lockPath = path.resolve(base, parsed.data.body_lock)
  if (!lockPath.startsWith(base + path.sep)) throw new Error('body_lock 必须位于文章目录内')
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  const snapshotPath = path.resolve(path.dirname(lockPath), lock.snapshot)
  if (!snapshotPath.startsWith(base + path.sep)) throw new Error('锁定快照必须位于文章目录内')
  const snapshot = await fs.readFile(snapshotPath, 'utf8')
  if (hash(snapshot) !== lock.bodySha256 || proseSource(parsed.content) !== snapshot) throw new Error('正文已变化：返回写作阶段审查并重新锁定，禁止发布阶段静默改字')
  if (parsed.data.title !== lock.title || parsed.data.digest !== lock.digest) throw new Error('锁定标题或摘要已变化')
  if (readingText(md.render(snapshot)) !== lock.readingText) throw new Error('锁定阅读文字基线不一致')
  return lock
}
export async function assertLockedHtml(articlePath, html) {
  const lock = await readBodyLock(articlePath)
  if (lock && readingText(html) !== lock.readingText) throw new Error('最终HTML可读文字与锁定正文不一致（检查模板附加文案、代码和链接）')
  return lock
}
export async function createBodyLock(articlePath) {
  const parsed = matter(await fs.readFile(articlePath, 'utf8'))
  if (!parsed.data.body_lock) throw new Error('front matter 缺少 body_lock')
  const base = path.dirname(articlePath)
  const lockPath = path.resolve(base, parsed.data.body_lock)
  if (!lockPath.startsWith(base + path.sep)) throw new Error('body_lock 必须位于文章目录内')
  try { await fs.access(lockPath); throw new Error('已有锁定记录；显式重开写作并归档旧锁后再创建') } catch (e) { if (e.code !== 'ENOENT') throw e }
  await fs.mkdir(path.dirname(lockPath), { recursive: true })
  const snapshot = proseSource(parsed.content)
  const snapshotPath = path.join(path.dirname(lockPath), 'locked-body.md')
  await fs.writeFile(snapshotPath, snapshot, { flag: 'wx' })
  const lock = { schemaVersion: 1, title: parsed.data.title, digest: parsed.data.digest, lockedAt: new Date().toISOString(), snapshot: './locked-body.md', bodySha256: hash(snapshot), readingText: readingText(md.render(snapshot)), note: '写作审查后锁定；允许加入独立图片引用；不允许改字、扩写或模板附加阅读文字。HTML比较仅折叠排版空白，正文源码逐字比较。' }
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' })
  return lockPath
}
