
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.xiaohongshu.com/*"],
  run_at: "document_end"
}

const PLATFORM = "xiaohongshu"
const VERSION = "1.4.0"

// ===== Logger =====
function log(step: string, data?: any) {
  var msg = "[" + step + "] " + (data ? JSON.stringify(data).slice(0,200) : "")
  chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: msg }).catch(() => {})
  console.log("[" + PLATFORM + "]", step, data || "")
}

// ===== Utilities =====
function sleep(ms: number): Promise<void> {
  return new Promise(function(r) { setTimeout(r, ms) })
}

function waitForElement(selector: string, timeout = 20000): Promise<Element | null> {
  return new Promise(function(resolve) {
    var el = document.querySelector(selector)
    if (el) { resolve(el); return }
    var elapsed = 0
    var iv = setInterval(function() {
      el = document.querySelector(selector)
      if (el) { clearInterval(iv); resolve(el); return }
      elapsed += 500
      if (elapsed >= timeout) { clearInterval(iv); resolve(null) }
    }, 500)
  })
}

function waitForAnyElement(selectors: string[], timeout = 20000): Promise<Element | null> {
  return new Promise(function(resolve) {
    var elapsed = 0
    var iv = setInterval(function() {
      for (var s = 0; s < selectors.length; s++) {
        var el = document.querySelector(selectors[s])
        if (el) { clearInterval(iv); resolve(el); return }
      }
      elapsed += 500
      if (elapsed >= timeout) { clearInterval(iv); resolve(null) }
    }, 500)
  })
}

function trySelectors(selectors: string[]): Element | null {
  for (var s = 0; s < selectors.length; s++) {
    try {
      var el = document.querySelector(selectors[s])
      if (el) return el
    } catch(e) {}
  }
  return null
}

function setNativeValue(el: any, value: string): boolean {
  try {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    var setter = Object.getOwnPropertyDescriptor(proto, "value")!.set
    setter!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  } catch(e) {
    try { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); return true } catch(e2) { return false }
  }
}

function setContentEditable(el: HTMLElement, value: string): boolean {
  try {
    el.focus()
    var sel = window.getSelection()
    if (!sel) return false
    var rng = document.createRange()
    rng.selectNodeContents(el)
    sel.removeAllRanges()
    sel.addRange(rng)
    document.execCommand("insertText", false, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    return true
  } catch(e) {
    try { el.innerText = value; el.dispatchEvent(new Event("input", { bubbles: true })); return true } catch(e2) { return false }
  }
}

// ===== Video Injection =====
async function fetchVideoFromBlob(blobUrl: string, fileName: string, fileType: string): Promise<File | null> {
  try {
    var resp = await fetch(blobUrl)
    var blob = await resp.blob()
    var file = new File([blob], fileName || "video.mp4", { type: fileType || blob.type || "video/mp4" })
    log("Blob fetch OK: " + (file.size / 1024 / 1024).toFixed(1) + "MB")
    return file
  } catch(e: any) {
    log("Blob fetch failed: " + e.message)
    return null
  }
}

async function injectDataTransfer(file: File): Promise<boolean> {
  var inputs = document.querySelectorAll("input[type=file]")
  for (var i = 0; i < inputs.length; i++) {
    try {
      var dt = new DataTransfer()
      dt.items.add(file)
      Object.defineProperty(inputs[i], "files", {
        get: function() { return dt.files },
        configurable: true
      })
      ;(inputs[i] as HTMLInputElement).dispatchEvent(new Event("change", { bubbles: true }))
      ;(inputs[i] as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }))
      log("Injected via DataTransfer")
      return true
    } catch(e) {}
  }
  return false
}

// ===== Main State Machine =====
async function processPublish(data: any): Promise<boolean> {
  var taskId = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
  log("Task start", { taskId: taskId, platform: PLATFORM, version: VERSION })
  
  try {
    var tabId: number | null = null
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.id) tabId = tabs[0].id
    } catch(e) {}
    
    // === Video injection ===
    var videoInjected = false
    
    if (data.videoBlobUrl) {
      var file = await fetchVideoFromBlob(data.videoBlobUrl, data.videoName, data.videoType)
      if (file) {
        videoInjected = await injectDataTransfer(file)
      }
    }
    
    if (!videoInjected && data.videoStorageKey) {
      log("Storage fallback...")
      var storageData = await new Promise<any>(function(resolve) {
        chrome.storage.local.get([data.videoStorageKey], function(result) {
          if (chrome.runtime.lastError) { resolve(null); return }
          var d = result[data.videoStorageKey]
          chrome.storage.local.remove(data.videoStorageKey, function() {})
          resolve(d)
        })
      })
      
      if (storageData && storageData.videoDataUrl) {
        window.postMessage({
          source: "VIDEO_PUBLISHER_EXTENSION",
          action: "INJECT_VIDEO",
          platform: PLATFORM,
          data: {
            dataUrl: storageData.videoDataUrl,
            fileName: storageData.videoName || "video.mp4",
            fileType: storageData.videoType || "video/mp4"
          }
        }, window.location.origin)
        await sleep(5000)
        videoInjected = true
        if (!data.title && storageData.title) data.title = storageData.title
        if (!data.content && storageData.content) data.content = storageData.content
        if (!data.tags && storageData.tags) data.tags = storageData.tags
      }
    }
    
    log("Video injection: " + (videoInjected ? "OK" : "FAILED"))
    
    // === Wait for upload ===
    await sleep(5000)
    
    // === Build form data with #tags ===
    var descText = data.content || ""
    if (data.tags && data.tags.length > 0) {
      var tagStr = ""
      for (var t = 0; t < data.tags.length; t++) {
        tagStr += " #" + data.tags[t]
      }
      descText += (descText ? "\n" : "") + tagStr.trim()
    }
    
    // === Fill form ===
    await fillForm(data.title || "", descText)
    
    // === CDP backup ===
    if (tabId) {
      await requestCdpFillForm(tabId, data.title || "", descText)
    }
    
    // === Cleanup ===
    chrome.storage.local.remove(["publish_draft_v2"], function() {})
    
    log("Task complete", { taskId: taskId })
    return true
    
  } catch(e: any) {
    log("Task failed: " + e.message, { taskId: taskId })
    return false
  }
}


async function fillForm(title: string, descText: string): Promise<void> {
  log("Filling form...")
  var sel = ["input[placeholder*=\"\\u6807\\u9898\"]", "input[placeholder*=\"title\"]", "input:not([type=file]):not([type=hidden])"]
  if (title) { for (var s = 0; s < sel.length; s++) { var el = document.querySelector(sel[s]) as HTMLInputElement; if (el && el.type !== "file" && el.type !== "hidden") { if (setNativeValue(el, title)) { log("Title: OK"); break } } } }
  if (descText) {
    var ds = ["div[contenteditable=true]", "[contenteditable=\"true\"]", "textarea"]
    for (var s = 0; s < ds.length; s++) { var el = document.querySelector(ds[s]) as HTMLElement; if (!el) continue; if (el.getAttribute("contenteditable") === "true") { if (setContentEditable(el, descText)) { log("Description: OK"); break } } else if (el.tagName === "TEXTAREA") { if (setNativeValue(el as HTMLTextAreaElement, descText)) { log("Description: OK"); break } } }
  }
  log("Form fill complete")
}


// ===== CDP Fallback =====
async function requestCdpFillForm(tabId: number, title: string, descText: string): Promise<boolean> {
  try {
    var result = await chrome.runtime.sendMessage({
      action: "CDP_FILL_FORM",
      tabId: tabId,
      title: title,
      descText: descText
    })
    if (result && result.success) {
      log("CDP form fill: OK")
      return true
    }
    return false
  } catch(e: any) {
    return false
  }
}

// ===== Message handler =====
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action !== "FILL_FORM" || msg.platform !== PLATFORM) return
  
  processPublish(msg.data).then(function(result) {
    sendResponse({ received: true, success: result })
  }).catch(function(e) {
    log("Handler error: " + e.message)
    sendResponse({ received: true, success: false })
  })
  
  return true
})

log("Adapter ready (v" + VERSION + ")")
