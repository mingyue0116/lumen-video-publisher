// ===== Video Publisher v2.0.0 - Shared Utilities =====

const EXT_VERSION = "2.0.0"

// ===== Logger (3 levels) =====
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

// ===== Timing =====
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

function waitForAnyElement(selectors: string[], timeout = 25000): Promise<Element | null> {
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

// ===== DOM value setters =====
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
    try {
      el.innerText = value
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    } catch(e2) { return false }
  }
}

// ===== Tags =====
// Ensure every tag has # prefix
function normalizeTags(tags: string[]): string[] {
  var result: string[] = []
  for (var t = 0; t < tags.length; t++) {
    var tag = tags[t].trim()
    if (!tag) continue
    if (tag.indexOf("#") !== 0) {
      tag = "#" + tag
    }
    result.push(tag)
  }
  return result
}

// Build description text with #tags appended
function buildDescWithTags(content: string, tags: string[]): string {
  var normalized = normalizeTags(tags)
  if (normalized.length === 0) return content || ""
  var tagStr = normalized.join(" ")
  return (content ? content + "\n\n" : "") + tagStr
}

// ===== Video injection (storage-based) =====
async function loadVideoFromStorage(storageKey: string): Promise<{file: File | null, dataUrl: string | null}> {
  try {
    var data = await new Promise<any>(function(resolve) {
      chrome.storage.local.get([storageKey], function(result) {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(result[storageKey] || null)
      })
    })
    if (!data || !data.dataUrl) {
      logFail("No video data in storage")
      return { file: null, dataUrl: null }
    }
    logInfo("Video loaded: " + ((data.dataUrl.length) / 1024 / 1024).toFixed(1) + "MB")
    return { file: null, dataUrl: data.dataUrl }
  } catch(e: any) {
    logFail("Load video: " + e.message)
    return { file: null, dataUrl: null }
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
    logOk("Video injected via DataTransfer")
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
  logInfo("File input found, injecting...")
  return await injectVideoToInput(fileInput, dataUrl, fileName)
}

// ===== Upload completion =====
function getUploadCompleteSelectors(): string[] {
  return [
    "video[src]", "video", "[class*=\"upload-success\"]",
    "[class*=\"upload-complete\"]", "[class*=\"video-preview\"]",
    "[class*=\"progress\"][style*=\"100%\"]"
  ]
}

async function waitForUploadComplete(timeout = 60000): Promise<boolean> {
  logInfo("Waiting for upload...")
  try {
    await waitForAnyElement(getUploadCompleteSelectors(), timeout)
    logOk("Upload complete")
    await sleep(2000)
    return true
  } catch(e: any) {
    logFail("Upload timed out")
    return false
  }
}

// ===== Result types =====
interface FillFormResult {
  title: boolean
  desc: boolean
  tags: boolean
  titleDetail: string
  descDetail: string
  tagsDetail: string
}

interface PublishStep {
  name: string
  success: boolean
  detail: string
}

interface PublishResult {
  success: boolean
  steps: PublishStep[]
}
