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

// Background only handles: open tab + inject MAIN world script
// File transfer goes directly: side panel -> content script (bypasses service worker)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "OPEN_PLATFORM") {
    openPlatformTab(msg.platform)
      .then((tabId) => sendResponse({ success: true, tabId }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }
  if (msg.action === "CDP_FILL_FORM") {
    // CDP form filling from any active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        sendResponse({ success: true })
        cdpFillForm(tabs[0].id, msg.title || "", msg.descText || "").catch(function(e) {
          console.error("[BG] CDP form fill error:", e)
        })
      } else {
        sendResponse({ success: false, error: "No active tab" })
      }
    })
    return true
  }
  if (msg.action === "INJECT_MAIN") {
    var platform = msg.platform || "douyin"
    var injectFn = getInjectFunction(platform)
    injectFn(msg.tabId)
      .then((tabId) => sendResponse({ success: true, tabId }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }
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
    if (msg.action === "STATUS") {
    chrome.runtime.sendMessage({ action: "STATUS_UPDATE", platform: msg.platform, message: msg.message }).catch(() => {})
  }
})

function getInjectFunction(platform: string) {
  const map: Record<string, Function> = {
    douyin: injectDouyinMainScript,
    xiaohongshu: injectXiaohongshuMainScript,
    bilibili: injectAntiDetectionScript,
    shipinhao: injectAntiDetectionScript,
    twitter: injectAntiDetectionScript
  }
  return map[platform] || injectDouyinMainScript
}

async function openPlatformTab(platform: string) {
  const url = PLATFORM_URLS[platform]
  if (!url) throw new Error("Unknown platform: " + platform)

  const tab = await chrome.tabs.create({ url, active: false })
  await Promise.race([
    waitForTabLoad(tab.id),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Page load timeout")), 20000))
  ])
  await delay(2000)

  // Return tab info so side panel can use it
  return tab.id
}

async function injectDouyinMainScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: setupDouyinPublisher
    })
    console.log("[BG] Douyin MAIN script injected into tab " + tabId)
  } catch (e) {
    console.error("[BG] Failed to inject MAIN script:", e)
    throw e
  }
}

// This function runs in MAIN world - injected via executeScript
﻿

async function injectXiaohongshuMainScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: setupXiaohongshuPublisher
    })
    console.log("[BG] Xiaohongshu MAIN script injected into tab " + tabId)
  } catch (e) {
    console.error("[BG] Failed to inject Xiaohongshu MAIN script:", e)
    throw e
  }
}

// Universal anti-detection for all platforms
async function injectAntiDetectionScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: setupUniversalAntiDetection
    })
    return tabId
  } catch(e) {
    console.error("Inject anti-detection failed:", e)
    throw e
  }
}

