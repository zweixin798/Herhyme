App({
  globalData: {
    brand: 'Her Rhyme'
  },

  onLaunch() {
    const keys = wx.getStorageInfoSync().keys || []
    const defaults = {
      herRhymeLogs: [],
      herRhymeWeightLogs: [],
      herRhymePlans: [],
      herRhymeAgentMemories: [],
      herRhymeAgentFeedback: []
    }

    Object.keys(defaults).forEach(key => {
      if (!keys.includes(key)) wx.setStorageSync(key, defaults[key])
    })
  }
})
