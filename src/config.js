import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function loadConfig(overrides = {}) {
  dotenv.config({ path: path.join(toolRoot, '.env'), quiet: true })

  const resolveToolPath = (value, fallback) => {
    const selected = value || fallback
    return path.isAbsolute(selected) ? selected : path.resolve(toolRoot, selected)
  }

  const resolveOptionalToolPath = (value) => {
    if (!value) return undefined
    return path.isAbsolute(value) ? value : path.resolve(toolRoot, value)
  }

  return {
    accessToken: overrides.accessToken ?? process.env.WECHAT_ACCESS_TOKEN,
    appId: overrides.appId ?? process.env.WECHAT_APP_ID,
    appSecret: overrides.appSecret ?? process.env.WECHAT_APP_SECRET,
    author: overrides.author ?? process.env.WECHAT_AUTHOR ?? '',
    defaultCover: resolveOptionalToolPath(overrides.defaultCover ?? process.env.WECHAT_DEFAULT_COVER),
    template: resolveToolPath(
      overrides.template ?? process.env.WECHAT_TEMPLATE,
      './templates/default.html'
    ),
    sourceUrl: overrides.sourceUrl ?? process.env.WECHAT_CONTENT_SOURCE_URL ?? '',
    chromePath: overrides.chromePath ?? process.env.CHROME_PATH,
    apiBaseUrl: overrides.apiBaseUrl ?? process.env.WECHAT_API_BASE_URL ?? 'https://api.weixin.qq.com'
  }
}