function setupUniversalAntiDetection() {
  try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined } }) } catch(e) {}
  try { Object.defineProperty(navigator, "plugins", { get: function() { return [1, 2, 3, 4, 5] } }) } catch(e) {}
  try { Object.defineProperty(navigator, "languages", { get: function() { return ["zh-CN", "zh", "en"] } }) } catch(e) {}

  // Intercept fetch
  var origFetch = window.fetch.bind(window)
  window.fetch = function(input: any, init?: any) {
    var url = (typeof input === "string" ? input : (input.url || "")).toString()
    if (url.indexOf("fingerprint") >= 0 || url.indexOf("fpjs") >= 0 || url.indexOf("monitor") >= 0 ||
        url.indexOf("/shield/webprofile") >= 0 || url.indexOf("_s=") >= 0 ||
        (url.indexOf("log") >= 0 && (url.indexOf("collect") >= 0 || url.indexOf("event") >= 0 || url.indexOf("track") >= 0))) {
      return Promise.resolve(new Response(JSON.stringify({ code: 0, success: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
    }
    return origFetch(input, init)
  }

  // Intercept XHR
  var origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: any) {
    this._url = url.toString()
    return origOpen.apply(this, arguments as any)
  }
  var origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function(body?: any) {
    var url = this._url || ""
    if (url.indexOf("fingerprint") >= 0 || url.indexOf("fpjs") >= 0 || url.indexOf("monitor") >= 0 ||
        url.indexOf("/shield/webprofile") >= 0 ||
        (url.indexOf("log") >= 0 && url.indexOf("collect") >= 0)) return
    return origSend.apply(this, arguments as any)
  }

  // Intercept sendBeacon
  var origBeacon = navigator.sendBeacon.bind(navigator)
  navigator.sendBeacon = function(url: any, data?: any) {
    var urlStr = url.toString()
    if (urlStr.indexOf("monitor") >= 0 || (urlStr.indexOf("log") >= 0 && urlStr.indexOf("collect") >= 0) || urlStr.indexOf("track") >= 0) return true
    return origBeacon(url, data)
  }

  console.log("[AntiDetection] Activated for " + location.hostname)
}

function setupDouyinPublisher() { if (typeof setupShipinhaoPublisher === "function") { setupShipinhaoPublisher(); }
  if ((window as any).__dyPublisherInjected) return
  ;(window as any).__dyPublisherInjected = true

  // ===== Wait for element utility =====
  function waitForElement(selector, timeout, interval) {
    timeout = timeout || 60000
    interval = interval || 1000
    return new Promise(function(resolve) {
      var elapsed = 0
      var check = function() {
        var el = document.querySelector(selector)
        if (el) { resolve(el); return }
        var els = document.querySelectorAll(selector)
        if (els && els.length > 0) { resolve(els[0]); return }
        elapsed += interval
        if (elapsed >= timeout) { resolve(null); return }
        setTimeout(check, interval)
      }
      check()
    })
  }

  // ===== Anti-detection =====
  function setupAntiDetection() {
    try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined } }) } catch(e) {}
    try { Object.defineProperty(navigator, "plugins", { get: function() { return [1, 2, 3, 4, 5] } }) } catch(e) {}
    try { Object.defineProperty(navigator, "languages", { get: function() { return ["zh-CN", "zh", "en"] } }) } catch(e) {}
    var origFetch = window.fetch.bind(window)
    window.fetch = function(input, init) {
      var url = (typeof input === "string" ? input : (input as any).url || "").toString()
      if (url.indexOf("/shield/webprofile") >= 0 || url.indexOf("fingerprint") >= 0 || url.indexOf("fpjs") >= 0 || url.indexOf("monitor") >= 0 || url.indexOf("_s=") >= 0 || (url.indexOf("log") >= 0 && (url.indexOf("collect") >= 0 || url.indexOf("event") >= 0 || url.indexOf("track") >= 0))) {
        return Promise.resolve(new Response(JSON.stringify({ code: 0, success: true, msg: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      }
      return origFetch(input, init)
    }
    var origXHRO = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function(method, url) { this._url = url.toString(); return origXHRO.apply(this, arguments) }
    var origXHRS = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function(body) {
      var url = this._url || ""
      if (url.indexOf("/shield/webprofile") >= 0 || url.indexOf("fingerprint") >= 0 || url.indexOf("monitor") >= 0 || (url.indexOf("log") >= 0 && url.indexOf("collect") >= 0)) return
      return origXHRS.apply(this, arguments)
    }
    var origBeacon = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = function(url, data) {
      var urlStr = url.toString()
      if (urlStr.indexOf("monitor") >= 0 || (urlStr.indexOf("log") >= 0 && urlStr.indexOf("collect") >= 0) || urlStr.indexOf("track") >= 0) return true
      return origBeacon(url, data)
    }
    console.log("[Douyin] Anti-detection ready")
  }
  setupAntiDetection()

  // ===== Monkey-patch createElement for file injection =====
  var pendingVideo = null
  var pendingVerticalCover = null
  var pendingHorizontalCover = null
  var fileInputIntercepted = false

  var origCE = document.createElement.bind(document)
  ;(document as any).createElement = function(tag, opts) {
    var el = origCE(tag, opts)
    if (tag.toLowerCase() === "input") {
      var origClick = el.click.bind(el)
      el.click = function() {
        if (el.type === "file") {
          var files = []
          if (el.accept && el.accept.indexOf("video") >= 0 && pendingVideo) files.push(pendingVideo)
          // For cover inputs, only inject one cover at a time to avoid conflicts
          if (el.accept && el.accept.indexOf("image") >= 0) {
            if (pendingVerticalCover) { files.push(pendingVerticalCover); pendingVerticalCover = null }
            else if (pendingHorizontalCover) { files.push(pendingHorizontalCover); pendingHorizontalCover = null }
          }
          if (files.length > 0) {
            var dt = new DataTransfer()
            for (var i = 0; i < files.length; i++) (dt.items as any).add(files[i])
            (el as any).files = dt.files
            el.dispatchEvent(new Event("change", { bubbles: true }))
            el.dispatchEvent(new Event("input", { bubbles: true }))
            console.log("[Douyin] File injected via monkey-patch: " + files[0].name)
            fileInputIntercepted = true
            return
          }
        }
        origClick()
      }
    }
    return el
  }
  console.log("[Douyin] Monkey-patch ready")

  function log(msg) {
    console.log("[Douyin] " + msg)
  }

  // ===== Direct file injection helper =====
  function injectFileDirect(file) {
    try {
      var dt = new DataTransfer()
      dt.items.add(file)
      // Try to find any existing file input for this file type
      var allInputs = document.querySelectorAll("input[type=file]")
      for (var i = 0; i < allInputs.length; i++) {
        try {
          (allInputs[i] as HTMLInputElement).files = dt.files
          allInputs[i].dispatchEvent(new Event("change", { bubbles: true }))
          allInputs[i].dispatchEvent(new Event("input", { bubbles: true }))
          return true
        } catch(e) {}
      }
      // Create hidden input as last resort
      var inp = document.createElement("input")
      inp.type = "file"
      inp.accept = file.type.indexOf("video") >= 0 ? "video/*" : "image/*"
      inp.style.display = "none"
      document.body.appendChild(inp)
      (inp as HTMLInputElement).files = dt.files
      inp.dispatchEvent(new Event("change", { bubbles: true }))
      inp.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    } catch(e) {
      log("Direct inject failed: " + e)
      return false
    }
  }

  // ===== Slate editor =====
  function fillSlateEditor(root, text) {
    if (!root || !text) return false
    // Strategy 1: Native contenteditable insertText
    try {
      root.focus()
      root.dispatchEvent(new Event("focus", { bubbles: true }))
      var sel = window.getSelection()
      var rng = document.createRange()
      rng.selectNodeContents(root)
      sel.removeAllRanges()
      sel.addRange(rng)
      var ok = document.execCommand("insertText", false, text)
      if (ok) {
        root.dispatchEvent(new Event("input", { bubbles: true }))
        root.dispatchEvent(new Event("change", { bubbles: true }))
        return true
      }
    } catch(e) {}

    // Strategy 2: Build Slate DOM structure via createElement
    try {
      root.focus()
      while (root.firstChild) root.removeChild(root.firstChild)
      var lines = text.split("\n")
      for (var l = 0; l < lines.length; l++) {
        var aceLine = document.createElement("div")
        aceLine.className = "ace-line"
        aceLine.setAttribute("data-node", "true")
        var wrapper = document.createElement("div")
        wrapper.setAttribute("data-line-wrapper", "true")
        wrapper.setAttribute("dir", "auto")
        var leaf = document.createElement("span")
        leaf.setAttribute("data-leaf", "true")
        var textSpan = document.createElement("span")
        textSpan.setAttribute("data-string", "true")
        textSpan.textContent = lines[l] || "\u200B"
        leaf.appendChild(textSpan)
        wrapper.appendChild(leaf)
        aceLine.appendChild(wrapper)
        root.appendChild(aceLine)
      }
      root.dispatchEvent(new Event("input", { bubbles: true }))
      root.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    } catch(e) {}

    // Strategy 3: Find inner span and set textContent
    try {
      root.focus()
      var innerSpan = root.querySelector("span[data-string=true]")
      if (innerSpan) {
        innerSpan.textContent = text
        root.dispatchEvent(new Event("input", { bubbles: true }))
        root.dispatchEvent(new Event("change", { bubbles: true }))
        return true
      }
    } catch(e) {}

    return false
  }

  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  }

  function fillDescriptionSlate(desc) {
    if (!desc) return false

    // Primary: Find directly by data-slate-editor + data-placeholder
    var editor = document.querySelector("[data-slate-editor=true][data-placeholder=\"\u6dfb\u52a0\u4f5c\u54c1\u7b80\u4ecb\"]")
    if (editor) { return fillSlateEditor(editor, desc) }

    // Second: Check container classes - container itself may BE the editor
    var containers = document.querySelectorAll("div.editor-kit-editor-container.old, div.editor-kit-container, [class*=editor-kit]")
    for (var i = 0; i < containers.length; i++) {
      var slateEditor = containers[i].querySelector("[data-slate-editor=true]")
      if (!slateEditor && containers[i].getAttribute("data-slate-editor") === "true") {
        slateEditor = containers[i]
      }
      if (slateEditor) {
        var ph = slateEditor.getAttribute("data-placeholder") || ""
        if (ph.indexOf("\u6dfb\u52a0\u4f5c\u54c1\u7b80\u4ecb") >= 0) {
          return fillSlateEditor(slateEditor, desc)
        }
        // If slateEditor itself is contenteditable, fill anyway
        if (slateEditor.getAttribute("contenteditable") === "true") {
          return fillSlateEditor(slateEditor, desc)
        }
        // Check contenteditable children
        var ce = slateEditor.querySelector("[contenteditable=true]")
        if (ce) { return fillSlateEditor(ce, desc) }
      }
    }

    // Fallback: find any contenteditable with matching placeholder
    var allCE = document.querySelectorAll("[contenteditable=true]")
    for (var i = 0; i < allCE.length; i++) {
      var ph = allCE[i].getAttribute("data-placeholder") || ""
      if (ph.indexOf("\u6dfb\u52a0\u4f5c\u54c1\u7b80\u4ecb") >= 0) {
        return fillSlateEditor(allCE[i], desc)
      }
    }

    return false
  }

  function fillTitle(title) {
    var inputs = document.querySelectorAll("input")
    for (var i = 0; i < inputs.length; i++) {
      var p = (inputs[i].placeholder || "").toLowerCase()
      if (p.indexOf("\u6807\u9898") >= 0 || p.indexOf("title") >= 0) {
        var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        set.call(inputs[i], title)
        inputs[i].dispatchEvent(new Event("input", { bubbles: true }))
        inputs[i].dispatchEvent(new Event("change", { bubbles: true }))
        return true
      }
    }
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].type === "text" || inputs[i].type === "search") {
        try {
          var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
          set.call(inputs[i], title)
          inputs[i].dispatchEvent(new Event("input", { bubbles: true }))
          return true
        } catch(e) {}
      }
    }
    return false
  }
  // ===== Message handler =====
  window.addEventListener("message", async function(ev) {
    if (!ev.data || ev.data.source !== "VIDEO_PUBLISHER_EXTENSION") return

        // Handle cover file injection - skipped (user uploads manually)
// Handle form text filling
    if (ev.data.action !== "FILL_FORM_TEXT" || ev.data.platform !== "douyin") return
    var data = ev.data.data
    log("Received form data")

    if (data.title) fillTitle(data.title)

    var descText = data.content || ""
    var tagList = data.tags || []
    if (tagList.length > 0) {
      var tagStr = tagList.map(function(t) { return "#" + t + " " }).join("")
      descText = descText ? (descText + " " + tagStr) : tagStr
    }
    if (descText) {
      var result = fillDescriptionSlate(descText)
      log("Description fill result: " + result)
    }

    log("Form filled")
  })

  log("Publisher ready")
}

