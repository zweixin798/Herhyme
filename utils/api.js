// 开发者工具当前直连腾讯云 IP；真机和正式版需替换为 HTTPS 域名。
const API_BASE_URL = wx.getStorageSync('herRhymeApiBaseUrl') || 'http://124.220.63.165'

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
      success: response => response.statusCode >= 200 && response.statusCode < 300 ? resolve(response.data) : reject(new Error(response.data?.message || 'request failed')),
      fail: reject
    })
  })
}

module.exports = { API_BASE_URL, getUserId, request }
