import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.douyin.com/*", "https://*.douyin.com/*"],
  run_at: "document_end"
}

const PLATFORM = "douyin"
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

// ===== Douyin-specific upload wait indicators =====
function getDouyinUploadSelectors(): string[] {
  return [
    "video[src]",
    "video",
    "[class*=upload-success]",
    "[class*=video-preview]",
    "[class*=\"css-\"] video",
    "[class*=progress][style*=100]",
    ".semi-progress[style*=100]",
    "[class*=percent][style*=1]"
  ]
}

async function waitForUploadComplete(timeout = 120000): Promise<boolean> {
  logInfo("Waiting for douyin upload...")
  try {
    await new Promise<void>(function(resolve, reject) {
      var start = Date.now()
      var iv = setInterval(function() {
        var selectors = getDouyinUploadSelectors()
        for (var s = 0; s < selectors.length; s++) {
          var el = document.querySelector(selectors[s])
          if (el) { clearInterval(iv); logOk("Upload complete"); resolve(); return }
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

// ===== Douyin Form Fill =====
async function fillForm(title: string, descText: string, tags: string[]): Promise<FillFormResult> {
  var result: FillFormResult = { title: false, desc: false, tags: false, titleDetail: "", descDetail: "", tagsDetail: "" }
  logInfo("Filling douyin form...")

  // Title - douyin uses input with placeholder
  if (title) {
    var titleSels = [
      "input[placeholder*=\"\u6807\u9898\"]",
      "input[placeholder*=\"title\"]",
      "input[placeholder*=\"\u8f93\u5165\u89c6\u9891\"]",
      "input:not([type=file]):not([type=hidden])"
    ]
    for (var s = 0; s < titleSels.length; s++) {
      var el = document.querySelector(titleSels[s]) as HTMLInputElement
      if (el && el.type !== "file" && el.type !== "hidden") {
        if (setNativeValue(el, title)) {
          result.title = true; result.titleDetail = "Title filled via: " + titleSels[s]; logOk("Title: OK")
          break
        }
      }
    }
    if (!result.title) {
      result.titleDetail = "No title input found"; logFail("Title: not found")
    }
  } else {
    result.title = true; result.titleDetail = "Empty title, skipped"
  }

  // Description - douyin uses textarea or contenteditable
  if (descText) {
    var descSels = [
      "textarea[placeholder*=\"\u7b80\u4ecb\"]",
      "textarea[placeholder*=\"\u63cf\u8ff0\"]",
      "div[contenteditable=true]",
      "[contenteditable=\"true\"]",
      "textarea"
    ]
    for (var s = 0; s < descSels.length; s++) {
      var el = document.querySelector(descSels[s]) as HTMLElement
      if (!el) continue
      if (el.tagName === "TEXTAREA") {
        if (setNativeValue(el as HTMLTextAreaElement, descText)) {
          result.desc = true; result.descDetail = "Desc filled via textarea"; logOk("Description: OK")
          break
        }
      } else if (el.getAttribute("contenteditable") === "true") {
        if (setContentEditable(el, descText)) {
          result.desc = true; result.descDetail = "Desc filled via contenteditable"; logOk("Description: OK")
          break
        }
      }
    }
    if (!result.desc) {
      result.descDetail = "No description input found"; logFail("Description: not found")
    }
  } else {
    result.desc = true; result.descDetail = "Empty desc, skipped"
  }

  // Tags - each needs # prefix, find tag input area
  if (tags && tags.length > 0) {
    var normalized = normalizeTags(tags)
    var tagStr = normalized.join(" ")
    
    // Douyin: tags are often appended to description or have a separate tag input
    // Try finding a tag input first
    var tagSels = [
      "input[placeholder*=\"\u8bdd\u9898\"]",
      "input[placeholder*=\"tag\"]",
      "input[placeholder*=\'#\']"
    ]
    var tagSet = false
    for (var s = 0; s < tagSels.length; s++) {
      var el = document.querySelector(tagSels[s]) as HTMLInputElement
      if (el) {
        if (setNativeValue(el, tagStr)) {
          result.tags = true; result.tagsDetail = "Tags filled via tag input"; logOk("Tags: OK"); tagSet = true
          break
        }
      }
    }
    
    // Fallback: append tags to description
    if (!tagSet && result.desc) {
      var descWithTags = descText + "\n" + tagStr
      logInfo("Tags appended to description (no separate tag input)")
      result.tags = true; result.tagsDetail = "Tags appended to description"
    }
    
    if (!tagSet && !result.desc) {
      // Try filling description now with tags
      var ds = ["textarea", "div[contenteditable=true]", "[contenteditable=\"true\"]"]
      for (var s = 0; s < ds.length; s++) {
        var el = document.querySelector(ds[s]) as HTMLElement
        if (!el) continue
        if (el.tagName === "TEXTAREA") {
          if (setNativeValue(el as HTMLTextAreaElement, tagStr)) {
            result.tags = true; result.tagsDetail = "Tags filled as desc fallback"; logOk("Tags: filled via desc"); break
          }
        } else if (el.getAttribute("contenteditable") === "true") {
          if (setContentEditable(el, tagStr)) {
            result.tags = true; result.tagsDetail = "Tags filled as desc fallback"; logOk("Tags: filled via desc"); break
          }
        }
      }
    }
    
    if (!result.tags) {
      result.tagsDetail = "No tag input found"; logFail("Tags: not filled")
    }
  } else {
    result.tags = true; result.tagsDetail = "No tags, skipped"
  }

  logInfo("Form fill: title=" + result.title + " desc=" + result.desc + " tags=" + result.tags)
  return result
}

// ===== Main State Machine =====
async function processPublish(data: any): Promise<PublishResult> {
  var steps: PublishStep[] = []
  var taskId = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
  logInfo("Task start", { taskId: taskId, platform: PLATFORM, version: VERSION })

  // Step 1: Load video
  steps.push({ name: "Load video", success: false, detail: "" })
  var dataUrl: string | null = null
  if (data.videoStorageKey) {
    dataUrl = await loadVideoFromStorage(data.videoStorageKey)
  }
  if (dataUrl) {
    steps[0].success = true; steps[0].detail = "Video data loaded"
  } else {
    steps[0].detail = "Failed to load video data"
  }

  // Step 2: Inject video
  steps.push({ name: "Inject video", success: false, detail: "" })
  var videoOk = false
  if (dataUrl) {
    videoOk = await findAndInjectVideo(dataUrl, data.videoName || "video.mp4")
    steps[1].success = videoOk
    steps[1].detail = videoOk ? "Video injected successfully" : "Video injection failed"
  } else {
    steps[1].detail = "No video data available"
  }

  // Step 3: Wait for upload
  steps.push({ name: "Wait for upload", success: false, detail: "" })
  if (videoOk) {
    var uploadOk = await waitForUploadComplete()
    steps[2].success = uploadOk
    steps[2].detail = uploadOk ? "Upload completed" : "Upload timed out"
  } else {
    steps[2].detail = "Skipped (no video)"
  }

  // Step 4: Build form data with # tags
  var descText = data.content || ""
  var tagList: string[] = data.tags || []
  var normalizedTags = normalizeTags(tagList)
  if (normalizedTags.length > 0 && !descText) {
    // If no description, use tags as description content
    descText = normalizedTags.join(" ")
  }

  // Step 5: Fill form
  steps.push({ name: "Fill form", success: false, detail: "" })
  var formResult = await fillForm(data.title || "", descText, tagList)
  steps[3].success = formResult.title && formResult.desc
  steps[3].detail = "title=" + (formResult.title ? "OK" : "FAIL:" + formResult.titleDetail) +
    " desc=" + (formResult.desc ? "OK" : "FAIL:" + formResult.descDetail) +
    " tags=" + (formResult.tags ? "OK" : "FAIL:" + formResult.tagsDetail)

  // Step 6: Overall success
  var overall = videoOk && formResult.title && formResult.desc
  logInfo("Task complete: " + (overall ? "SUCCESS" : "PARTIAL"), { taskId: taskId })

  return { success: overall, steps: steps }
}

// ===== Message handler =====
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action !== "FILL_FORM" || msg.platform !== PLATFORM) return

  var sendOk = false
  processPublish(msg.data).then(function(result) {
    sendOk = true
    sendResponse({ received: true, success: result.success, steps: result.steps })
  }).catch(function(e) {
    logFail("Handler error: " + e.message)
    if (!sendOk) {
      sendResponse({ received: true, success: false, error: e.message })
    }
  })

  return true
})

logInfo("Adapter ready (v" + VERSION + ")")