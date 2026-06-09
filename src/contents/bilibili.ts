import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://member.bilibili.com/*", "https://t.bilibili.com/*"],
  run_at: "document_end"
}

const PLATFORM = "bilibili"
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

// ===== Video Injection =====
async function loadVideoFromStorage(storageKey: string): Promise<string | null> {
  try {
    var data = await new Promise<any>(function(resolve) {
      chrome.storage.local.get([storageKey], function(result) {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(result[storageKey] || null)
      })
    })
    if (!data || !data.dataUrl) {
      logFail("No video data in storage")
      return null
    }
    logInfo("Video loaded: " + ((data.dataUrl.length) / 1024 / 1024).toFixed(1) + "MB")
    return data.dataUrl
  } catch(e: any) {
    logFail("Load video: " + e.message)
    return null
  }
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
  } catch(e: any) {
    logFail("Inject video: " + e.message)
    return false
  }
}

async function findAndInjectVideo(dataUrl: string, fileName: string): Promise<boolean> {
  var fileInput = await waitForElement("input[type=file]") as HTMLInputElement | null
  if (!fileInput) {
    logFail("No file input found")
    return false
  }
  logInfo("File input found")
  return await injectVideoToInput(fileInput, dataUrl, fileName)
}

// ===== Bilibili upload wait =====
async function waitForUploadComplete(timeout = 120000): Promise<boolean> {
  logInfo("Waiting for bilibili upload...")
  try {
    await new Promise<void>(function(resolve, reject) {
      var start = Date.now()
      var iv = setInterval(function() {
        var selectors = ["video[src]", "video", "[class*=upload-success]", "[class*=video-preview]", "[class*=success]"]
        for (var s = 0; s < selectors.length; s++) {
          if (document.querySelector(selectors[s])) {
            clearInterval(iv); logOk("Upload complete"); resolve(); return
          }
        }
        if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error("Timeout")) }
      }, 1000)
    })
    await sleep(2000)
    return true
  } catch(e: any) {
    logFail("Upload timeout/error")
    return false
  }
}

// ===== Bilibili Form Fill =====
async function fillForm(title: string, descText: string, tags: string[]): Promise<FillFormResult> {
  var result: FillFormResult = { title: false, desc: false, tags: false, titleDetail: "", descDetail: "", tagsDetail: "" }
  logInfo("Filling bilibili form...")

  if (title) {
    var titleSels = ["input[placeholder*=\"\u6807\u9898\"]", "input[placeholder*=\"title\"]", "input[placeholder*=\"\u89c6\u9891\"]", "input:not([type=file]):not([type=hidden])"]
    for (var s = 0; s < titleSels.length; s++) {
      var el = document.querySelector(titleSels[s]) as HTMLInputElement
      if (el && el.type !== "file" && el.type !== "hidden") {
        if (setNativeValue(el, title)) {
          result.title = true; result.titleDetail = "OK"; logOk("Title: OK"); break
        }
      }
    }
    if (!result.title) { result.titleDetail = "Not found"; logFail("Title: not found") }
  } else { result.title = true; result.titleDetail = "Skipped" }

  if (descText) {
    var descSels = ["div[contenteditable=true]", "[contenteditable=\"true\"]", "textarea"]
    for (var s = 0; s < descSels.length; s++) {
      var el = document.querySelector(descSels[s]) as HTMLElement
      if (!el) continue
      if (el.tagName === "TEXTAREA") {
        if (setNativeValue(el as HTMLTextAreaElement, descText)) {
          result.desc = true; result.descDetail = "OK"; logOk("Description: OK"); break
        }
      } else if (el.getAttribute("contenteditable") === "true") {
        if (setContentEditable(el, descText)) {
          result.desc = true; result.descDetail = "OK"; logOk("Description: OK"); break
        }
      }
    }
    if (!result.desc) { result.descDetail = "Not found"; logFail("Description: not found") }
  } else { result.desc = true; result.descDetail = "Skipped" }

  if (tags && tags.length > 0) {
    // Bilibili uses Enter to add tags - each tag separately
    var normalized = normalizeTags(tags)
    // Bilibili tags don't use # prefix, strip it
    var bareTags = normalized.map(function(t) { return t.indexOf("#") === 0 ? t.slice(1) : t })
    var tagSels = ["input[placeholder*=\"\u6807\u7b7e\"]", "input[placeholder*=\"tag\"]"]
    var tagSet = false
    for (var s = 0; s < tagSels.length; s++) {
      var el = document.querySelector(tagSels[s]) as HTMLInputElement
      if (el) {
        // For Bilibili, try comma-separated first, then individual
        if (setNativeValue(el, bareTags.join(","))) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
          await sleep(200)
          result.tags = true; result.tagsDetail = "OK: " + bareTags.join(","); logOk("Tags: OK"); tagSet = true; break
        }
      }
    }
    if (!tagSet && result.desc) {
      var descWithTags = descText + "\n" + normalized.join(" ")
      ", "[contenteditable=\"true\"]"]
      for (var s2 = 0; s2 < descSels2.length; s2++) {
        var el2 = document.querySelector(descSels2[s2]) as HTMLElement
        if (!el2) continue
        if (el2.tagName === "TEXTAREA") {
          if (setNativeValue(el2 as HTMLTextAreaElement, descWithTags)) {
            result.tags = true; result.tagsDetail = "Appended to desc"; logOk("Tags: appended"); tagSet = true; break
          }
        } else {
          if (setContentEditable(el2, descWithTags)) {
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