function setupXiaohongshuPublisher() {
  if ((window as any).__xhsPublisherInjected) return
  ;(window as any).__xhsPublisherInjected = true

  function log(msg: string) {
    console.log("[XHS-MAIN] " + msg)
  }

  // ===== Anti-detection (reference s1-main) =====
  function setupAntiDetection() {
    try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined } }) } catch(e) {}

    // Mask function toString to look native
    function maskNative(fn: any, name: string) {
      var fnStr = "function " + name + "() { [native code] }"
      fn.toString = function() { return fnStr }
      fn.toString.toString = function() { return "function toString() { [native code] }" }
    }

    // Intercept fetch for /shield/webprofile
    var origFetch = window.fetch.bind(window)
    window.fetch = function(input: any, init?: any) {
      var url = (typeof input === "string" ? input : (input as any).url || input.toString()).toString()
      if (url.indexOf("/shield/webprofile") >= 0 || url.indexOf("fingerprint") >= 0 || url.indexOf("fpjs") >= 0 || url.indexOf("monitor") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({ code: 0, success: true, msg: "ok", data: { st: new Date().getTime() } }), {
          status: 200, headers: { "Content-Type": "application/json" }
        }))
      }
      return origFetch(input, init)
    }
    maskNative(window.fetch, "fetch")

    // Intercept XHR for /shield/webprofile
    var origOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function(method: string, url: any) {
      this._url = url.toString()
      return origOpen.apply(this, arguments as any)
    }
    maskNative(XMLHttpRequest.prototype.open, "open")

    var origSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function(body?: any) {
      var url = (this as any)._url || ""
      if (url.indexOf("/shield/webprofile") >= 0 || url.indexOf("fingerprint") >= 0 || url.indexOf("monitor") >= 0) {
        // Return fake success response
        var self = this
        Object.defineProperty(self, "status", { get: function() { return 200 } })
        Object.defineProperty(self, "readyState", { get: function() { return 4 } })
        Object.defineProperty(self, "responseText", { get: function() { return JSON.stringify({ code: 0, success: true, msg: "ok" }) } })
        Object.defineProperty(self, "response", { get: function() { return JSON.stringify({ code: 0, success: true, msg: "ok" }) } })
        setTimeout(function() {
          self.dispatchEvent(new Event("readystatechange"))
          self.dispatchEvent(new Event("load"))
          self.dispatchEvent(new Event("loadend"))
        }, 100)
        return
      }
      return origSend.apply(this, arguments as any)
    }
    maskNative(XMLHttpRequest.prototype.send, "send")

    // Intercept sendBeacon
    var origBeacon = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = function(url: any, data?: any) {
      var urlStr = url.toString()
      if (urlStr.indexOf("/shield/webprofile") >= 0 || urlStr.indexOf("monitor") >= 0) return true
      return origBeacon(url, data)
    }

    log("Anti-detection ready")
  }
  setupAntiDetection()

  // ===== Text filling =====
  function fillTitle(title: string): boolean {
    if (!title) return false
    var inputs = document.querySelectorAll("input[type=text]")
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i] as HTMLInputElement
      if (inp.placeholder && (inp.placeholder.indexOf("标题") >= 0 || inp.placeholder.indexOf("title") >= 0)) {
        try {
          var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
          setter!.call(inp, title)
          inp.dispatchEvent(new Event("input", { bubbles: true }))
          inp.dispatchEvent(new Event("change", { bubbles: true }))
          log("Title filled")
          return true
        } catch(e) {}
      }
    }
    // Fallback: any text input
    if (inputs.length > 0) {
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
        setter!.call(inputs[0], title)
        inputs[0].dispatchEvent(new Event("input", { bubbles: true }))
        log("Title filled (fallback)")
        return true
      } catch(e) {}
    }
    return false
  }

  function fillDescriptionTags(content: string, tags: string[]): boolean {
    var text = content || ""
    if (tags && tags.length > 0) {
      var tagStr = tags.map(function(t: string) { return "#" + t + " " }).join("")
      text = text ? (text + " " + tagStr) : tagStr
    }
    if (!text) return false

    // Use ClipboardEvent paste (best for React editors)
    var editors = document.querySelectorAll("div[contenteditable=true]")
    for (var i = 0; i < editors.length; i++) {
      var ed = editors[i] as HTMLElement
      ed.focus()

      try {
        var dt = new DataTransfer()
        dt.setData("text/plain", text)
        var event = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        })
        ed.dispatchEvent(event)
        ed.dispatchEvent(new Event("input", { bubbles: true }))
        ed.dispatchEvent(new Event("change", { bubbles: true }))
        log("Description pasted via ClipboardEvent")
        return true
      } catch(e) { log("ClipboardEvent failed: " + (e as any).message) }
    }

    // Fallback: execCommand insertText
    try {
      var ed = document.querySelector("div[contenteditable=true]") as HTMLElement
      if (ed) {
        ed.focus()
        var sel = window.getSelection()
        var rng = document.createRange()
        rng.selectNodeContents(ed)
        sel.removeAllRanges()
        sel.addRange(rng)
        document.execCommand("insertText", false, text)
        ed.dispatchEvent(new Event("input", { bubbles: true }))
        log("Description filled via execCommand")
        return true
      }
    } catch(e) {}

    return false
  }

  // ===== Message handler =====
  window.addEventListener("message", function(ev) {
    if (!ev.data || ev.data.source !== "VIDEO_PUBLISHER_EXTENSION") return
    if (ev.data.action !== "FILL_FORM_TEXT" || ev.data.platform !== "xiaohongshu") return

    var data = ev.data.data
    log("Received form data")

    if (data.title) fillTitle(data.title)

    var result = fillDescriptionTags(data.content || "", data.tags || [])
    log("Description fill result: " + result)

    log("Form filled")
  })

  log("Publisher ready")
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    var handler = function(tabIdNum: number, info: any) {
      if (tabIdNum === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(handler)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(handler)
  })
}



