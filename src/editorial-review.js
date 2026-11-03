import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import sharp from 'sharp'

const REVIEW_FILENAME = 'editorial-review.json'
const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const mermaidPattern = /```mermaid\s*\n([\s\S]*?)```/g

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty)
}

function insideDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function resolveArticlePath(requestedPath) {
  const absolute = path.resolve(requestedPath)
  const stat = await fs.stat(absolute)
  return stat.isDirectory() ? path.join(absolute, 'index.md') : absolute
}

function contextFor(articlePath) {
  const absolutePath = path.resolve(articlePath)
  const articleDir = path.dirname(absolutePath)
  const collectionDir = path.dirname(articleDir)
  return {
    absolutePath,
    articleDir,
    collectionDir
  }
}

function collectImages(source, articleDir, coverSource) {
  const images = []
  for (const match of source.matchAll(markdownImagePattern)) {
    const imageSource = decodeURI(match[2])
    if (/^(https?:|data:)/i.test(imageSource) || imageSource === coverSource) continue
    images.push({ altText: match[1].trim(), source: imageSource, absolutePath: path.resolve(articleDir, imageSource) })
  }
  return images
}

function collectRemoteImages(source) {
  return [...source.matchAll(markdownImagePattern)]
    .map((match) => decodeURI(match[2]))
    .filter((imageSource) => /^(https?:|data:)/i.test(imageSource))
}

function bodyReferences(source, target) {
  if (!target) return false
  return [...source.matchAll(markdownImagePattern)].some((match) => decodeURI(match[2]) === target)
}

function collectMermaid(source) {
  return [...source.matchAll(mermaidPattern)].map((match, index) => ({
    index,
    source: match[1].trim(),
    sha256: sha256(Buffer.from(match[1].trim()))
  }))
}

function validateDiagramGrammar(item, prefix, errors) {
  const grammar = item.grammar
  const logic = item.logic || {}
  if (!nonEmpty(grammar)) {
    errors.push(`${prefix}.grammar 必须写明；非结构图可填写 photo、artifact 或 illustration`)
    return
  }
  if (grammar === 'decision') {
    if (!nonEmptyArray(logic.conditions) || !nonEmptyArray(logic.branches) || !nonEmpty(logic.examplePath)) {
      errors.push(`${prefix}: 决策图必须写明 conditions、branches 和 examplePath`)
    }
  } else if (grammar === 'matrix') {
    if (!nonEmpty(logic.rowDimension) || !nonEmpty(logic.columnDimension) || !nonEmpty(logic.cellMeaning)) {
      errors.push(`${prefix}: 矩阵必须写明 rowDimension、columnDimension 和 cellMeaning`)
    }
  } else if (grammar === 'swimlane') {
    if (!nonEmptyArray(logic.lanes) || !nonEmptyArray(logic.steps) || !nonEmptyArray(logic.handoffs)) {
      errors.push(`${prefix}: 泳道图必须写明 lanes、steps 和 handoffs`)
    }
  } else if (grammar === 'process-tree') {
    if (!nonEmpty(logic.root) || !nonEmptyArray(logic.descendants) || !nonEmpty(logic.terminationPropagation)) {
      errors.push(`${prefix}: 进程树必须写明 root、descendants 和 terminationPropagation`)
    }
  } else if (grammar === 'comparison') {
    if (!nonEmptyArray(logic.sides) || !nonEmptyArray(logic.criteria) || !nonEmpty(logic.polarity)) {
      errors.push(`${prefix}: 对比图必须写明 sides、criteria 和 polarity`)
    }
  } else if (['sequence', 'timeline', 'state', 'lifecycle'].includes(grammar)) {
    if (!nonEmptyArray(logic.stages) || !nonEmptyArray(logic.transitions)) {
      errors.push(`${prefix}: ${grammar} 图必须写明 stages 和 transitions`)
    }
  } else if (!['photo', 'artifact', 'screenshot', 'illustration'].includes(grammar)) {
    if (!nonEmptyArray(logic.relationships) || !nonEmpty(logic.whyVisual)) {
      errors.push(`${prefix}: ${grammar} 图必须写明 relationships 和 whyVisual`)
    }
  }
}

function emptyVisual(image, bytes) {
  return {
    path: image.source,
    sha256: bytes ? sha256(bytes) : '',
    altText: image.altText,
    contentJob: '',
    readerTakeaway: '',
    sourceKind: '',
    evidenceOrigin: '',
    disclosure: '',
    designSource: '',
    selection: { higherPriorityCheck: '', whyThisSource: '' },
    grammar: '',
    logic: {},
    review: { textAccuracy: '', semanticAccuracy: '', mobileLegibility: '' }
  }
}

