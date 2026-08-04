const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')
const { PARSED_LOG_SCHEMA, evaluateParsedLog, parseRecordText, validateParsedLog } = require('./llm-parser')

test('schema requires a supported record type', () => {
  assert.deepEqual(PARSED_LOG_SCHEMA.parameters.required, ['type'])
  assert.equal(validateParsedLog({ type: 'unknown' }).ok, false)
  assert.equal(validateParsedLog({ type: 'sleep', sleep: { duration_min: 420, quality: 'good' } }).ok, true)
})

test('validator rejects values outside product ranges', () => {
  assert.equal(validateParsedLog({ type: 'cycle', cycle: { pain_level: 11 } }).ok, false)
  assert.equal(validateParsedLog({ type: 'training', training: { duration_min: 1441 } }).ok, false)
  assert.equal(validateParsedLog({ type: 'diet', diet_items: [{ name: '鸡蛋', calories_est: -1 }] }).ok, false)
  assert.equal(validateParsedLog({ type: 'mood', training: { activity: '跑步' } }).ok, false)
  assert.equal(validateParsedLog({ type: 'sleep', sleep: {}, diagnosis: '失眠' }).ok, false)
})

test('deterministic rules flag missing details and high pain after model parsing', () => {
  assert.deepEqual(evaluateParsedLog({ type: 'training', training: { activity: '跑步' } }).follow_up_fields, ['training.duration_min'])
  assert.equal(evaluateParsedLog({ type: 'cycle', cycle: { pain_level: 8 } }).safety_level, 'attention')
  assert.deepEqual(evaluateParsedLog({ type: 'sleep', sleep: { duration_min: 420 } }).flags, [])
  const dietRules = evaluateParsedLog({ type: 'diet', diet_items: [{ name: '鸡蛋' }] })
  assert.equal(dietRules.needs_follow_up, true)
  assert.deepEqual(dietRules.follow_up_fields, ['diet_items.amount'])
  assert.deepEqual(dietRules.flags, ['diet_estimates_missing'])
  assert.equal(dietRules.safety_level, 'normal')
})

test('source-text safety rules do not depend on model extraction', () => {
  const physical = evaluateParsedLog({ type: 'cycle', cycle: {} }, '流血不止，而且刚刚昏厥了')
  const selfHarm = evaluateParsedLog({ type: 'mood', mood: 'low' }, '我现在有点想伤害自己')
  assert.equal(physical.safety_level, 'urgent')
  assert.ok(physical.flags.includes('urgent_physical_symptom_language'))
  assert.equal(selfHarm.safety_level, 'urgent')
  assert.ok(selfHarm.flags.includes('self_harm_language'))
})

test('parser forces the only function and returns validated arguments', async t => {
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      const body = JSON.parse(raw)
      assert.equal(body.tool_choice, 'required')
      assert.equal(body.tools.length, 1)
      assert.equal(body.tools[0].function.name, 'save_parsed_log')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'save_parsed_log',
                arguments: JSON.stringify({
                  type: 'diet',
                  diet_items: [{ name: '鸡蛋', amount: '2 个', calories_est: 140, protein_est: 12 }]
                })
              }
            }]
          }
        }]
      }))
    })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  const result = await parseRecordText('早餐吃了两个鸡蛋', {
    LLM_PROVIDER: 'deepseek',
    LLM_API_KEY: 'server-only-test-key',
    LLM_BASE_URL: `http://127.0.0.1:${address.port}`,
    LLM_MODEL: 'mock-model'
  })

  assert.equal(result.parsed.type, 'diet')
  assert.equal(result.parsed.diet_items[0].calories_est, 140)
})

test('parser fails explicitly when no server key is configured', async () => {
  await assert.rejects(
    parseRecordText('今天心情平静', { LLM_PROVIDER: 'deepseek' }),
    error => error.code === 'llm_not_configured' && error.statusCode === 503
  )
})
