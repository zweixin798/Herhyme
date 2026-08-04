const assert = require('node:assert/strict')
const test = require('node:test')
const {
  buildBaselineReadiness,
  buildDailySnapshots,
  buildResearchPackage,
  logToBodyEvent
} = require('../utils/body-memory')

test('confirmed parsed logs become canonical body events', () => {
  const event = logToBodyEvent({
    id: 'log-1',
    content: '昨晚睡了五个小时',
    createdAt: '2026-08-04T08:00:00+08:00',
    source: 'natural_language_llm',
    parsed: { type: 'sleep', sleep: { duration_min: 300, quality: 'poor' } }
  }, { includeRawText: true })

  assert.equal(event.domain, 'sleep')
  assert.equal(event.event_type, 'sleep_log')
  assert.equal(event.data.duration_min, 300)
  assert.equal(event.confirmation, 'user_confirmed')
  assert.equal(event.raw_text, '昨晚睡了五个小时')
})

test('daily snapshots aggregate research metrics without inventing missing values', () => {
  const snapshots = buildDailySnapshots([
    { domain: 'training', date: '2026-08-04', data: { duration_min: 40 } },
    { domain: 'diet', date: '2026-08-04', data: { items: [{ calories_est: 140, protein_est: 12 }] } },
    { domain: 'sleep', date: '2026-08-04', data: {} }
  ])

  assert.equal(snapshots[0].event_count, 3)
  assert.equal(snapshots[0].metrics.training_duration_min, 40)
  assert.equal(snapshots[0].metrics.diet_calories_est, 140)
  assert.equal(snapshots[0].metrics.sleep_duration_min, null)
})

test('missing estimates stay null instead of becoming measured zeroes', () => {
  const snapshots = buildDailySnapshots([
    { domain: 'diet', date: '2026-08-04', data: { items: [{ name: '一份早餐' }] } },
    { domain: 'training', date: '2026-08-04', data: { activity: '瑜伽', duration_min: null } }
  ])

  assert.equal(snapshots[0].metrics.diet_calories_est, null)
  assert.equal(snapshots[0].metrics.diet_protein_est, null)
  assert.equal(snapshots[0].metrics.training_duration_min, null)
})

test('baseline readiness is based on active days and cycle starts', () => {
  const events = Array.from({ length: 7 }, (_, index) => ({
    domain: index === 0 ? 'cycle' : 'mood',
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    data: index === 0 ? { is_period_start: true } : { mood: 'calm' }
  }))
  const readiness = buildBaselineReadiness(events)
  assert.equal(readiness.status, 'provisional')
  assert.equal(readiness.cycle_baseline_status, 'provisional')
})

test('empty parsed records do not mature the body baseline', () => {
  const readiness = buildBaselineReadiness([
    { domain: 'mood', date: '2026-08-01', data: {} },
    { domain: 'sleep', date: '2026-08-02', data: {} },
    { domain: 'training', date: '2026-08-03', data: { activity: '跑步' } }
  ])
  assert.equal(readiness.active_days, 1)
  assert.equal(readiness.sample_counts.mood, 0)
  assert.equal(readiness.sample_counts.training, 1)
})

test('research export excludes raw language unless the user opts in', () => {
  const input = {
    participantId: 'research-abc',
    profile: { age: 28 },
    logs: [{ id: '1', content: '今天很累', type: 'mood', createdAt: '2026-08-04T09:00:00+08:00' }]
  }
  const withoutRaw = buildResearchPackage(input, { includeRawText: false, generatedAt: '2026-08-04T10:00:00Z' })
  const withRaw = buildResearchPackage(input, { includeRawText: true, generatedAt: '2026-08-04T10:00:00Z' })
  assert.equal(withoutRaw.body_events[0].raw_text, undefined)
  assert.equal(withRaw.body_events[0].raw_text, '今天很累')
})
