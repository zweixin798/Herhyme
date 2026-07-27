const http = require('http')
const https = require('https')

const PARSED_TYPES = ['diet', 'mood', 'training', 'cycle', 'sleep']
const MOODS = ['happy', 'calm', 'tired', 'stressed', 'low']
const FLOWS = ['light', 'medium', 'heavy']
const SLEEP_QUALITIES = ['poor', 'fair', 'good']

// The sleep branch keeps the parser aligned with the five record categories already in the mini program.
const PARSED_LOG_SCHEMA = {
  name: 'save_parsed_log',
  description: 'Parse one Her Rhyme body log into a structured record.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: PARSED_TYPES },
      diet_items: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            amount: { type: 'string' },
            calories_est: { type: 'number' },
            protein_est: { type: 'number' }
          },
          required: ['name']
        }
      },
      mood: { type: 'string', enum: MOODS },
      training: {
        type: 'object',
        additionalProperties: false,
        properties: {
          activity: { type: 'string' },
          duration_min: { type: 'number' }
        }
      },
      cycle: {
        type: 'object',
        additionalProperties: false,
        properties: {
          is_period_start: { type: 'boolean' },
          day: { type: 'number' },
          pain_level: { type: 'number' },
          flow: { type: 'string', enum: FLOWS }
        }
      },
      sleep: {
        type: 'object',
        additionalProperties: false,
        properties: {
          duration_min: { type: 'number' },
          quality: { type: 'string', enum: SLEEP_QUALITIES }
        }
      }
    },
    required: ['type']
  }
}

const PROVIDER_DEFAULTS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  }
}

class ParserError extends Error {
  constructor(message, statusCode = 500, code = 'parser_error', details = undefined) {
    super(message)
    this.name = 'ParserError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

function getLlmConfig(env = process.env) {
  const provider = String(env.LLM_PROVIDER || 'deepseek').toLowerCase()
  const defaults = PROVIDER_DEFAULTS[provider]
  if (!defaults) throw new ParserError(`Unsupported LLM_PROVIDER: ${provider}`, 500, 'invalid_llm_provider')

  const apiKey = env.LLM_API_KEY || (provider === 'deepseek' ? env.DEEPSEEK_API_KEY : env.DASHSCOPE_API_KEY)
  return {
    provider,
    apiKey,
    baseUrl: String(env.LLM_BASE_URL || defaults.baseUrl).replace(/\/$/, ''),
    model: String(env.LLM_MODEL || defaults.model)
  }
}

function requestJson(urlString, payload, apiKey, timeoutMs = 15000) {
  const url = new URL(urlString)
  const transport = url.protocol === 'http:' ? http : https
  const body = JSON.stringify(payload)

  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: timeoutMs
    }, response => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        raw += chunk
        if (raw.length > 1024 * 1024) req.destroy(new ParserError('LLM response is too large', 502, 'llm_response_too_large'))
      })
      response.on('end', () => {
        let data
        try {
          data = raw ? JSON.parse(raw) : {}
        } catch {
          return reject(new ParserError('LLM returned invalid JSON', 502, 'llm_invalid_response'))
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new ParserError('LLM upstream request failed', 502, 'llm_upstream_error', { statusCode: response.statusCode }))
        }
        resolve(data)
      })
    })

    req.on('timeout', () => req.destroy(new ParserError('LLM request timed out', 504, 'llm_timeout')))
    req.on('error', error => reject(error instanceof ParserError ? error : new ParserError('LLM request failed', 502, 'llm_request_failed')))
    req.write(body)
    req.end()
  })
}

function addError(errors, path, message) {
  errors.push({ path, message })
}

function boundedString(value, path, errors, maxLength = 120, required = false) {
  if (value === undefined || value === null) {
    if (required) addError(errors, path, 'must be a string')
    return undefined
  }
  if (typeof value !== 'string') {
    addError(errors, path, 'must be a string')
    return undefined
  }
  const result = value.trim()
  if (required && !result) addError(errors, path, 'must not be empty')
  if (result.length > maxLength) addError(errors, path, `must be at most ${maxLength} characters`)
  return result
}

function boundedNumber(value, path, errors, min, max, integer = false) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addError(errors, path, 'must be a finite number')
    return undefined
  }
  if (value < min || value > max) addError(errors, path, `must be between ${min} and ${max}`)
  if (integer && !Number.isInteger(value)) addError(errors, path, 'must be an integer')
  return value
}

function boundedEnum(value, path, errors, choices) {
  if (value === undefined || value === null) return undefined
  if (!choices.includes(value)) {
    addError(errors, path, `must be one of: ${choices.join(', ')}`)
    return undefined
  }
  return value
}

