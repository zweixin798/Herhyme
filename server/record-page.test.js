const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const path = require('node:path')

function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function createRecordPage(logs) {
  let definition
  global.Page = value => { definition = value }
  global.wx = { getStorageSync: key => key === 'herRhymeLogs' ? logs : undefined }

  const pagePath = path.resolve(__dirname, '../pages/record/record.js')
  delete require.cache[pagePath]
  require(pagePath)

  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) }
  }
}

test('body map derives recent recovery and trends from confirmed fields', () => {
  const page = createRecordPage([
    {
      type: 'sleep',
      parsed: { type: 'sleep', sleep: { duration_min: 300, quality: 'poor' } },
      createdAt: daysAgo(0)
    },
    {
      type: 'training',
      content: '力量训练',
      parsed: { type: 'training', training: { activity: '力量训练', duration_min: 45 } },
      createdAt: daysAgo(1)
    }
  ])

  page.onShow()

  assert.equal(page.data.recovery.tone, 'attention')
  assert.match(page.data.recovery.status, /恢复空间/)
  assert.equal(page.data.trendSignals.find(item => item.key === 'sleep').value, '均值 5.0 小时')
  assert.equal(page.data.trendSignals.find(item => item.key === 'training').detail, '累计 45 分钟')
  assert.equal(page.data.recommendations.some(item => /睡眠均值偏短/.test(item)), true)
})

test('body map keeps missing duration values visibly unknown', () => {
  const page = createRecordPage([
    { type: 'sleep', parsed: { type: 'sleep', sleep: {} }, createdAt: daysAgo(0) },
    { type: 'training', parsed: { type: 'training', training: { activity: '瑜伽' } }, createdAt: daysAgo(1) }
  ])

  page.onShow()

  assert.equal(page.data.trendSignals.find(item => item.key === 'sleep').value, '已记录')
  assert.equal(page.data.trendSignals.find(item => item.key === 'sleep').detail, '还缺少睡眠时长')
  assert.equal(page.data.trendSignals.find(item => item.key === 'training').detail, '还缺少训练时长')
})

test('unstructured fallback text does not mature body-map statistics', () => {
  const page = createRecordPage([
    { type: 'general', content: '随手写下一句话', parsed: null, createdAt: daysAgo(0) }
  ])

  page.onShow()

  assert.equal(page.data.rangeStats.records, 0)
  assert.equal(page.data.completenessText, '0 / 7 天')
  assert.equal(page.data.coverageText, '0 / 5 类')
})

test('record tab contains trends without natural-language entry or raw logs', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/record/record.wxml'), 'utf8')

  assert.doesNotMatch(wxml, /textarea|自然语言|识别结果|最近记录/)
  assert.match(wxml, /身体地图/)
  assert.match(wxml, /近期趋势/)
  assert.match(wxml, /身体建议/)
})
