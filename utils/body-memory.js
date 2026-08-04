const DOMAIN_KEYS = ['diet', 'training', 'sleep', 'cycle', 'mood']

function asDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function isReportedNumber(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))
}

function eventTypeFor(domain) {
  return {
    diet: 'diet_intake',
    training: 'training_log',
    sleep: 'sleep_log',
    cycle: 'cycle_status',
    mood: 'mood_state'
  }[domain] || 'body_note'
}

function eventData(log, domain) {
  const parsed = log.parsed || {}
  if (domain === 'diet') return { items: clone(parsed.diet_items || []) }
  if (domain === 'mood') return parsed.mood ? { mood: parsed.mood } : {}
  if (domain === 'training') return clone(parsed.training || {})
  if (domain === 'cycle') return clone(parsed.cycle || {})
  if (domain === 'sleep') return clone(parsed.sleep || {})
  return {}
}

function logToBodyEvent(log, options = {}) {
  const parsed = log?.parsed && typeof log.parsed === 'object' ? log.parsed : null
  const domain = DOMAIN_KEYS.includes(parsed?.type)
    ? parsed.type
    : DOMAIN_KEYS.includes(log?.type) ? log.type : 'general'
  const occurredAt = log?.createdAt || log?.created_at || new Date().toISOString()
  const event = {
    event_id: String(log?.id || `event-${Date.now()}`),
    domain,
    event_type: eventTypeFor(domain),
    occurred_at: occurredAt,
    date: asDateKey(occurredAt),
    data: eventData(log || {}, domain),
    source: String(log?.source || (parsed ? 'natural_language_llm' : 'natural_language_local')),
    confirmation: parsed ? 'user_confirmed' : 'raw_only'
  }
  if (options.includeRawText) event.raw_text = String(log?.content || '')
  return event
}

function buildDailySnapshots(events) {
  const byDate = {}
  events.forEach(event => {
    const date = event.date || asDateKey(event.occurred_at)
    if (!date) return
    if (!byDate[date]) {
      byDate[date] = {
        date,
        event_count: 0,
        domains: { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0, general: 0 },
        metrics: {
          diet_calories_est: null,
          diet_protein_est: null,
          training_duration_min: null,
          sleep_duration_min: null,
          cycle_pain_max: null,
          moods: []
        }
      }
    }
    const snapshot = byDate[date]
    snapshot.event_count += 1
    snapshot.domains[event.domain] = (snapshot.domains[event.domain] || 0) + 1

    if (event.domain === 'diet') {
      ;(event.data.items || []).forEach(item => {
        if (isReportedNumber(item.calories_est)) {
          snapshot.metrics.diet_calories_est = (snapshot.metrics.diet_calories_est || 0) + Number(item.calories_est)
        }
        if (isReportedNumber(item.protein_est)) {
          snapshot.metrics.diet_protein_est = (snapshot.metrics.diet_protein_est || 0) + Number(item.protein_est)
        }
      })
    }
    if (event.domain === 'training' && isReportedNumber(event.data.duration_min)) {
      snapshot.metrics.training_duration_min = (snapshot.metrics.training_duration_min || 0) + Number(event.data.duration_min)
    }
    if (event.domain === 'sleep' && isReportedNumber(event.data.duration_min)) {
      snapshot.metrics.sleep_duration_min = Number(event.data.duration_min)
    }
    if (event.domain === 'cycle' && isReportedNumber(event.data.pain_level)) {
      const pain = Number(event.data.pain_level)
      snapshot.metrics.cycle_pain_max = snapshot.metrics.cycle_pain_max === null
        ? pain
        : Math.max(snapshot.metrics.cycle_pain_max, pain)
    }
    if (event.domain === 'mood' && event.data.mood) snapshot.metrics.moods.push(event.data.mood)
  })
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

function maturityFor(activeDays) {
  if (activeDays < 3) return 'insufficient'
  if (activeDays < 7) return 'building'
  if (activeDays < 14) return 'provisional'
  return 'established'
}

function buildBaselineReadiness(events) {
  const sampleCounts = { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0, general: 0 }
  const activeDates = new Set()
  events.forEach(event => {
    const data = event.data || {}
    const hasSignal = event.domain === 'diet' ? Array.isArray(data.items) && data.items.length > 0
      : event.domain === 'mood' ? Boolean(data.mood)
        : DOMAIN_KEYS.includes(event.domain) && Object.keys(data).length > 0
    if (!hasSignal) return
    sampleCounts[event.domain] = (sampleCounts[event.domain] || 0) + 1
    if (event.date) activeDates.add(event.date)
  })
  const cycleStarts = events.filter(event => event.domain === 'cycle' && event.data.is_period_start).length
  return {
    status: maturityFor(activeDates.size),
    active_days: activeDates.size,
    event_count: events.length,
    sample_counts: sampleCounts,
    cycle_start_count: cycleStarts,
    cycle_baseline_status: cycleStarts >= 3 ? 'established' : cycleStarts >= 1 ? 'provisional' : 'insufficient'
  }
}

function sanitizeProfile(profile = {}) {
  return {
    sex: profile.sex || '',
    age: profile.age || '',
    height_cm: profile.height || '',
    weight_kg: profile.weight || '',
    target_weight_kg: profile.targetWeight || '',
    activity: profile.activity || '',
    average_cycle_length_days: profile.cycleLength || '',
    plan: clone(profile.plan || {})
  }
}

function buildResearchPackage(input, options = {}) {
  const logs = Array.isArray(input.logs) ? input.logs : []
  const events = logs.map(log => logToBodyEvent(log, { includeRawText: Boolean(options.includeRawText) }))
  return {
    schema_version: 'body-memory-research-v1',
    generated_at: options.generatedAt || new Date().toISOString(),
    participant_id: String(input.participantId || ''),
    consent: {
      research_export: true,
      includes_raw_text: Boolean(options.includeRawText)
    },
    profile: sanitizeProfile(input.profile),
    plans: clone(Array.isArray(input.plans) ? input.plans : []),
    body_events: events,
    daily_snapshots: buildDailySnapshots(events),
    baseline_readiness: buildBaselineReadiness(events),
    agent_feedback: clone(Array.isArray(input.agentFeedback) ? input.agentFeedback : [])
  }
}

module.exports = {
  asDateKey,
  buildBaselineReadiness,
  buildDailySnapshots,
  buildResearchPackage,
  logToBodyEvent
}