export async function createEditorialReviewTemplate(requestedPath) {
  const articlePath = await resolveArticlePath(requestedPath)
  const context = contextFor(articlePath)
  const articleBytes = await fs.readFile(articlePath)
  const parsed = matter(articleBytes.toString('utf8'))
  const coverSource = parsed.data.cover || ''
  const coverPath = coverSource ? path.resolve(context.articleDir, coverSource) : null
  const coverBytes = coverPath && await exists(coverPath) ? await fs.readFile(coverPath) : null
  const images = collectImages(parsed.content, context.articleDir, coverSource)
  const visuals = []
  for (const image of images) {
    const bytes = await exists(image.absolutePath) ? await fs.readFile(image.absolutePath) : null
    visuals.push(emptyVisual(image, bytes))
  }
  const mermaid = collectMermaid(parsed.content)

  return {
    schemaVersion: 1,
    reviewScope: 'publication_only',
    reviewStatus: 'draft',
    reviewedBy: '',
    reviewedAt: '',
    articleSha256: sha256(articleBytes),
    articleContract: {
      primaryMode: '用户已有初稿的纯发布处理',
      reader: '沿用用户原稿，不重新定义受众',
      readerJob: '阅读用户提供的完整原稿',
      promise: '只做封面、配图、排版、预览与授权草稿操作',
      evidenceBoundary: '不开展写作、研究、事实改写或润色；发现问题只报告',
      endingPurpose: '保留原稿结尾，不新增正文文案'
    },
    explanation: {
      applicable: false,
      rationale: '纯发布流程不开展费曼解释、清晰度编辑或重写。'
    },
    cover: {
      path: coverSource,
      sha256: coverBytes ? sha256(coverBytes) : '',
      sourceKind: '',
      designSource: '',
      evidenceOrigin: '',
      topicAccuracy: '',
      selectionRationale: '',
      textAccuracy: '',
      mobileThumbnailEvidence: ''
    },
    visuals,
    mermaid: mermaid.map((item) => ({
      index: item.index,
      sha256: item.sha256,
      contentJob: '',
      readerTakeaway: '',
      selection: { whyMermaid: '' },
      grammar: '',
      logic: {},
      review: { textAccuracy: '', semanticAccuracy: '', mobileLegibility: '' }
    })),
    checks: {
      readerPromiseAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      logicAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      evidenceAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      authorVoiceAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      plainLanguageAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      aiPatternAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      readAloudAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      structureFitAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      visualNecessityAudit: '',
      endingFitAudit: '不适用写作审查：按用户提供的初稿锁定，仅验证阅读文字完整与一致。',
      integrityAudit: '',
      mobilePreviewAudit: ''
    },
    previewEvidence: { path: '', sha256: '', viewport: '' }
  }
}

async function readJson(filePath, errors) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    errors.push(`${REVIEW_FILENAME} 无法读取：${error.message}`)
    return null
  }
}

