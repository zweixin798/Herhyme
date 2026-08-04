const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')

function createTodayPage(storage) {
  let definition
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    navigateTo: options => { storage.lastNavigation = options },
    switchTab: () => {},
    showToast: () => {}
  }

  const pagePath = path.resolve(__dirname, '../pages/today/today.js')
  delete require.cache[pagePath]
  require(pagePath)

  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) }
  }
}

test('today page keeps signals compact and derives recovery reminders from recent training', () => {
  const trainingDate = new Date()
  trainingDate.setDate(trainingDate.getDate() - 2)
  const storage = {
    herRhymeProfile: { cycleLength: 28, plan: { calories: 1600 } },
    herRhymePlans: [],
    herRhymeLogs: [{
      id: 'training-1',
      type: 'training',
      content: '完成了力量训练',
      parsed: { type: 'training', training: { activity: '力量训练', duration_min: 40 } },
      createdAt: trainingDate.toISOString()
    }]
  }
  const page = createTodayPage(storage)

  page.onShow()
  assert.match(page.data.recoveryReminder, /2 天前.*力量训练.*拉伸和恢复/)
  assert.deepEqual(page.data.quickItems.map(item => item.label), ['饮食', '训练', '睡眠', '经期', '心情'])
  assert.equal(page.data.quickItems.every(item => !Object.hasOwn(item, 'note')), true)
  page.onHide()
})

test('today check-in opens the dedicated natural-language page', () => {
  const storage = { herRhymeProfile: {}, herRhymePlans: [], herRhymeLogs: [] }
  const page = createTodayPage(storage)

  page.openRecord({ currentTarget: { dataset: { type: 'sleep' } } })

  assert.equal(storage.herRhymePendingRecordType, 'sleep')
  assert.deepEqual(storage.lastNavigation, { url: '/pages/checkin/checkin' })
})
