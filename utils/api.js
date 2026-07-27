// 本地调试时仍可通过 Storage 覆盖默认接口地址。
const API_BASE_URL = wx.getStorageSync('herRhymeApiBaseUrl') || 'https://api.herhyme.site'

function getUserId() {
  let id = wx.getStorageSync('herRhymeUserId')
  if (!id) {
    id = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
    wx.setStorageSync('herRhymeUserId', id)
  }
  return id
}

function request(path, method = 'GET', data = {}) {
  if (!API_BASE_URL) return Promise.reject(new Error('remote api is not configured'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: { 'X-User-Id': getUserId(), 'content-type': 'application/json' },
      success: response => {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data)
        const payload = response.data || {}
        const error = new Error(payload.error?.message || payload.message || 'request failed')
        error.code = payload.error?.code || 'request_failed'
        error.statusCode = response.statusCode
        reject(error)
      },
      fail: reject
    })
  })
}

module.exports = { API_BASE_URL, getUserId, request }
