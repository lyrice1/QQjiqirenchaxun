import express from 'express'
import { loadGroups, saveGroups, resetToDefault } from './db.js'

const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json({ limit: '10mb' }))

app.get('/data-api/groups', (_req, res) => {
  try {
    const groups = loadGroups()
    res.json(groups)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/data-api/groups', (req, res) => {
  try {
    const groups = req.body
    if (!Array.isArray(groups)) {
      return res.status(400).json({ error: 'Invalid data format, expected array' })
    }
    saveGroups(groups)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/data-api/groups/reset', (_req, res) => {
  try {
    resetToDefault()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
