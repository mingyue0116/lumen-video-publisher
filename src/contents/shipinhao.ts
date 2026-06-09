import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://channels.weixin.qq.com/*"],
  run_at: "document_end"
}

const PLATFORM = "shipinhao"
const VERSION = "2.0.0"

// ===== Inline Shared Utilities =====
const EXT_VERSION = "2.0.0"

function logInfo(step: string, data?: any) {
  var msg = "[INFO] " + step + (data ? " " + JSON.stringify(data).slice(0,300) : "")
  chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: msg }).catch(() => {})
  console.log("[" + PLATFORM + "] [INFO]", step, data || "")
}
function logOk(step: string, data?: any) {
  var msg = "[OK] " + step + (data ? " " + JSON.stringify(data).slice(0,300) : "")
  chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: msg }).catch(() => {})
  console.log("[" + PLATFORM + "] [OK]", step, data || "")
}
function logFail(step: string, data?: any) {
  var msg = "[FAIL] " + step + (data ? " " + JSON.stringify(data).slice(0,300) : "")
  chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: msg }).catch(() => {})
  console.log("[" + PLATFORM + "] [FAIL]", step, data || "")
}

function sleep(ms: number): Promise<void> {
  return new Promise(function(r) { setTimeout(r, ms) })
}

function waitForElement(selector: string, timeout = 25000): Promise<Element | null> {
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

function trySelectors(selectors: string[]): Element | null {
  for (var s = 0; s < selectors.length; s++) {
    try { var el = document.querySelector(selectors[s]); if (el) return el } catch(e) {}
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
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  } catch(e) {
    try { el.innerText = value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true } catch(e2) { return false }
  }
}

function normalizeTags(tags: string[]): string[] {
  var result: string[] = []
  for (var t = 0; t < tags.length; t++) {
    var tag = tags[t].trim()
    if (!tag) continue
    if (tag.indexOf("#") !== 0) tag = "#" + tag
    result.push(tag)
  }
  return result
}

interface FillFormResult {
  title: boolean; desc: boolean; tags: boolean
  titleDetail: string; descDetail: string; tagsDetail: string
}
interface PublishStep { name: string; success: boolean; detail: string }
interface PublishResult { success: boolean; steps: PublishStep[] }

// ===== Wujie Micro-Frontend Support =====
// 视频号 uses wujie micro-frontend, elements are inside shadow DOM or iframe
function getWujieDocument(): Document | ShadowRoot | null {
  try {
    // Method 1: wujie-app shadowRoot
    var app = document.querySelector("wujie-app")
    if (app) {
      var shadowRoot = (app as any).shadowRoot
      if (shadowRoot) {
        // Check if it has an iframe (wujie render mode)
        var iframe = shadowRoot.querySelector("iframe")
        if (iframe && (iframe as any).contentDocument) {
          logInfo("Using wujie iframe document")
          return (iframe as any).contentDocument
        }
        // Direct shadow DOM mode
        logInfo("Using wujie shadow DOM")
        return shadowRoot
      }
    }
    
    // Method 2: Find iframe directly
    var iframes = document.querySelectorAll("iframe")
    for (var i = 0; i < iframes.length; i++) {
      try {
        var doc = iframes[i].contentDocument || iframes[i].contentWindow?.document
        if (doc && doc.body && doc.body.querySelector("input, textarea, [contenteditable=true]")) {
          logInfo("Using iframe document: " + i)
          return doc
        }
      } catch(e) {}
    }
  } catch(e: any) {
    logFail("Wujie detection: " + e.message)
  }
  return null
}

function wq(selector: string): Element | null {
  // Try wujie root first, then main document
  var wujieDoc = getWujieDocument()
  if (wujieDoc) {
    try {
      var el = wujieDoc.querySelector(selector)
      if (el) return el
    } catch(e) {}
  }
  return document.querySelector(selector)
}

function wqAll(selector: string): NodeListOf<Element> | Element[] {
  var wujieDoc = getWujieDocument()
  if (wujieDoc) {
    try {
      var list = wujieDoc.querySelectorAll(selector)
      if (list.length > 0) return list
    } catch(e) {}
  }
  return document.querySelectorAll(selector)
}

// ===== Video Injection (with wujie support) =====
async function loadVideoFromStorage(storageKey: string): Promise<string | null> {
  try {
    var data = await new Promise<any>(function(resolve) {
      chrome.storage.local.get([storageKey], function(result) {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(result[storageKey] || null)
      })
    })
    if (!data || !data.dataUrl) { logFail("No video data in storage"); return null }
    logInfo("Video loaded: " + ((data.dataUrl.length) / 1024 / 1024).toFixed(1) + "MB")
    return data.dataUrl
  } catch(e: any) { logFail("Load video: " + e.message); return null }
}

async function injectVideoToInput(fileInput: HTMLInputElement, dataUrl: string, fileName: string): Promise<boolean> {
  try {
    var resp = await fetch(dataUrl)
    var blob = await resp.blob()
    var file = new File([blob], fileName || "video.mp4", { type: blob.type || "video/mp4" })
    logInfo("File: " + (file.size / 1024 / 1024).toFixed(1) + "MB")
    var dt = new DataTransfer()
    dt.items.add(file)
    Object.defineProperty(fileInput, "files", {
      get: function() { return dt.files },
      configurable: true
    })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(200)
    fileInput.dispatchEvent(new Event("input", { bubbles: true }))
    await sleep(200)
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    logOk("Video injected")
    return true
  } catch(e: any) { logFail("Inject video: " + e.message); return false }
}

async function findAndInjectVideo(dataUrl: string, fileName: string): Promise<boolean> {
  // Try wujie context first
  var wujieDoc = getWujieDocument()
  if (wujieDoc) {
    var fileInput = wujieDoc.querySelector("input[type=file]") as HTMLInputElement | null
    if (fileInput) {
      logInfo("Found file input in wujie")
      return await injectVideoToInput(fileInput, dataUrl, fileName)
    }
  }
  // Fallback: main document
  var fileInput = document.querySelector("input[type=file]") as HTMLInputElement | null
  if (!fileInput) { logFail("No file input found"); return false }
  logInfo("File input found in main document")
  return await injectVideoToInput(fileInput, dataUrl, fileName)
}

// ===== Shipinhao upload wait =====
async function waitForUploadComplete(timeout = 120000): Promise<boolean> {
  logInfo("Waiting for shipinhao upload...")
  try {
    await new Promise<void>(function(resolve, reject) {
      var start = Date.now()
      var iv = setInterval(function() {
        var selectors = ["video", "video[src]", "[class*=upload-success]", "[class*=video-preview]"]
        var wujieDoc = getWujieDocument()
        for (var s = 0; s < selectors.length; s++) {
          if (wujieDoc && wujieDoc.querySelector(selectors[s])) {
            clearInterval(iv); logOk("Upload complete"); resolve(); return
          }
          if (document.querySelector(selectors[s])) {
            clearInterval(iv); logOk("Upload complete"); resolve(); return
          }
        }
        if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error("Timeout")) }
      }, 1000)
    })
    await sleep(2000)
    return true
  } catch(e: any) { logFail("Upload timeout/error"); return false }
}

