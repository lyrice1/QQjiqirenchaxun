import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadGroups, saveGroups, resetToDefault } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const NAPCAT_TARGET = process.env.NAPCAT_TARGET || 'http://172.17.0.1:3100'

app.use(express.json({ limit: '10mb' }))

app.use('/data-api', (req, res, next) => {
  if (req.path === '/groups') {
    if (req.method === 'GET') {
      try {
        return res.json(loadGroups())
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }
    if (req.method === 'PUT') {
      try {
        if (!Array.isArray(req.body)) {
          return res.status(400).json({ error: 'Invalid data format' })
        }
        saveGroups(req.body)
        return res.json({ ok: true })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }
  }
  if (req.path === '/groups/reset' && req.method === 'POST') {
    try {
      resetToDefault()
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }
  next()
})

app.use('/api', (req, res) => {
  const targetUrl = new URL(req.url, NAPCAT_TARGET)
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host }
  }
  delete options.headers['host']

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxyReq.on('error', () => res.status(502).end())
  if (req.body && Object.keys(req.body).length) {
    proxyReq.write(JSON.stringify(req.body))
  }
  req.pipe(proxyReq)
})

app.use(express.static(path.join(__dirname, '..', 'dist'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }
  }
}))

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/api')) return socket.destroy()
  const targetUrl = new URL(req.url, NAPCAT_TARGET)
  const proxyReq = http.request({
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers }
  })
  proxyReq.on('upgrade', (proxyRes, proxySocket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
      Object.keys(proxyRes.headers).map(k => `${k}: ${proxyRes.headers[k]}`).join('\r\n') +
      '\r\n\r\n')
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
  })
  proxyReq.on('error', () => socket.destroy())
  proxyReq.end()
  socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n')
  proxyReq.end()
})