export async function inspectEditorialPublication(requestedPath) {
  const articlePath = await resolveArticlePath(requestedPath)
  const context = contextFor(articlePath)
  const errors = []

  const reviewPath = path.join(context.articleDir, REVIEW_FILENAME)
  if (!(await exists(reviewPath))) {
    errors.push(`缺少 ${REVIEW_FILENAME}；先运行 review:editorial 并完成通用编辑审查`)
    return { applies: true, errors, context, reviewPath }
  }
  const review = await readJson(reviewPath, errors)
  if (!review) return { applies: true, errors, context, reviewPath }
  if (review.schemaVersion !== 1) errors.push('editorial-review.schemaVersion 必须是 1')
  if (review.reviewStatus !== 'approved') errors.push('editorial-review.reviewStatus 必须是 approved')
  if (!nonEmpty(review.reviewedBy)) errors.push('editorial-review.reviewedBy 必须记录')
  if (!nonEmpty(review.reviewedAt) || Number.isNaN(Date.parse(review.reviewedAt))) errors.push('editorial-review.reviewedAt 必须是有效日期')

  const articleBytes = await fs.readFile(articlePath)
  if (review.articleSha256 !== sha256(articleBytes)) errors.push('editorial-review.articleSha256 与当前正文不一致，正文修改后必须重新审查')
  for (const key of ['primaryMode', 'reader', 'readerJob', 'promise', 'evidenceBoundary', 'endingPurpose']) {
    if (!nonEmpty(review.articleContract?.[key])) errors.push(`editorial-review.articleContract.${key} 必须写明`)
  }
  if (typeof review.explanation?.applicable !== 'boolean') {
    errors.push('editorial-review.explanation.applicable 必须明确为 true 或 false')
  }
  if (!nonEmpty(review.explanation?.rationale)) errors.push('editorial-review.explanation.rationale 必须说明是否需要费曼解释')
  if (review.explanation?.applicable) {
    for (const key of ['retell', 'exampleOrArtifact', 'simplificationBoundary']) {
      if (!nonEmpty(review.explanation?.[key])) errors.push(`editorial-review.explanation.${key} 必须记录`)
    }
  }

  const parsed = matter(articleBytes.toString('utf8'))
  const remoteImages = collectRemoteImages(parsed.content)
  if (remoteImages.length) {
    errors.push(`正文包含 ${remoteImages.length} 张无法绑定哈希的远程或 data URL 图片；发布前保存到本篇 assets/ 并记录来源`)
  }
  const coverSource = parsed.data.cover || ''
  if (!coverSource) errors.push('准备发布到微信公众号的文章必须在 front matter 中绑定本篇封面')
  if (bodyReferences(parsed.content, coverSource)) errors.push('封面只用于草稿列表，正文不能再次引用同一张封面')
  if (review.cover?.path !== coverSource) errors.push('editorial-review.cover.path 必须与 front matter 的 cover 一致')
  const coverPath = coverSource ? path.resolve(context.articleDir, coverSource) : null
  if (!coverPath || !insideDirectory(coverPath, context.articleDir) || !(await exists(coverPath))) {
    errors.push('editorial-review.cover.path 必须指向文章目录内真实存在的封面')
  } else if (review.cover?.sha256 !== sha256(await fs.readFile(coverPath))) {
    errors.push('editorial-review.cover.sha256 与当前封面不一致')
  } else {
    const metadata = await sharp(coverPath).metadata()
    const ratio = metadata.width && metadata.height ? metadata.width / metadata.height : 0
    if (!metadata.width || !metadata.height || metadata.width < 900 || metadata.height < 383 || ratio < 2.34 || ratio > 2.36) {
      errors.push(`微信公众号封面必须至少为 900×383 且保持 2.35:1；当前为 ${metadata.width || '?'}×${metadata.height || '?'}`)
    }
  }
  const coverKinds = ['screenshot', 'real-artifact', 'photograph', 'imagegen', 'deterministic', 'hybrid']
  if (!coverKinds.includes(review.cover?.sourceKind)) errors.push(`editorial-review.cover.sourceKind 必须是 ${coverKinds.join('、')}`)
  for (const key of ['topicAccuracy', 'selectionRationale', 'textAccuracy', 'mobileThumbnailEvidence']) {
    if (!nonEmpty(review.cover?.[key])) errors.push(`editorial-review.cover.${key} 必须记录`)
  }
  if (['imagegen', 'deterministic', 'hybrid'].includes(review.cover?.sourceKind)) {
    const designPath = nonEmpty(review.cover?.designSource) ? path.resolve(context.articleDir, review.cover.designSource) : null
    if (!designPath || !insideDirectory(designPath, context.articleDir) || !(await exists(designPath))) {
      errors.push('生成或绘制封面必须记录文章目录内的 designSource')
    }
  } else if (!nonEmpty(review.cover?.evidenceOrigin)) {
    errors.push('真实封面素材必须记录 evidenceOrigin')
  }

  const sourceImages = collectImages(parsed.content, context.articleDir, coverSource)
  const reviewVisuals = Array.isArray(review.visuals) ? review.visuals : []
  if (JSON.stringify(sourceImages.map((item) => item.source).sort()) !== JSON.stringify(reviewVisuals.map((item) => item.path).sort())) {
    errors.push('editorial-review.visuals 必须与正文当前引用的所有本地内文图一一对应')
  }
  for (let index = 0; index < reviewVisuals.length; index += 1) {
    const visual = reviewVisuals[index]
    const prefix = `editorial-review.visuals[${index}]`
    const matching = sourceImages.find((item) => item.source === visual.path)
    const imagePath = path.resolve(context.articleDir, visual.path || '')
    if (!matching || !insideDirectory(imagePath, context.articleDir) || !(await exists(imagePath))) {
      errors.push(`${prefix}.path 必须指向正文当前引用的本地图片`)
    } else {
      if (visual.sha256 !== sha256(await fs.readFile(imagePath))) errors.push(`${prefix}.sha256 与当前图片不一致`)
      if (visual.altText !== matching.altText) errors.push(`${prefix}.altText 必须与 Markdown 图片说明一致`)
    }
    for (const key of ['contentJob', 'readerTakeaway']) {
      if (!nonEmpty(visual[key])) errors.push(`${prefix}.${key} 必须写明`)
    }
    if (!nonEmpty(visual.selection?.higherPriorityCheck) || !nonEmpty(visual.selection?.whyThisSource)) {
      errors.push(`${prefix}.selection 必须记录更高优先级形式检查和最终选型理由`)
    }
    const sourceKinds = ['screenshot', 'real-artifact', 'photograph', 'imagegen', 'deterministic', 'hybrid']
    if (!sourceKinds.includes(visual.sourceKind)) errors.push(`${prefix}.sourceKind 必须使用受支持的来源类型`)
    if (['screenshot', 'real-artifact', 'photograph'].includes(visual.sourceKind) && !nonEmpty(visual.evidenceOrigin)) {
      errors.push(`${prefix}.evidenceOrigin 必须记录真实素材来源`)
    }
    if (['imagegen', 'deterministic', 'hybrid'].includes(visual.sourceKind)) {
      const designPath = nonEmpty(visual.designSource) ? path.resolve(context.articleDir, visual.designSource) : null
      if (!designPath || !insideDirectory(designPath, context.articleDir) || !(await exists(designPath))) {
        errors.push(`${prefix}.designSource 必须指向文章目录内的提示词或绘制源`)
      }
    }
    for (const key of ['textAccuracy', 'semanticAccuracy', 'mobileLegibility']) {
      if (!nonEmpty(visual.review?.[key])) errors.push(`${prefix}.review.${key} 必须记录`)
    }
    validateDiagramGrammar(visual, prefix, errors)
  }

  const sourceMermaid = collectMermaid(parsed.content)
  const reviewMermaid = Array.isArray(review.mermaid) ? review.mermaid : []
  if (sourceMermaid.length !== reviewMermaid.length || sourceMermaid.some((item, index) => item.sha256 !== reviewMermaid[index]?.sha256)) {
    errors.push('editorial-review.mermaid 必须与正文当前 Mermaid 代码块逐一对应')
  }
  for (let index = 0; index < reviewMermaid.length; index += 1) {
    const item = reviewMermaid[index]
    const prefix = `editorial-review.mermaid[${index}]`
    if (!nonEmpty(item.contentJob) || !nonEmpty(item.readerTakeaway) || !nonEmpty(item.selection?.whyMermaid)) {
      errors.push(`${prefix} 必须说明内容任务、读者结论及前三种形式为何不适用`)
    }
    for (const key of ['textAccuracy', 'semanticAccuracy', 'mobileLegibility']) {
      if (!nonEmpty(item.review?.[key])) errors.push(`${prefix}.review.${key} 必须记录`)
    }
    validateDiagramGrammar(item, prefix, errors)
  }

  for (const key of ['readerPromiseAudit', 'logicAudit', 'evidenceAudit', 'authorVoiceAudit', 'plainLanguageAudit', 'aiPatternAudit', 'readAloudAudit', 'structureFitAudit', 'visualNecessityAudit', 'endingFitAudit', 'integrityAudit', 'mobilePreviewAudit']) {
    if (!nonEmpty(review.checks?.[key])) errors.push(`editorial-review.checks.${key} 必须记录可复核结论`)
  }
  const previewPath = nonEmpty(review.previewEvidence?.path) ? path.resolve(context.articleDir, review.previewEvidence.path) : null
  if (!previewPath || !insideDirectory(previewPath, context.articleDir) || !(await exists(previewPath))) {
    errors.push('editorial-review.previewEvidence.path 必须指向文章目录内真实存在的手机预览截图')
  } else if (review.previewEvidence.sha256 !== sha256(await fs.readFile(previewPath))) {
    errors.push('editorial-review.previewEvidence.sha256 与当前手机预览不一致')
  }
  if (!nonEmpty(review.previewEvidence?.viewport)) errors.push('editorial-review.previewEvidence.viewport 必须记录')

  return { applies: true, errors, context, reviewPath, review }
}

export async function assertEditorialArticlePublishable(articlePath) {
  const result = await inspectEditorialPublication(articlePath)
  if (result.errors.length) throw new Error(result.errors.join('\n'))
  return result
}