// ===== Shipinhao Form Fill (Wujie-aware) =====
async function fillForm(title: string, descText: string, tags: string[]): Promise<FillFormResult> {
  var result: FillFormResult = { title: false, desc: false, tags: false, titleDetail: "", descDetail: "", tagsDetail: "" }
  logInfo("Filling shipinhao form (Wujie)...")

  if (title) {
    var inputs = wqAll("input")
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i] as HTMLInputElement
      if (inp.type === "file" || inp.type === "hidden") continue
      var ph = (inp.placeholder || "").toLowerCase()
      if (ph.indexOf("title") >= 0 || ph.indexOf("\u6807\u9898") >= 0 || ph.indexOf("\u6982\u62ec") >= 0 || ph.indexOf("\u89c6\u9891") >= 0) {
        if (setNativeValue(inp, title)) {
          result.title = true; result.titleDetail = "OK"; logOk("Title: OK"); break
        }
      }
    }
    // Fallback: any text input
    if (!result.title) {
      for (var i2 = 0; i2 < inputs.length; i2++) {
        var inp2 = inputs[i2] as HTMLInputElement
        if (inp2.type !== "file" && inp2.type !== "hidden") {
          if (setNativeValue(inp2, title)) {
            result.title = true; result.titleDetail = "OK (fallback)"; logOk("Title: OK (fallback)"); break
          }
        }
      }
    }
    if (!result.title) { result.titleDetail = "Not found"; logFail("Title: not found") }
  } else { result.title = true; result.titleDetail = "Skipped" }

  if (descText) {
    var editors = wqAll("div[contenteditable=true]")
    for (var i = 0; i < editors.length; i++) {
      if (setContentEditable(editors[i] as HTMLElement, descText)) {
        result.desc = true; result.descDetail = "OK"; logOk("Description: OK"); break
      }
    }
    if (!result.desc) {
      var textareas = wqAll("textarea")
      for (var i2 = 0; i2 < textareas.length; i2++) {
        if (setNativeValue(textareas[i2] as HTMLTextAreaElement, descText)) {
          result.desc = true; result.descDetail = "OK (textarea)"; logOk("Description: OK (textarea)"); break
        }
      }
    }
    if (!result.desc) { result.descDetail = "Not found"; logFail("Description: not found") }
  } else { result.desc = true; result.descDetail = "Skipped" }

  if (tags && tags.length > 0) {
    var normalized = normalizeTags(tags)
    var tagStr = normalized.join(" ")
    var tagInputs = wqAll("input[placeholder*=\"#\"], input[placeholder*=\"\u8bdd\u9898\"]")
    var tagSet = false
    for (var i = 0; i < tagInputs.length; i++) {
      if (setNativeValue(tagInputs[i] as HTMLInputElement, tagStr)) {
        (tagInputs[i] as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        await sleep(200)
        result.tags = true; result.tagsDetail = "OK"; logOk("Tags: OK"); tagSet = true; break
      }
    }
    if (!tagSet && result.desc) {
      var editors2 = wqAll("div[contenteditable=true]")
      for (var i2 = 0; i2 < editors2.length; i2++) {
        var currentText = (editors2[i2] as HTMLElement).innerText
        if (currentText) {
          if (setContentEditable(editors2[i2] as HTMLElement, currentText + "\n" + tagStr)) {
            result.tags = true; result.tagsDetail = "Appended to desc"; logOk("Tags: appended"); tagSet = true; break
          }
        }
      }
    }
    if (!result.tags) { result.tagsDetail = "Not filled"; logFail("Tags: not filled") }
  } else { result.tags = true; result.tagsDetail = "Skipped" }

  logInfo("Form fill result: " + JSON.stringify(result))
  return result
}

