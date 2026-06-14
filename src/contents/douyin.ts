import type { PlasmoCSConfig } from "plasmo"
import {
  sleep, setNativeValue, setCE, normalizeTags, isElementEditable,
  deepQuerySelector, injectVideoToInput,
  waitForFormReady, showOverlay, hideOverlay, showFormFillStatus,
  startHB, claimTask, updStatus
} from "../lib/publisher-utils"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.douyin.com/*", "https://*.douyin.com/*"],
  run_at: "document_end"
}

const PLATFORM = "douyin"
const VERSION = "3.1.4"
var TASK_ID = ""

// ===== Logger =====
function logInfo(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "info") }
function logOk(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "ok") }
function logFail(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "fail") }
function sendS(m: string, t: string) { chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: "[" + t + "] " + m }).catch(function () { }) }

// ===== Douyin-specific adapter =====
var adapter = {
  findTitleInput: function () {
    // 抖音标题输入框：通常有 placeholder 包含"标题"或"title"
    var el = deepQuerySelector('input[placeholder*="标题"], input[placeholder*="title"], input[placeholder*="Title"]')
    if (el) return el
    // 兜底：找第一个可见的文本输入框
    var all = document.querySelectorAll('input[type=text], input:not([type])')
    for (var i = 0; i < all.length; i++) {
      if (isElementEditable(all[i])) return all[i]
    }
    return null
  },
  findDescInput: function () {
    // 抖音描述：通常是 contenteditable div 或 textarea
    var el = deepQuerySelector('div[contenteditable=true], [contenteditable="true"], textarea[placeholder*="简介"], textarea[placeholder*="描述"]')
    return el
  },
  isFormReady: function () {
    var t = this.findTitleInput()
    return isElementEditable(t)
  },
  detectState: function () {
    var text = document.body.innerText || ""
    if (/登录|请登录|安全验证|扫码登录/.test(text)) return "ERROR_LOGIN"
    if (this.isFormReady()) return "FORM_READY"
    if (/上传中|正在上传/.test(text)) return "UPLOADING"
    if (/处理中|解析中|转码中/.test(text)) return "PROCESSING"
    if (/上传视频|选择视频|点击上传|请先上传|拖拽视频/.test(text)) return "WAITING_VIDEO"
    return "UNKNOWN"
  },
  diagnose: function () {
    var t = this.findTitleInput()
    var d = this.findDescInput()
    var text = document.body.innerText || ""
    return {
      state: this.detectState(),
      titleExists: !!t,
      titleEditable: isElementEditable(t),
      descExists: !!d,
      descEditable: isElementEditable(d),
      iframeCount: document.querySelectorAll("iframe").length,
      signals: {
        uploading: /上传中|正在上传/.test(text),
        processing: /处理中|解析中|转码中/.test(text),
        waitingUpload: /上传视频|选择视频|点击上传|请先上传/.test(text)
      }
    }
  }
}

// ===== Fill Form (Douyin-specific) =====
async function fillForm(title: string, descText: string, tags: string[]) {
  logInfo("Filling form...")
  await sleep(500)

  // Title
  if (title) {
    var s = [
      'input[placeholder*="标题"]',
      'input[placeholder*="title"]',
      'input[placeholder*="Title"]',
      'input[type=text]:not([type=file])'
    ]
    for (var i = 0; i < s.length; i++) {
      var el = document.querySelector(s[i]) as HTMLInputElement
      if (el && el.type !== "file" && el.type !== "hidden") {
        if (setNativeValue(el, title)) {
          logOk("Title: OK")
          break
        }
      }
    }
  }

  await sleep(300)

  // Description
  if (descText) {
    var s = [
      'textarea[placeholder*="简介"]',
      'textarea[placeholder*="描述"]',
      'div[contenteditable=true]',
      '[contenteditable="true"]',
      'textarea'
    ]
    for (var i = 0; i < s.length; i++) {
      var el = document.querySelector(s[i]) as HTMLElement
      if (!el) continue
      if (el.tagName === "TEXTAREA") {
        if (setNativeValue(el as HTMLTextAreaElement, descText)) {
          logOk("Desc: OK")
          break
        }
      } else if (el.getAttribute("contenteditable") === "true") {
        if (setCE(el, descText)) {
          logOk("Desc: OK")
          break
        }
      }
    }
  }

  await sleep(300)

  // Tags
  if (tags && tags.length > 0) {
    var n = normalizeTags(tags)
    var ts = n.join(" ")
    var s = ['input[placeholder*="话题"]', 'input[placeholder*="标签"]']
    var ok = false
    for (var i = 0; i < s.length; i++) {
      var el = document.querySelector(s[i]) as HTMLInputElement
      if (el && setNativeValue(el, ts)) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        ok = true
        logOk("Tags: " + ts)
        break
      }
    }
    if (!ok) {
      // Fallback: append to description
      var ds = ['textarea', 'div[contenteditable=true]', '[contenteditable="true"]']
      for (var i = 0; i < ds.length; i++) {
        var el = document.querySelector(ds[i]) as HTMLElement
        if (!el) continue
        var cur = el.tagName === "TEXTAREA" ? (el as HTMLTextAreaElement).value : el.innerText
        var nv = (cur ? cur + "\n" : "") + ts
        if (el.tagName === "TEXTAREA") {
          setNativeValue(el as HTMLTextAreaElement, nv)
        } else {
          setCE(el, nv)
        }
        logOk("Tags: appended to desc")
        ok = true
        break
      }
    }
    if (!ok) logFail("Tags: not filled")
  }

  logInfo("Form fill done")
}

// ===== Main Process =====
async function processPublish(raw: any) {
  var data = raw.platformData || raw  // ★ 解包：claimTask 返回的数据在 platformData 里
  logInfo("Start processing")
  var fileName = data.videoFileName || "video.mp4"

  // Step 1: Show diagnostic overlay
  showOverlay(PLATFORM, adapter)

  // Step 2: Wait for upload area to appear (not form ready, but upload area)
  logInfo("Waiting for upload area...")
  var uploadReady = false
  for (var i = 0; i < 30; i++) {
    var state = adapter.detectState()
    if (state === "FORM_READY" || state === "WAITING_VIDEO" || state === "UPLOADING" || state === "PROCESSING") {
      uploadReady = true
      break
    }
    await sleep(1000)
  }
  if (!uploadReady) {
    logInfo("Upload area not detected, will try inject anyway")
  }

  // Step 3: Try CDP direct file injection (background uses Task's videoFilePath)
  logInfo("Attempting CDP injection...")
  var injected = await injectVideoToInput(TASK_ID, fileName, data.videoFileType)

  if (!injected) {
    logInfo("CDP injection failed, waiting for manual upload...")
  }

  // Step 4: Wait for FORM_READY (form elements editable)
  logInfo("Waiting for form ready...")
  var ready = await waitForFormReady(adapter, 900000)
  hideOverlay()

  if (!ready) {
    logFail("Form not ready within timeout")
    return
  }

  await sleep(2000)

  // Step 5: Fill form
  showFormFillStatus(PLATFORM)
  var descText = data.content || ""
  await fillForm(data.title || "", descText, data.tags || [])

  logOk("All done - please review and submit manually")
}

// ===== Heartbeat + Task Claim =====
var _hb: ReturnType<typeof setInterval> | null = null
function startHeartbeat() { _hb = startHB(PLATFORM) }
function stopHeartbeat() { if (_hb) { clearInterval(_hb); _hb = null } }

// ===== Boot =====
startHeartbeat()
logInfo("Ready v" + VERSION)
claimTask(PLATFORM, 20).then(function (td) {
  if (!td) { logInfo("No task claimed"); return }
  TASK_ID = td.taskId
  updStatus(PLATFORM, td.taskId, "filling")
  processPublish(td).then(function () {
    updStatus(PLATFORM, td.taskId, "done")
    stopHeartbeat()
    hideOverlay()
  }).catch(function (e: any) {
    logFail(e.message)
    updStatus(PLATFORM, td.taskId, "error", e.message)
  })
}).catch(function (e: any) {
  logFail("Boot: " + e.message)
})
