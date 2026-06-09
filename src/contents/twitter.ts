import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://twitter.com/*", "https://x.com/*"],
  run_at: "document_end"
}

const PLATFORM = "twitter"
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
  var fileInput = await waitForElement("input[type=file]") as HTMLInputElement | null
  if (!fileInput) { logFail("No file input found"); return false }
  logInfo("File input found")
  return await injectVideoToInput(fileInput, dataUrl, fileName)
}

// ===== Twitter upload wait =====
async function waitForUploadComplete(timeout = 60000): Promise<boolean> {
  logInfo("Waiting for twitter upload...")
  try {
    await new Promise<void>(function(resolve, reject) {
      var start = Date.now()
      var iv = setInterval(function() {
        var selectors = ["video[src]", "video", "[data-testid=\"videoPlayer\"]", "[role=\"progressbar\"]"]
        // Check if progress is gone (upload finished)
        var progress = document.querySelector("[role=\"progressbar\"]")
        var video = document.querySelector("video[src]")
        if (video || !progress) {
          clearInterval(iv); logOk("Upload complete"); resolve(); return
        }
        if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error("Timeout")) }
      }, 1000)
    })
    await sleep(1000)
    return true
  } catch(e: any) { logFail("Upload timeout/error"); return false }
}

// ===== Twitter Form Fill (no title, just tweet text with hashtags) =====
async function fillForm(title: string, descText: string, tags: string[]): Promise<FillFormResult> {
  var result: FillFormResult = { title: false, desc: false, tags: false, titleDetail: "", descDetail: "", tagsDetail: "" }
  logInfo("Filling twitter form...")

  // Twitter has no separate title - use descText as tweet content
  var tweetText = descText || title || ""
  var normalized = normalizeTags(tags)
  if (normalized.length > 0) {
    tweetText += (tweetText ? "\n" : "") + normalized.join(" ")
  }

  if (tweetText) {
    var tbSels = [
      "div[data-testid=tweetTextarea_0]",
      "div[role=textbox][contenteditable=true]",
      "div[role=textbox]",
      "div[contenteditable=true]"
    ]
    for (var s = 0; s < tbSels.length; s++) {
      var el = document.querySelector(tbSels[s]) as HTMLElement
      if (el) {
        if (setContentEditable(el, tweetText)) {
          result.title = true; result.titleDetail = "Tweet text filled"
          result.desc = true; result.descDetail = "Tweet text filled"
          result.tags = true; result.tagsDetail = "Tags in tweet text"
          logOk("Tweet text: OK"); break
        }
      }
    }
    if (!result.title) {
      result.titleDetail = "Not found"; result.descDetail = "Not found"; result.tagsDetail = "Not found"
      logFail("Tweet text: not found")
    }
  } else {
    result.title = true; result.desc = true; result.tags = true
  }

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

  steps.push({ name: "Fill form", success: false, detail: "" })
  var formResult = await fillForm(data.title || "", data.content || "", data.tags || [])
  steps[3].success = formResult.title && formResult.desc
  steps[3].detail = "tweet=" + ((formResult.title && formResult.desc) ? "OK" : "FAIL:" + formResult.descDetail)

  var overall = videoOk && formResult.title
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