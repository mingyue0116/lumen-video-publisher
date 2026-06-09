// ===== Video Publisher v2.0.0 - Background Service Worker =====

const VERSION = "2.0.0"

const PLATFORM_URLS: Record<string, string> = {
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
  xiaohongshu: "https://creator.xiaohongshu.com/publish/publish?from=menu&target=video",
  bilibili: "https://member.bilibili.com/platform/upload/video/frame",
  shipinhao: "https://channels.weixin.qq.com/platform/post/create",
  twitter: "https://x.com/compose/post"
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id })
})

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// ===== Message Router =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Open a platform page
  if (msg.action === "OPEN_PLATFORM") {
    openPlatformTab(msg.platform)
      .then((tab) => sendResponse({ success: true, tabId: tab.id }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

  // Forward FILL_FORM to the content script in the target tab
  if (msg.action === "SEND_FILL_FORM") {
    if (!msg.tabId) {
      sendResponse({ success: false, error: "No tabId" })
      return true
    }
    chrome.tabs.sendMessage(msg.tabId, {
      action: "FILL_FORM",
      platform: msg.platform,
      data: msg.data
    }).then((resp) => {
      sendResponse(resp || { success: false, error: "No response" })
    }).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
    return true
  }

  // CDP form fill - bypass frameworks
  if (msg.action === "CDP_FILL_FORM") {
    if (!msg.tabId) {
      sendResponse({ success: false, error: "No tabId" })
      return true
    }
    cdpFillForm(msg.tabId, msg.title || "", msg.descText || "")
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  // Inject MAIN world script for platforms that need it
  if (msg.action === "INJECT_MAIN") {
    injectMainScript(msg.tabId, msg.platform || "douyin")
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

  // Relay STATUS messages from content scripts to side panel
  if (msg.action === "STATUS") {
    chrome.runtime.sendMessage({
      action: "STATUS_UPDATE",
      platform: msg.platform,
      message: msg.message
    }).catch(() => {})
  }
})

// ===== Open Platform Tab =====
async function openPlatformTab(platform: string) {
  var url = PLATFORM_URLS[platform]
  if (!url) throw new Error("Unknown platform: " + platform)

  var tab = await chrome.tabs.create({ url: url, active: false })
  await waitForTabLoad(tab.id)
  await delay(2000)

  // Inject MAIN world script
  injectMainScript(tab.id, platform).catch((e) => {
    console.log("[BG] Inject MAIN: " + e.message)
  })

  return tab
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new Error("Tab load timeout"))
    }, 30000)

    function listener(tabId2: number, info: any) {
      if (tabId2 === tabId && info.status === "complete") {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(function(r) { setTimeout(r, ms) })
}

// ===== MAIN World Script Injection =====
async function injectMainScript(tabId: number, platform: string) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: getMainWorldScript(platform)
    })
    console.log("[BG] MAIN injected for " + platform)
  } catch(e: any) {
    console.log("[BG] Inject MAIN failed: " + e.message)
  }
}

function getMainWorldScript(platform: string): () => void {
  // Generic anti-detection + video listener for all platforms
  return function() {
    try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined } }) } catch(e) {}
    try { Object.defineProperty(navigator, "plugins", { get: function() { return [1, 2, 3, 4, 5] } }) } catch(e) {}
    try { Object.defineProperty(navigator, "languages", { get: function() { return ["zh-CN", "zh", "en"] } }) } catch(e) {}

    // Listen for INJECT_VIDEO from content script
    window.addEventListener("message", function(ev) {
      if (ev.data && ev.data.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data.action === "INJECT_VIDEO") {
        var data = ev.data.data
        if (!data || !data.dataUrl) return

        fetch(data.dataUrl)
          .then(function(r) { return r.blob() })
          .then(function(blob) {
            var file = new File([blob], data.fileName || "video.mp4", { type: data.fileType || blob.type || "video/mp4" })
            var dt = new DataTransfer()
            dt.items.add(file)

            var inputs = document.querySelectorAll("input[type=file]")
            for (var i = 0; i < inputs.length; i++) {
              try {
                Object.defineProperty(inputs[i], "files", {
                  get: function() { return dt.files },
                  configurable: true
                })
                inputs[i].dispatchEvent(new Event("change", { bubbles: true }))
                inputs[i].dispatchEvent(new Event("input", { bubbles: true }))
              } catch(e) {}
            }

            window.postMessage({
              source: "VIDEO_PUBLISHER_EXTENSION",
              action: "INJECT_VIDEO_RESULT",
              success: true
            }, window.location.origin)
          })
          .catch(function(e) {
            window.postMessage({
              source: "VIDEO_PUBLISHER_EXTENSION",
              action: "INJECT_VIDEO_RESULT",
              success: false,
              error: e.message
            }, window.location.origin)
          })
      }
    })
  }
}

// ===== CDP Form Fill (fallback) =====
async function cdpFillForm(tabId: number, title: string, descText: string): Promise<{success: boolean, error?: string}> {
  try {
    await attachDebugger(tabId)
    var safeTitle = JSON.stringify(title || "")
    var safeDesc = JSON.stringify(descText || "")

    await cdpSend(tabId, "Runtime.evaluate", {
      expression: "(function() {" +
        "if (" + safeTitle + ") {" +
        "  var inputs = document.querySelectorAll(\"input\");" +
        "  for (var i = 0; i < inputs.length; i++) {" +
        "    var inp = inputs[i];" +
        "    if (inp.type !== 'file' && inp.type !== 'hidden') {" +
        "      try {" +
        "        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;" +
        "        setter.call(inp, " + safeTitle + ");" +
        "        inp.dispatchEvent(new Event('input', {bubbles: true}));" +
        "        inp.dispatchEvent(new Event('change', {bubbles: true}));" +
        "        break;" +
        "      } catch(e) {}" +
        "    }" +
        "  }" +
        "}" +
        "if (" + safeDesc + ") {" +
        "  var eds = document.querySelectorAll('[contenteditable=true]');" +
        "  for (var i = 0; i < eds.length; i++) {" +
        "    try {" +
        "      eds[i].focus();" +
        "      var sel = window.getSelection();" +
        "      var rng = document.createRange();" +
        "      rng.selectNodeContents(eds[i]);" +
        "      sel.removeAllRanges();" +
        "      sel.addRange(rng);" +
        "      document.execCommand('insertText', false, " + safeDesc + ");" +
        "      eds[i].dispatchEvent(new Event('input', {bubbles: true}));" +
        "      break;" +
        "    } catch(e) {}" +
        "  }" +
        "}" +
      "})()",
      awaitPromise: false
    })

    await detachDebugger(tabId)
    return { success: true }
  } catch(e: any) {
    await detachDebugger(tabId).catch(function() {})
    return { success: false, error: e.message }
  }
}

function attachDebugger(tabId: number): Promise<void> {
  return new Promise(function(resolve, reject) {
    chrome.debugger.attach({ tabId: tabId }, "1.3", function() {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve()
    })
  })
}

function detachDebugger(tabId: number): Promise<void> {
  return new Promise(function(resolve) {
    try { chrome.debugger.detach({ tabId: tabId }, function() { resolve() }) } catch(e) { resolve() }
  })
}

function cdpSend(tabId: number, method: string, params: any): Promise<any> {
  return new Promise(function(resolve, reject) {
    chrome.debugger.sendCommand({ tabId: tabId }, method, params, function(res) {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(res)
    })
  })
}