// ===== CDP (Chrome DevTools Protocol) Engine =====
// Most stable approach - runs code directly in page context

async function cdpFillForm(tabId: number, title: string, descText: string): Promise<{success: boolean, error?: string}> {
  try {
    await attachDebugger(tabId)
    
    var safeTitle = JSON.stringify(title || "")
    var safeDesc = JSON.stringify(descText || "")
    
    // Shipinhao needs special Wujie-aware handling
    var isShipinhao = false
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.url?.indexOf("channels.weixin.qq.com") >= 0) isShipinhao = true
    } catch(e) {}
    
    var expr = ""
    if (isShipinhao) {
      expr = "(function(){var roots=[document];var app=document.querySelector('wujie-app');if(app&&app.shadowRoot){roots.push(app.shadowRoot);var iframe=app.shadowRoot.querySelector('iframe');if(iframe&&iframe.contentDocument)roots.push(iframe.contentDocument)}for(var r=0;r<roots.length;r++){var root=roots[r];" +
        "if(" + safeTitle + "){var inputs=root.querySelectorAll('input');for(var i=0;i<inputs.length;i++){var inp=inputs[i];" +
        "if(inp.type!=='file'&&inp.type!=='hidden'){var ph=(inp.placeholder||'').toLowerCase();" +
        "if(ph.indexOf('\\u6807\\u9898')>=0||ph.indexOf('title')>=0||ph.indexOf('\\u6982\\u62ec')>=0){" +
        "try{var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(inp," + safeTitle + ");inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){inp.value=" + safeTitle + ";inp.dispatchEvent(new Event('input',{bubbles:true}))}" +
        "break}}}}" +
        "if(" + safeDesc + "){var eds=root.querySelectorAll('[contenteditable=true]');for(var i=0;i<eds.length;i++){try{eds[i].focus();var sel=window.getSelection();var rng=document.createRange();rng.selectNodeContents(eds[i]);sel.removeAllRanges();sel.addRange(rng);document.execCommand('insertText',false," + safeDesc + ");eds[i].dispatchEvent(new Event('input',{bubbles:true}));break}catch(e){}}}}" +
        "}})()"
    } else {
      expr = "(function(){" +
        "if(" + safeTitle + "){" +
        "var inputs=document.querySelectorAll('input');" +
        "for(var i=0;i<inputs.length;i++){" +
        "var inp=inputs[i];if(inp.type!=='file'&&inp.type!=='hidden'){" +
        "try{var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(inp," + safeTitle + ");inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));break}" +
        "catch(e){try{inp.value=" + safeTitle + ";inp.dispatchEvent(new Event('input',{bubbles:true}));break}catch(e2){}}}" +
        "}}" +
        "if(" + safeDesc + "){" +
        "var eds=document.querySelectorAll('[contenteditable=true]');" +
        "for(var i=0;i<eds.length;i++){" +
        "try{eds[i].focus();var sel=window.getSelection();var rng=document.createRange();rng.selectNodeContents(eds[i]);sel.removeAllRanges();sel.addRange(rng);document.execCommand('insertText',false," + safeDesc + ");eds[i].dispatchEvent(new Event('input',{bubbles:true}));break}" +
        "catch(e){}}}" +
        "}})()"
    }
    
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: expr,
      awaitPromise: false
    })
    
    await detachDebugger(tabId)
    return { success: true }
  } catch(e: any) {
    await detachDebugger(tabId)
    return { success: false, error: e.message }
  }
}

