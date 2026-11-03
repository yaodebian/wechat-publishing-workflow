import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const RENDERER_VERSION = 'wechat-mermaid-v2'

const COMMON_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
]

async function findChrome(configuredPath) {
  for (const candidate of [configuredPath, ...COMMON_CHROME_PATHS].filter(Boolean)) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Try the next common location.
    }
  }
  throw new Error('找不到 Chrome/Chromium。请安装 Chrome，或在 .env 中设置 CHROME_PATH。')
}

function extractMermaidBlocks(markdown) {
  const blocks = []
  const content = markdown.replace(/^```mermaid\s*\n([\s\S]*?)^```\s*$/gm, (_, source) => {
    const index = blocks.push(source.trim()) - 1
    return `\nWECHAT_MERMAID_BLOCK_${index}\n`
  })
  return { content, blocks }
}

export function mermaidImageMarkdown(imagePath) {
  // Markdown destinations containing spaces must be enclosed in angle brackets.
  // Course directories commonly contain Chinese titles and spaces.
  return `![流程图](<${imagePath}>)`
}

export async function renderMermaidBlocks(markdown, outputDir, options = {}) {
  const { content, blocks } = extractMermaidBlocks(markdown)
  if (blocks.length === 0) return { markdown: content, images: [] }

  await fs.mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({
    executablePath: await findChrome(options.chromePath),
    headless: true
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  const mermaidScript = require.resolve('mermaid/dist/mermaid.min.js')
  const images = []

  try {
    await page.setContent('<!doctype html><html><body><div id="diagram"></div></body></html>')
    await page.addScriptTag({ path: mermaidScript })

    for (const source of blocks) {
      const hash = crypto.createHash('sha256').update(`${RENDERER_VERSION}\n${source}`).digest('hex').slice(0, 12)
      const filename = `mermaid-${hash}.png`
      const outputPath = path.join(outputDir, filename)

      try {
        await fs.access(outputPath)
      } catch {
        await page.evaluate(async ({ diagram, id }) => {
          document.body.style.margin = '0'
          document.body.style.padding = '0'
          document.body.style.background = '#ffffff'
          document.body.style.display = 'block'
          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base',
            flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: true },
            themeVariables: {
              primaryColor: '#e9f7f2',
              primaryTextColor: '#202124',
              primaryBorderColor: '#14a37f',
              lineColor: '#65707c',
              secondaryColor: '#f7f8fa',
              tertiaryColor: '#ffffff',
              fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
              fontSize: '18px'
            }
          })
          const result = await window.mermaid.render(id, diagram)
          const container = document.querySelector('#diagram')
          container.innerHTML = result.svg
          const svg = container.querySelector('svg')
          const viewBox = svg.viewBox.baseVal
          const padding = 32
          svg.setAttribute('width', String(viewBox.width))
          svg.setAttribute('height', String(viewBox.height))
          svg.style.display = 'block'
          svg.style.maxWidth = 'none'
          container.style.boxSizing = 'content-box'
          container.style.width = `${viewBox.width}px`
          container.style.height = `${viewBox.height}px`
          container.style.padding = `${padding}px`
          container.style.background = '#ffffff'
        }, { diagram: source, id: `mermaid-${hash}` })
        await page.locator('#diagram').screenshot({ path: outputPath, animations: 'disabled' })
      }

      images.push(outputPath)
    }
  } finally {
    await browser.close()
  }

  let replaced = content
  images.forEach((imagePath, index) => {
    replaced = replaced.replace(`WECHAT_MERMAID_BLOCK_${index}`, mermaidImageMarkdown(imagePath))
  })
  return { markdown: replaced, images }
}
