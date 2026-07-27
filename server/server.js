const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { ParserError, parseRecordText, validateParsedLog } = require('./llm-parser')

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const PARSE_RATE_LIMIT = Math.max(1, Number(process.env.LLM_PARSE_RATE_LIMIT) || 20)
const PARSE_RATE_WINDOW_MS = 5 * 60 * 1000
const dataDir = path.join(__dirname, 'data')
const storePath = path.join(dataDir, 'store.json')
const parseRateBuckets = new Map()

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
    let tooLarge = false
    req.on('data', chunk => {
      if (tooLarge) return
      if (raw.length + chunk.length > 32 * 1024) {
        tooLarge = true
        return
      }
      raw += chunk
    })
    req.on('end', () => {
      if (tooLarge) return reject(new ParserError('request body is too large', 413, 'body_too_large'))
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function checkParseRateLimit(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const address = forwarded || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = parseRateBuckets.get(address)
  if (!bucket || now - bucket.startedAt >= PARSE_RATE_WINDOW_MS) {
    parseRateBuckets.set(address, { count: 1, startedAt: now })
    return
  }
  if (bucket.count >= PARSE_RATE_LIMIT) throw new ParserError('too many parse requests', 429, 'rate_limited')
  bucket.count += 1
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

    if (req.method === 'POST' && url.pathname === '/api/logs/parse') {
      checkParseRateLimit(req)
      const result = await parseRecordText(body.content || body.text)
      return send(res, 200, { ok: true, parsed: result.parsed, provider: result.provider, model: result.model })
    }

    if (req.method === 'POST' && url.pathname === '/api/profile') {
      store.profiles[id] = { ...body, user_id: id, updated_at: new Date().toISOString() }
      writeStore(store)
      return send(res, 200, { ok: true, profile: store.profiles[id] })
    }

    if (req.method === 'GET' && url.pathname === '/api/profile') {
      return send(res, 200, { ok: true, profile: store.profiles[id] || null })
    }

    if (req.method === 'POST' && url.pathname === '/api/logs') {
      let parsed = null
      if (body.parsed !== undefined && body.parsed !== null) {
        const validation = validateParsedLog(body.parsed)
        if (!validation.ok) throw new ParserError('parsed log is invalid', 422, 'invalid_parsed_log', { errors: validation.errors })
        parsed = validation.value
      }
      const log = {
        id: crypto.randomUUID(),
        user_id: id,
        type: parsed?.type || body.type || 'general',
        content: String(body.content || ''),
        parsed,
        source: body.source || 'natural_language',
        created_at: new Date().toISOString()
      }
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
    const statusCode = error.statusCode || 400
    return send(res, statusCode, {
      ok: false,
      error: {
        code: error.code || 'request_failed',
        message: error.message || 'request failed',
        ...(error.details ? { details: error.details } : {})
      }
    })
  }
}

http.createServer(handler).listen(PORT, HOST, () => {
  console.log(`Her Rhyme API listening on http://${HOST}:${PORT}`)
})
