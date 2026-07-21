import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGroups, saveGroups, resetToDefault, hasPersistedData } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3002
const NAPCAT_TARGET = process.env.NAPCAT_TARGET || 'http://172.17.0.1:3100'
const DIST_DIR = path.join(__dirname, '..', 'dist')

// SSE clients subscribed to live data updates
const sseClients = new Set()

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch { resolve({}) }
    })
  })
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'update', ts: Date.now() })}\n\n`
  for (const c of sseClients) {
    try { c.write(payload) } catch { sseClients.delete(c) }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = path.normalize(path.join(DIST_DIR, urlPath))
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback
      const fallback = path.join(DIST_DIR, 'index.html')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' })
      fs.createReadStream(fallback).pipe(res)
      return
    }
    const ext = path.extname(filePath)
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' }
    headers['Cache-Control'] = filePath.endsWith('index.html') ? 'no-cache, no-store, must-revalidate' : 'public, immutable'
    res.writeHead(200, headers)
    fs.createReadStream(filePath).pipe(res)
  })
}

function proxyToNapcat(req, res) {
  const target = new URL(req.url, NAPCAT_TARGET)
  const options = {
    hostname: target.hostname,
    port: target.port || 80,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers, host: target.host }
  }
  delete options.headers['host']
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxyReq.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Bad gateway') })
  req.pipe(proxyReq)
}

function handleDataApi(req, res, body) {
  const p = req.url.split('?')[0]
  if (p === '/data-api/groups') {
    if (req.method === 'GET') {
      try { return sendJson(res, 200, loadGroups()) } catch (e) { return sendJson(res, 500, { error: e.message }) }
      // loadGroups() returns null when no data file exists yet (client should migrate)
    }
    if (req.method === 'PUT') {
      if (!Array.isArray(body)) return sendJson(res, 400, { error: 'Invalid data format' })
      try { saveGroups(body); broadcast(); return sendJson(res, 200, { ok: true }) } catch (e) { return sendJson(res, 500, { error: e.message }) }
    }
  }
  if (p === '/data-api/groups/reset' && req.method === 'POST') {
    try { resetToDefault(); broadcast(); return sendJson(res, 200, { ok: true }) } catch (e) { return sendJson(res, 500, { error: e.message }) }
  }
  // One-shot migration: only writes if the server has no data yet (first writer wins)
  if (p === '/data-api/groups/migrate' && req.method === 'POST') {
    if (!Array.isArray(body)) return sendJson(res, 400, { error: 'Invalid data format' })
    if (hasPersistedData()) return sendJson(res, 200, { ok: true, written: false })
    try { saveGroups(body); broadcast(); return sendJson(res, 200, { ok: true, written: true }) } catch (e) { return sendJson(res, 500, { error: e.message }) }
  }
  if (p === '/data-api/groups/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 3000\n\n')
    sseClients.add(res)
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 25000)
    req.on('close', () => { clearInterval(ping); sseClients.delete(res) })
    return
  }
  res.writeHead(404)
  res.end('Not found')
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0]
  if (urlPath.startsWith('/data-api')) {
    const body = await readBody(req)
    return handleDataApi(req, res, body)
  }
  if (urlPath.startsWith('/api')) {
    return proxyToNapcat(req, res)
  }
  return serveStatic(req, res)
})

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/api')) return socket.destroy()
  const target = new URL(req.url, NAPCAT_TARGET)
  const proxyReq = http.request({
    hostname: target.hostname,
    port: target.port || 80,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers }
  })
  proxyReq.on('upgrade', (proxyRes, proxySocket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      Object.keys(proxyRes.headers).map(k => `${k}: ${proxyRes.headers[k]}`).join('\r\n') +
      '\r\n\r\n'
    )
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
  })
  proxyReq.on('error', () => socket.destroy())
  if (head && head.length) proxyReq.write(head)
  proxyReq.end()
})

server.listen(PORT, () => {
  console.log(`[qq-bot-server] listening on http://localhost:${PORT}`)
  console.log(`[qq-bot-server] NapCat target: ${NAPCAT_TARGET}`)
  console.log(`[qq-bot-server] DATA_DIR: ${process.env.DATA_DIR || __dirname}`)
})