function validateParsedLog(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '', message: 'must be an object' }] }
  }

  const type = boundedEnum(input.type, 'type', errors, PARSED_TYPES)
  const value = {}
  if (type) value.type = type

  if (input.diet_items !== undefined && input.diet_items !== null) {
    if (!Array.isArray(input.diet_items)) {
      addError(errors, 'diet_items', 'must be an array')
    } else if (input.diet_items.length > 20) {
      addError(errors, 'diet_items', 'must contain at most 20 items')
    } else {
      value.diet_items = input.diet_items.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          addError(errors, `diet_items[${index}]`, 'must be an object')
          return {}
        }
        const result = {}
        const name = boundedString(item.name, `diet_items[${index}].name`, errors, 80, true)
        const amount = boundedString(item.amount, `diet_items[${index}].amount`, errors, 60)
        const calories = boundedNumber(item.calories_est, `diet_items[${index}].calories_est`, errors, 0, 5000)
        const protein = boundedNumber(item.protein_est, `diet_items[${index}].protein_est`, errors, 0, 500)
        if (name !== undefined) result.name = name
        if (amount !== undefined) result.amount = amount
        if (calories !== undefined) result.calories_est = calories
        if (protein !== undefined) result.protein_est = protein
        return result
      })
    }
  }

  const mood = boundedEnum(input.mood, 'mood', errors, MOODS)
  if (mood) value.mood = mood

  if (input.training !== undefined && input.training !== null) {
    if (!input.training || typeof input.training !== 'object' || Array.isArray(input.training)) {
      addError(errors, 'training', 'must be an object')
    } else {
      const training = {}
      const activity = boundedString(input.training.activity, 'training.activity', errors, 80)
      const duration = boundedNumber(input.training.duration_min, 'training.duration_min', errors, 0, 1440)
      if (activity !== undefined) training.activity = activity
      if (duration !== undefined) training.duration_min = duration
      value.training = training
    }
  }

  if (input.cycle !== undefined && input.cycle !== null) {
    if (!input.cycle || typeof input.cycle !== 'object' || Array.isArray(input.cycle)) {
      addError(errors, 'cycle', 'must be an object')
    } else {
      const cycle = {}
      if (input.cycle.is_period_start !== undefined && input.cycle.is_period_start !== null) {
        if (typeof input.cycle.is_period_start !== 'boolean') addError(errors, 'cycle.is_period_start', 'must be a boolean')
        else cycle.is_period_start = input.cycle.is_period_start
      }
      const day = boundedNumber(input.cycle.day, 'cycle.day', errors, 1, 60, true)
      const pain = boundedNumber(input.cycle.pain_level, 'cycle.pain_level', errors, 0, 10)
      const flow = boundedEnum(input.cycle.flow, 'cycle.flow', errors, FLOWS)
      if (day !== undefined) cycle.day = day
      if (pain !== undefined) cycle.pain_level = pain
      if (flow !== undefined) cycle.flow = flow
      value.cycle = cycle
    }
  }

  if (input.sleep !== undefined && input.sleep !== null) {
    if (!input.sleep || typeof input.sleep !== 'object' || Array.isArray(input.sleep)) {
      addError(errors, 'sleep', 'must be an object')
    } else {
      const sleep = {}
      const duration = boundedNumber(input.sleep.duration_min, 'sleep.duration_min', errors, 0, 1440)
      const quality = boundedEnum(input.sleep.quality, 'sleep.quality', errors, SLEEP_QUALITIES)
      if (duration !== undefined) sleep.duration_min = duration
      if (quality !== undefined) sleep.quality = quality
      value.sleep = sleep
    }
  }

  if (!value.type) addError(errors, 'type', 'is required')
  return { ok: errors.length === 0, value, errors }
}

function extractToolArguments(response) {
  const message = response?.choices?.[0]?.message || {}
  const toolCalls = message.tool_calls || []
  const call = toolCalls.find(item => item?.function?.name === PARSED_LOG_SCHEMA.name)
    || (message.function_call?.name === PARSED_LOG_SCHEMA.name ? { function: message.function_call } : null)
  if (!call) throw new ParserError('LLM did not return the required function call', 502, 'llm_missing_tool_call')
  const args = call.function.arguments
  if (typeof args === 'object') return args
  if (typeof args !== 'string') throw new ParserError('LLM function arguments are missing', 502, 'llm_invalid_response')
  try {
    return JSON.parse(args)
  } catch {
    throw new ParserError('LLM function arguments are not valid JSON', 502, 'llm_invalid_response')
  }
}

async function parseRecordText(text, env = process.env) {
  if (typeof text !== 'string' || !text.trim()) throw new ParserError('content is required', 400, 'content_required')
  if (text.trim().length > 2000) throw new ParserError('content must be at most 2000 characters', 413, 'content_too_long')

  const config = getLlmConfig(env)
  if (!config.apiKey) throw new ParserError('LLM_API_KEY is not configured on the server', 503, 'llm_not_configured')

  const response = await requestJson(`${config.baseUrl}/chat/completions`, {
    model: config.model,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: [
          '你是 Her Rhyme 的身体记录解析器。每次响应都必须调用 save_parsed_log，禁止输出普通文本，禁止向用户追问。',
          '只提取用户明确说出的信息；信息不足时省略对应字段，不要补造时长、周期天数或疼痛等级。',
          '如果一句话包含多个意图，只选择最主要、最具体的身体信号作为 type，并仍然调用函数。',
          '食物热量和蛋白质可以做保守的近似估算，用户会在保存前确认和修改。'
        ].join('\n')
      },
      { role: 'user', content: text.trim() }
    ],
    tools: [{ type: 'function', function: PARSED_LOG_SCHEMA }],
    // There is only one tool, so "required" still forces save_parsed_log and works with thinking-mode gateways.
    tool_choice: 'required',
    parallel_tool_calls: false
  }, config.apiKey)

  const candidate = extractToolArguments(response)
  const result = validateParsedLog(candidate)
  if (!result.ok) throw new ParserError('LLM returned fields outside the allowed ranges', 422, 'llm_invalid_output', { errors: result.errors })
  return { parsed: result.value, provider: config.provider, model: config.model }
}

module.exports = {
  PARSED_LOG_SCHEMA,
  ParserError,
  getLlmConfig,
  parseRecordText,
  validateParsedLog
}
