import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import * as cheerio from 'cheerio'
import sharp from 'sharp'

export function isRemoteImage(source) {
  return /^https?:\/\//i.test(source)
}

function stripFileProtocol(source) {
  return source.startsWith('file://') ? new URL(source).pathname : source
}

function previewImageSource(filePath, outputDir) {
  const previewRoot = path.basename(outputDir) === 'normalized' ? path.dirname(outputDir) : outputDir
  const relative = path.relative(previewRoot, filePath)
  return `./${relative.split(path.sep).map(encodeURIComponent).join('/')}`
}

export function resolveImagePath(source, articleDir) {
  const decoded = decodeURIComponent(stripFileProtocol(source))
  return path.isAbsolute(decoded) ? decoded : path.resolve(articleDir, decoded)
}

export function mermaidDisplayWidth(width, height) {
  const aspectRatio = width > 0 && height > 0 ? width / height : 1
  return aspectRatio < 0.8 ? 320 : aspectRatio < 1 ? 400 : aspectRatio < 1.4 ? 460 : 540
}

export function mermaidDisplayStyle(width, height) {
  const displayWidth = mermaidDisplayWidth(width, height)
  // 微信 PC 端会用 .wxw-img { width: 100% !important } 覆盖普通限宽。
  // 内联 !important 和 width 属性共同作为微信编辑器与不同客户端的兼容层。
  return `width:${displayWidth}px!important;max-width:100%!important;height:auto!important;`
}

async function downloadRemoteImage(source, outputDir, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(source)
  if (!response.ok) throw new Error(`下载远程图片失败（${response.status}）：${source}`)
  const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
  const extension = extensions[contentType]
  if (!extension) throw new Error(`远程资源不是支持的图片格式（${contentType || 'unknown'}）：${source}`)

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 20 * 1024 * 1024) throw new Error(`远程图片超过 20 MB：${source}`)
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12)
  const outputPath = path.join(outputDir, `remote-${hash}.${extension}`)
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(outputPath, bytes)
  return outputPath
}

export async function normalizeImage(inputPath, outputDir, kind = 'article') {
  const input = await fs.readFile(inputPath)
  const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 12)
  await fs.mkdir(outputDir, { recursive: true })

  const isDiagram = path.basename(inputPath).startsWith('mermaid-')
  const outputPath = path.join(outputDir, `${kind}-${hash}.${isDiagram ? 'png' : 'jpg'}`)
  const pipeline = sharp(input).rotate()

  if (kind === 'cover') {
    await pipeline.resize(900, 383, { fit: 'cover', position: 'centre' }).jpeg({ quality: 88, mozjpeg: true }).toFile(outputPath)
  } else if (isDiagram) {
    await pipeline.resize({ width: 1600, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, colours: 256, dither: 0 }).toFile(outputPath)
  } else {
    await pipeline.resize({ width: 1080, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 86, mozjpeg: true }).toFile(outputPath)
  }

  const stat = await fs.stat(outputPath)
  if (stat.size > 1024 * 1024) {
    if (isDiagram) {
      const smallerPath = outputPath.replace(/\.png$/, '-small.png')
      await sharp(outputPath).resize({ width: 1280, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, colours: 192, dither: 0 }).toFile(smallerPath)
      return smallerPath
    }
    const smallerPath = outputPath.replace(/\.(png|jpg)$/, '-small.jpg')
    await sharp(outputPath).resize({ width: 900, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78, mozjpeg: true }).toFile(smallerPath)
    return smallerPath
  }
  return outputPath
}

export async function processHtmlImages(html, options) {
  const $ = cheerio.load(`<main>${html}</main>`, null, false)
  const uploaded = new Map()

  for (const node of $('img').toArray()) {
    const image = $(node)
    const source = image.attr('src')
    if (!source) continue
    const localPath = isRemoteImage(source)
      ? await downloadRemoteImage(source, options.outputDir, options.fetch)
      : resolveImagePath(source, options.articleDir)
    const normalized = await normalizeImage(localPath, options.outputDir, 'article')
    let replacement = uploaded.get(normalized)

    if (!replacement) {
      replacement = options.dryRun
        ? previewImageSource(normalized, options.outputDir)
        : await options.upload(normalized)
      uploaded.set(normalized, replacement)
    }
    image.attr('src', replacement)
    if (image.attr('data-type') === 'mermaid') {
      const metadata = await sharp(normalized).metadata()
      const displayWidth = mermaidDisplayWidth(metadata.width, metadata.height)
      const responsiveStyle = mermaidDisplayStyle(metadata.width, metadata.height)
      const currentStyle = image.attr('style') || ''
      image.attr('width', String(displayWidth))
      image.attr('style', `${currentStyle}${currentStyle && !currentStyle.endsWith(';') ? ';' : ''}${responsiveStyle}`)
    }
  }

  return { html: $('main').html(), images: [...uploaded.keys()] }
}
