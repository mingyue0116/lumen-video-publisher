import type { PlasmoCSConfig } from "plasmo"
import {
  sleep, setNativeValue, setCE, normalizeTags, isElementEditable,
  deepQuerySelector, injectVideoToInput,
  waitForFormReady, showOverlay, hideOverlay, showFormFillStatus,
  startHB, claimTask, updStatus
} from "../lib/publisher-utils"

export const config: PlasmoCSConfig = {
  matches: ["https://twitter.com/*", "https://x.com/*"],
  run_at: "document_end"
}

const PLATFORM = "twitter"
const VERSION = "3.1.4"
var TASK_ID = ""

// ===== Logger =====
function logInfo(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "info") }
function logOk(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "ok") }
function logFail(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "fail") }
function sendS(m: string, t: string) { chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: "[" + t + "] " + m }).catch(function () { }) }

// ===== Twitter-specific adapter =====
var adapter = {
  findTitleInput: function () {
    // Twitter/X doesn't have a separate title field, it's all in the tweet text
    return null
  },
  findDescInput: function () {
    return deepQuerySelector('div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"], div[role="textbox"]')
  },
  isFormReady: function () {
    var d = this.findDescInput()
    return isElementEditable(d)
  },
  detectState: function () {
    var text = document.body.innerText || ""
    if (/Log in|Sign in/.test(text)) return "ERROR_LOGIN"
    if (this.isFormReady()) return "FORM_READY"
    if (/Uploading/.test(text)) return "UPLOADING"
    if (/Processing/.test(text)) return "PROCESSING"
    return "UNKNOWN"
  },
  diagnose: function () {
    var d = this.findDescInput()
    var text = document.body.innerText || ""
    return {
      state: this.detectState(),
      titleExists: false,
      titleEditable: false,
      descExists: !!d,
      descEditable: isElementEditable(d),
      iframeCount: document.querySelectorAll("iframe").length,
      signals: {
        uploading: /Uploading/.test(text),
        processing: /Processing/.test(text),
        waitingUpload: false
      }
    }
  }
}

// ===== Fill Form (Twitter-specific) =====
async function fillForm(title: string, descText: string, tags: string[]) {
  logInfo("Filling form...")
  await sleep(500)

  // Twitter/X: combine title + desc + tags into the tweet text
  var tweetText = descText || title || ""
  var n = normalizeTags(tags || [])
  if (n.length > 0) tweetText += (tweetText ? "\n" : "") + n.join(" ")

  if (tweetText) {
    var s = [
      'div[data-testid="tweetTextarea_0"]',
      'div[role="textbox"][contenteditable="true"]',
      'div[role="textbox"]'
    ]
    for (var i = 0; i < s.length; i++) {
      var el = document.querySelector(s[i]) as HTMLElement
      if (el && setCE(el, tweetText)) {
        logOk("Tweet text: OK")
        break
      }
    }
  }

  logInfo("Form fill done")
}

// ===== Main Process =====
async function processPublish(raw: any) {
  var data = raw.platformData || raw  // ★ 解包
  logInfo("Start processing")
  var fileName = data.videoFileName || "video.mp4"

  showOverlay(PLATFORM, adapter)

  logInfo("Waiting for compose area...")
  var composeReady = false
  for (var i = 0; i < 30; i++) {
    var state = adapter.detectState()
    if (state === "FORM_READY" || state === "UPLOADING" || state === "PROCESSING") {
      composeReady = true
      break
    }
    await sleep(1000)
  }
  if (!composeReady) {
    logInfo("Compose area not detected, will try inject anyway")
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
