const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')

function setByPath(target, key, value) {
  const parts = key.split('.')
  let current = target
  parts.slice(0, -1).forEach(part => {
    current[part] = current[part] || {}
    current = current[part]
  })
  current[parts.at(-1)] = value
}

function createPlanPage() {
  const storage = {}
  const toasts = []
  let definition

  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    showToast: options => { toasts.push(options) },
    pageScrollTo: () => {},
    showModal: () => {}
  }

  const pagePath = path.resolve(__dirname, '../pages/plan/plan.js')
  delete require.cache[pagePath]
  require(pagePath)

  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch, callback) {
      Object.entries(patch).forEach(([key, value]) => setByPath(this.data, key, value))
      if (callback) callback()
    }
  }

  return { page, storage, toasts }
}

test('template plans can be customized and later updated without duplication', () => {
  const { page, storage, toasts } = createPlanPage()
  const template = page.data.templates[2]

  page.openEditor('template', template)
  assert.equal(page.data.editorMode, 'template')
  assert.equal(page.data.customForm.name, '每日 30 分钟训练')
  assert.equal(page.data.customForm.schedule, '每周训练 5 天')

  page.saveCustomPlan()
  assert.equal(storage.herRhymePlans.length, 1)
  assert.equal(storage.herRhymePlans[0].templateId, template.id)
  const planId = storage.herRhymePlans[0].id

  page.openTemplateEditor({ currentTarget: { dataset: { id: template.id } } })
  assert.equal(page.data.editorMode, 'edit')
  assert.equal(page.data.editingPlanId, planId)

  page.setData({ 'customForm.name': '我的 30 分钟训练' })
  page.saveCustomPlan()
  assert.equal(storage.herRhymePlans.length, 1)
  assert.equal(storage.herRhymePlans[0].id, planId)
  assert.equal(storage.herRhymePlans[0].name, '我的 30 分钟训练')
  assert.equal(toasts.at(-1).title, '计划已更新')
})