// ===== Main State Machine =====
async function processPublish(data: any): Promise<PublishResult> {
  var steps: PublishStep[] = []
  logInfo("Task start", { platform: PLATFORM, version: VERSION })

  steps.push({ name: "Load video", success: false, detail: "" })
  var dataUrl: string | null = null
  if (data.videoStorageKey) { dataUrl = await loadVideoFromStorage(data.videoStorageKey) }
  steps[0].success = !!dataUrl; steps[0].detail = dataUrl ? "Loaded" : "Failed"

  steps.push({ name: "Inject video", success: false, detail: "" })
  var videoOk = false
  if (dataUrl) { videoOk = await findAndInjectVideo(dataUrl, data.videoName || "video.mp4") }
  steps[1].success = videoOk; steps[1].detail = videoOk ? "OK" : "Failed"

  steps.push({ name: "Wait for upload", success: false, detail: "" })
  if (videoOk) { var uploadOk = await waitForUploadComplete(); steps[2].success = uploadOk; steps[2].detail = uploadOk ? "OK" : "Timeout" }
  else { steps[2].detail = "Skipped" }

  var descText = data.content || ""
  var tagList: string[] = data.tags || []
  var normalizedTags = normalizeTags(tagList)
  if (normalizedTags.length > 0 && !descText) { descText = normalizedTags.join(" ") }

  steps.push({ name: "Fill form", success: false, detail: "" })
  var formResult = await fillForm(data.title || "", descText, tagList)
  steps[3].success = formResult.title && formResult.desc
  steps[3].detail = "title=" + (formResult.title ? "OK" : formResult.titleDetail) +
    " desc=" + (formResult.desc ? "OK" : formResult.descDetail) +
    " tags=" + (formResult.tags ? "OK" : formResult.tagsDetail)

  var overall = videoOk && formResult.title && formResult.desc
  logInfo("Task complete: " + (overall ? "SUCCESS" : "PARTIAL"))
  return { success: overall, steps: steps }
}

// ===== Message handler =====
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action !== "FILL_FORM" || msg.platform !== PLATFORM) return
  var sent = false
  processPublish(msg.data).then(function(result) {
    sent = true; sendResponse({ received: true, success: result.success, steps: result.steps })
  }).catch(function(e) {
    logFail("Handler error: " + e.message)
    if (!sent) sendResponse({ received: true, success: false, error: e.message })
  })
  return true
})

logInfo("Adapter ready (v" + VERSION + ")")