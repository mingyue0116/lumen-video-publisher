import type { PlasmoCSConfig } from "plasmo"
import {
  sleep, setNativeValue, setCE, normalizeTags, isElementEditable,
  deepQuerySelector, injectVideoToInput,
  waitForFormReady, showOverlay, hideOverlay, showFormFillStatus,
  startHB, claimTask, updStatus
} from "../lib/publisher-utils"

export const config: PlasmoCSConfig = {
  matches: ["https://member.bilibili.com/*", "https://t.bilibili.com/*"],
  run_at: "document_end"
}

const PLATFORM = "bilibili"
const VERSION = "3.2.1"
var TASK_ID = ""

// ===== Logger =====
function logInfo(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "info") }
function logOk(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "ok") }
function logFail(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "fail") }
function sendS(m: string, t: string) { chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: "[" + t + "] " + m }).catch(function () { }) }

// ===== Bilibili-specific adapter =====
var adapter = {
  findTitleInput: function () {
    var el = deepQuerySelector('input[placeholder*="标题"], input[placeholder*="title"], input[placeholder*="Title"]')
    if (el) return el
    var all = document.querySelectorAll('input[type=text]')
    for (var i = 0; i < all.length; i++) {
      if (isElementEditable(all[i])) return all[i]
    }
    return null
  },
  findDescInput: function () {
    return deepQuerySelector('div[contenteditable=true], [contenteditable="true"], textarea[placeholder*="简介"], textarea')
  },
  isFormReady: function () {
    var t = this.findTitleInput()
    return isElementEditable(t)
  },
  detectState: function () {
    var text = document.body.innerText || ""
    if (/登录|请登录|安全验证/.test(text)) return "ERROR_LOGIN"
    if (this.isFormReady()) return "FORM_READY"
    if (/上传中|正在上传/.test(text)) return "UPLOADING"
    if (/处理中|解析中|转码中/.test(text)) return "PROCESSING"
    if (/上传视频|选择视频|点击上传|请先上传/.test(text)) return "WAITING_VIDEO"
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

// ===== Fill Form (Bilibili-specific) =====
async function fillForm(title: string, descText: string, tags: string[]) {
  logInfo("Filling form...")
  await sleep(500)

  // Title
  if (title) {
    var s = [
      'input[placeholder*="标题"]',
      'input[placeholder*="title"]',
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

  // Description (Bilibili uses contenteditable div)
  if (descText) {
    var s = [
      'div[contenteditable=true]',
      '[contenteditable="true"]',
      'textarea[placeholder*="简介"]',
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

  // Tags (Bilibili uses comma-separated tags in a dedicated input)
  if (tags && tags.length > 0) {
    var n = normalizeTags(tags)
    var bare = n.map(function (t) { return t.indexOf("#") === 0 ? t.slice(1) : t })
    var s = ['input[placeholder*="标签"]']
    var ok = false
    for (var i = 0; i < s.length; i++) {
      var el = document.querySelector(s[i]) as HTMLInputElement
      if (el && setNativeValue(el, bare.join(","))) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        await sleep(200)
        ok = true
        logOk("Tags: OK")
        break
      }
    }
    if (!ok) {
      var ds = ['textarea', 'div[contenteditable=true]', '[contenteditable="true"]']
      for (var i = 0; i < ds.length; i++) {
        var el = document.querySelector(ds[i]) as HTMLElement
        if (!el) continue
        var cur = el.tagName === "TEXTAREA" ? (el as HTMLTextAreaElement).value : el.innerText
        var nv = (cur ? cur + "\n" : "") + n.join(" ")
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
  var data = raw.platformData || raw  // ★ 解包
  logInfo("Start processing")
  var fileName = data.videoFileName || "video.mp4"

  showOverlay(PLATFORM, adapter)

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

  // Try CDP direct file injection (background uses Task's videoFilePath)
  logInfo("Attempting CDP injection...")
  var injected = await injectVideoToInput(TASK_ID, fileName, data.videoFileType)

  if (!injected) {
    logInfo("CDP injection failed, waiting for manual upload...")
  }

  logInfo("Waiting for form ready...")
  var ready = await waitForFormReady(adapter, 900000)
  hideOverlay()

  if (!ready) {
    logFail("Form not ready within timeout")
    return
  }

  await sleep(2000)

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
