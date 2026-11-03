#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createEditorialReviewTemplate } from '../src/editorial-review.js'

const input = process.argv[2]
if (!input) {
  console.error('用法：node scripts/create-editorial-review.js <文章目录或 Markdown 文件>')
  process.exitCode = 1
} else {
  const requested = path.resolve(input)
  const stat = await fs.stat(requested)
  const articlePath = stat.isDirectory() ? path.join(requested, 'index.md') : requested
  const outputPath = path.join(path.dirname(articlePath), 'editorial-review.json')
  try {
    await fs.access(outputPath)
    throw new Error(`${outputPath} 已存在；为避免覆盖审查记录，拒绝生成`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const template = await createEditorialReviewTemplate(articlePath)
  await fs.writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
  console.log(`已生成发布检查模板（仅一致性与视觉检查）：${outputPath}`)
}
