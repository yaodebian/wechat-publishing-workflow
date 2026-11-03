import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WeChatClient, WeChatApiError } from '../src/wechat.js'

test('requests a token and submits a draft', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/cgi-bin/token?')) return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }))
    return new Response(JSON.stringify({ media_id: 'draft-1' }))
  }
  const client = new WeChatClient({ appId: 'app', appSecret: 'secret', apiBaseUrl: 'https://example.test' }, fetchImpl)
  const result = await client.addDraft({ title: '标题' })

  assert.equal(result.media_id, 'draft-1')
  assert.match(calls[0].url, /appid=app/)
  assert.match(calls[1].url, /access_token=token-1/)
  assert.deepEqual(JSON.parse(calls[1].options.body), { articles: [{ title: '标题' }] })
})

test('updates an existing draft without creating a duplicate', async () => {
  let request
  const fetchImpl = async (url, options = {}) => {
    request = { url, options }
    return new Response(JSON.stringify({ errcode: 0 }))
  }
  const client = new WeChatClient({ accessToken: 'direct', apiBaseUrl: 'https://example.test' }, fetchImpl)
  await client.updateDraft('draft-1', { title: '新标题' })

  assert.match(request.url, /draft\/update\?access_token=direct/)
  assert.deepEqual(JSON.parse(request.options.body), {
    media_id: 'draft-1',
    index: 0,
    articles: { title: '新标题' }
  })
})

test('uploads an article image as multipart data', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-image-'))
  const imagePath = path.join(dir, 'image.jpg')
  await fs.writeFile(imagePath, Buffer.from([1, 2, 3]))
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ url: 'https://mmbiz.qpic.cn/image.jpg' }))
  }
  const client = new WeChatClient({ accessToken: 'direct', apiBaseUrl: 'https://example.test' }, fetchImpl)
  const url = await client.uploadArticleImage(imagePath)

  assert.equal(url, 'https://mmbiz.qpic.cn/image.jpg')
  assert.match(request.url, /media\/uploadimg\?access_token=direct/)
  assert.ok(request.options.body instanceof FormData)
})

test('surfaces WeChat errcode responses', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ errcode: 40001, errmsg: 'invalid credential' }))
  const client = new WeChatClient({ accessToken: 'bad', apiBaseUrl: 'https://example.test' }, fetchImpl)
  await assert.rejects(() => client.addDraft({ title: '标题' }), WeChatApiError)
})

test('reports non-JSON gateway responses without a parser exception', async () => {
  const fetchImpl = async () => new Response('<!DOCTYPE html><title>Gateway error</title>', {
    status: 502,
    headers: { 'content-type': 'text/html' }
  })
  const client = new WeChatClient({ accessToken: 'token', apiBaseUrl: 'https://example.test' }, fetchImpl)

  await assert.rejects(
    () => client.addDraft({ title: '标题' }),
    /非 JSON 响应（HTTP 502，text\/html）/
  )
})

test('turns invalid IP responses into an actionable whitelist message', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    errcode: 40164,
    errmsg: 'invalid ip 23.247.137.109 ipv6 ::ffff:23.247.137.109, not in whitelist'
  }))
  const client = new WeChatClient({ accessToken: 'token', apiBaseUrl: 'https://example.test' }, fetchImpl)

  await assert.rejects(
    () => client.addDraft({ title: '标题' }),
    /当前公网 IP 23\.247\.137\.109 未加入公众号白名单/
  )
})
