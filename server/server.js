const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const dataDir = path.join(__dirname, 'data')
const storePath = path.join(dataDir, 'store.json')

fs.mkdirSync(dataDir, { recursive: true })

function readStore() {
  if (!fs.existsSync(storePath)) return { profiles: {}, logs: [], weights: [] }
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'))
  } catch {
    return { profiles: {}, logs: [], weights: [] }
  }
}

function writeStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function userId(req, body = {}) {
  return String(req.headers['x-user-id'] || body.user_id || 'demo-user')
}

function calculateInsight(store, id) {
  const logs = store.logs.filter(item => item.user_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const weights = store.weights.filter(item => item.user_id === id).sort((a, b) => a.date.localeCompare(b.date))
  const counts = { diet: 0, mood: 0, training: 0, sleep: 0, cycle: 0 }
  logs.forEach(item => { if (counts[item.type] !== undefined) counts[item.type] += 1 })
  const recent = weights.slice(-7)
  const average = recent.length ? Math.round(recent.reduce((sum, item) => sum + Number(item.weight), 0) / recent.length * 10) / 10 : null
  return { logs: logs.slice(0, 20), weights, counts, recent_average: average }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const store = readStore()

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, service: 'her-rhyme-api' })
  }

  try {
    const body = req.method === 'POST' ? await readBody(req) : {}
    const id = userId(req, body)

    if (req.method === 'POST' && url.pathname === '/api/profile') {
      store.profiles[id] = { ...body, user_id: id, updated_at: new Date().toISOString() }
      writeStore(store)
      return send(res, 200, { ok: true, profile: store.profiles[id] })
    }

    if (req.method === 'GET' && url.pathname === '/api/profile') {
      return send(res, 200, { ok: true, profile: store.profiles[id] || null })
    }

    if (req.method === 'POST' && url.pathname === '/api/logs') {
      const log = { id: crypto.randomUUID(), user_id: id, type: body.type || 'general', content: String(body.content || ''), created_at: new Date().toISOString() }
      if (!log.content) return send(res, 400, { ok: false, message: 'content is required' })
      store.logs.unshift(log)
      writeStore(store)
      return send(res, 201, { ok: true, log })
    }

    if (req.method === 'GET' && url.pathname === '/api/logs') {
      return send(res, 200, { ok: true, ...calculateInsight(store, id) })
    }

    if (req.method === 'POST' && url.pathname === '/api/weights') {
      const weight = { id: crypto.randomUUID(), user_id: id, weight: Number(body.weight), date: body.date || new Date().toISOString().slice(0, 10), created_at: new Date().toISOString() }
      if (!Number.isFinite(weight.weight) || weight.weight <= 0) return send(res, 400, { ok: false, message: 'weight must be a positive number' })
      store.weights = store.weights.filter(item => !(item.user_id === id && item.date === weight.date))
      store.weights.push(weight)
      writeStore(store)
      return send(res, 201, { ok: true, weight })
    }

    if (req.method === 'GET' && url.pathname === '/api/insights') {
      return send(res, 200, { ok: true, insight: calculateInsight(store, id) })
    }

    return send(res, 404, { ok: false, message: 'not found' })
  } catch (error) {
    return send(res, 400, { ok: false, message: error.message })
  }
}

http.createServer(handler).listen(PORT, HOST, () => {
  console.log(`Her Rhyme API listening on http://${HOST}:${PORT}`)
})
