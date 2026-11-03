import fs from 'node:fs/promises'
import path from 'node:path'

export class WeChatApiError extends Error {
  constructor(message, response) {
    super(message)
    this.name = 'WeChatApiError'
    this.response = response
  }
}

function describeApiError(data, fallback) {
  const detail = data.errmsg || fallback
  const invalidIp = detail?.match(/invalid ip\s+((?:\d{1,3}\.){3}\d{1,3})/i)
  if (invalidIp) {
    return `当前公网 IP ${invalidIp[1]} 未加入公众号白名单。请在微信公众平台的“设置与开发 → 基本配置 → IP 白名单”中添加该 IPv4 地址。`
  }
  return detail
}

export class WeChatClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config
    this.fetch = fetchImpl
    this.cachedToken = config.accessToken || ''
  }

  async requestJson(pathname, options = {}) {
    const response = await this.fetch(`${this.config.apiBaseUrl}${pathname}`, options)
    const raw = await response.text()
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      const contentType = response.headers.get('content-type') || 'unknown'
      const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 120)
      throw new WeChatApiError(
        `微信公众号接口返回了非 JSON 响应（HTTP ${response.status}，${contentType}）：${preview || '空响应'}`,
        { status: response.status, contentType }
      )
    }
    if (!response.ok || (data.errcode && data.errcode !== 0)) {
      throw new WeChatApiError(`微信公众号接口失败：${describeApiError(data, response.statusText)}`, data)
    }
    return data
  }

  async getAccessToken() {
    if (this.cachedToken) return this.cachedToken
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error('请在 .env 中配置 WECHAT_ACCESS_TOKEN，或同时配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。')
    }
    const params = new URLSearchParams({
      grant_type: 'client_credential',
      appid: this.config.appId,
      secret: this.config.appSecret
    })
    const data = await this.requestJson(`/cgi-bin/token?${params}`)
    this.cachedToken = data.access_token
    return this.cachedToken
  }

  async uploadFile(endpoint, filePath, fieldName = 'media') {
    const token = await this.getAccessToken()
    const bytes = await fs.readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()
    const mime = extension === '.png' ? 'image/png' : 'image/jpeg'
    const form = new FormData()
    form.append(fieldName, new Blob([bytes], { type: mime }), path.basename(filePath))
    return this.requestJson(`${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: form
    })
  }

  async uploadArticleImage(filePath) {
    const data = await this.uploadFile('/cgi-bin/media/uploadimg', filePath)
    if (!data.url) throw new WeChatApiError('正文图片上传成功，但接口没有返回 URL。', data)
    return data.url
  }

  async uploadCover(filePath) {
    const data = await this.uploadFile('/cgi-bin/material/add_material?type=image', filePath)
    if (!data.media_id) throw new WeChatApiError('封面上传成功，但接口没有返回 media_id。', data)
    return data.media_id
  }

  async addDraft(article) {
    const token = await this.getAccessToken()
    return this.requestJson(`/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ articles: [article] })
    })
  }

  async updateDraft(mediaId, article, index = 0) {
    const token = await this.getAccessToken()
    return this.requestJson(`/cgi-bin/draft/update?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ media_id: mediaId, index, articles: article })
    })
  }
}