async function attachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve()
    })
  })
}

function detachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    try { chrome.debugger.detach({ tabId }, () => resolve()) } catch(e) { resolve() }
  })
}

function cdpSend(tabId: number, method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(res)
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ===== CDP (Chrome DevTools Protocol) - Stable approach =====
// Runs code directly in page context, bypasses all frameworks

async function cdpInjectVideo(tabId: number, tabUrl: string, fileName: string): Promise<{success: boolean, error?: string}> {
  try {
    await attachDebugger(tabId)
    
    // Create a script that creates a blob URL from the data URL
    // We need to get the video data into the page context
    // Strategy: Inject a script that creates a file input and waits for data
    
    // Use Runtime.evaluate to inject a page-context script that listens for custom events
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `
        window.__cdpVideoData = null;
        window.__cdpVideoReady = false;
      `,
      awaitPromise: false
    })
    
    await detachDebugger(tabId)
    return { success: true }
  } catch(e: any) {
    await detachDebugger(tabId)
    return { success: false, error: e.message }
  }
}

async function cdpFillForm(tabId: number, title: string, descText: string): Promise<{success: boolean, error?: string}> {
  try {
    await attachDebugger(tabId)
    
    var safeTitle = JSON.stringify(title || "")
    var safeDesc = JSON.stringify(descText || "")
    
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        // Fill title
        if (${safeTitle}) {
          var inputs = document.querySelectorAll("input");
          for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp.type !== "file" && inp.type !== "hidden") {
              try {
                var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
                setter.call(inp, ${safeTitle});
                inp.dispatchEvent(new Event("input", {bubbles: true}));
                inp.dispatchEvent(new Event("change", {bubbles: true}));
                break;
              } catch(e) {
                try { inp.value = ${safeTitle}; inp.dispatchEvent(new Event("input", {bubbles: true})); break; } catch(e2) {}
              }
            }
          }
        }
        // Fill description
        if (${safeDesc}) {
          var eds = document.querySelectorAll("[contenteditable=true]");
          for (var i = 0; i < eds.length; i++) {
            try {
              eds[i].focus();
              var sel = window.getSelection();
              var rng = document.createRange();
              rng.selectNodeContents(eds[i]);
              sel.removeAllRanges();
              sel.addRange(rng);
              document.execCommand("insertText", false, ${safeDesc});
              eds[i].dispatchEvent(new Event("input", {bubbles: true}));
              break;
            } catch(e) {}
          }
        }
      })()`,
      awaitPromise: false
    })
    
    await detachDebugger(tabId)
    return { success: true }
  } catch(e: any) {
    await detachDebugger(tabId)
    return { success: false, error: e.message }
  }
}

// Helper: Attach debugger
function attachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve()
    })
  })
}

// Helper: Detach debugger
function detachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    try { chrome.debugger.detach({ tabId }, () => resolve()) } catch(e) { resolve() }
  })
}

// Helper: Send CDP command
function cdpSend(tabId: number, method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(res)
    })
  })
}
