const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const path = require('node:path')

function createCheckinPage(pendingType) {
  let definition
  let removedKey = ''
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => key === 'herRhymePendingRecordType' ? pendingType : undefined,
    setStorageSync: () => {},
    removeStorageSync: key => { removedKey = key },
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } })
  }

  const apiPath = path.resolve(__dirname, '../utils/api.js')
  const pagePath = path.resolve(__dirname, '../pages/checkin/checkin.js')
  delete require.cache[apiPath]
  delete require.cache[pagePath]
  require(pagePath)

  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) }
  }
  return { page, removedKey: () => removedKey }
}

test('dedicated check-in page adapts its example to the selected signal', () => {
  const { page, removedKey } = createCheckinPage('sleep')

  page.onShow()

  assert.match(page.data.placeholder, /昨晚睡了 6 小时/)
  assert.equal(removedKey(), 'herRhymePendingRecordType')
})

test('check-in keeps natural-language review controls outside the record tab', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/checkin/checkin.wxml'), 'utf8')

  assert.match(wxml, /textarea/)
  assert.match(wxml, /识别结果/)
  assert.match(wxml, /确认并保存/)
  assert.doesNotMatch(wxml, /map-section|trend-section|近期趋势/)
})
