import type { PlasmoCSConfig } from "plasmo"
import {
  sleep, setNativeValue, setCE, normalizeTags, isElementEditable,
  deepQuerySelector, injectVideoToInput,
  waitForFormReady, showOverlay, hideOverlay, showFormFillStatus,
  startHB, claimTask, updStatus
} from "../lib/publisher-utils"

export const config: PlasmoCSConfig = {
  matches: ["https://channels.weixin.qq.com/*"],
  run_at: "document_end"
}

const PLATFORM = "shipinhao"
const VERSION = "3.1.4"
var TASK_ID = ""

// ===== Logger =====
function logInfo(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "info") }
function logOk(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "ok") }
function logFail(m: string) { console.log("[" + PLATFORM + "]", m); sendS(m, "fail") }
function sendS(m: string, t: string) { chrome.runtime.sendMessage({ action: "STATUS", platform: PLATFORM, message: "[" + t + "] " + m }).catch(function () { }) }

// ===== Shipinhao-specific adapter (handles wujie iframe) =====
function getWujieDoc(): Document | ShadowRoot | null {
  try {
    var app = document.querySelector("wujie-app")
    if (app) {
      var sr = (app as any).shadowRoot
      if (sr) {
        var iframe = sr.querySelector("iframe")
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          return iframe.contentDocument
        }
        return sr
      }
    }
    // ★ v3.1.4: 找所有 iframe, 返回 form 元素最多的那个
    var ifs = document.querySelectorAll("iframe")
    var bestDoc: Document | null = null, bestCount = 0
    for (var i = 0; i < ifs.length; i++) {
      try {
        var doc = (ifs[i] as any).contentDocument || (ifs[i] as any).contentWindow?.document
        if (doc && doc.body) {
          var count = doc.querySelectorAll("input, textarea, [contenteditable]").length
          if (count > bestCount) { bestCount = count; bestDoc = doc }
        }
      } catch (e) { }
    }
    if (bestDoc) return bestDoc
  } catch (e) { }
  return null
}
var _wuDoc: Document | ShadowRoot | null = null  // cached
function getWujieDocCached() { if (!_wuDoc) _wuDoc = getWujieDoc(); return _wuDoc }

function wq(sel: string): Element | null {
  try {
    var d = getWujieDocCached()
    if (d) { var el = d.querySelector(sel); if (el) return el }
    return document.querySelector(sel)
  } catch (e) { return document.querySelector(sel) }
}

function wqAll(sel: string): Element[] {
  var res: Element[] = []
  try {
    var d = getWujieDocCached()
    if (d) {
      var l = d.querySelectorAll(sel)
      for (var i = 0; i < l.length; i++) res.push(l[i])
    }
  } catch (e) { }
  var main = document.querySelectorAll(sel)
  for (var i = 0; i < main.length; i++) res.push(main[i])
  return res
}

var adapter = {
  findTitleInput: function () {
    var el = wq('input[placeholder*="标题"], input[placeholder*="title"], input[placeholder*="Title"]')
    if (el) return el
    var all = wqAll('input[type=text]')
    for (var i = 0; i < all.length; i++) {
      if (isElementEditable(all[i])) return all[i]
    }
    return null
  },
  findDescInput: function () {
    var eds = wqAll("div[contenteditable=true]")
    if (eds.length > 0) {
      var best: Element | null = null, bestArea = 0
      for (var i = 0; i < eds.length; i++) {
        if (!isElementEditable(eds[i])) continue
        var rect = eds[i].getBoundingClientRect()
        var area = rect.width * rect.height
        if (area > bestArea) { bestArea = area; best = eds[i] }
      }
      if (best) return best
    }
    var tas = wqAll("textarea")
    if (tas.length > 0) {
      var best: Element | null = null, bestArea = 0
      for (var i = 0; i < tas.length; i++) {
        if (!isElementEditable(tas[i])) continue
        var rect = tas[i].getBoundingClientRect()
        var area = rect.width * rect.height
        if (area > bestArea) { bestArea = area; best = tas[i] }
      }
      if (best) return best
    }
    return null
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

// ===== Fill Form (Shipinhao-specific with wujie support) =====
async function fillForm(title: string, descText: string, tags: string[]) {
  logInfo("Filling form...")
  await sleep(500)

  // Title
  if (title) {
    var inputs = wqAll("input")
    var ok = false
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i] as HTMLInputElement
      if (inp.type === "file" || inp.type === "hidden") continue
      var ph = (inp.placeholder || "").toLowerCase()
      if (ph.indexOf("title") >= 0 || ph.indexOf("标题") >= 0 || ph.indexOf("视频") >= 0) {
        if (setNativeValue(inp, title)) { ok = true; logOk("Title: OK"); break }
      }
    }
    if (!ok) {
      for (var i = 0; i < inputs.length; i++) {
        if ((inputs[i] as HTMLInputElement).type !== "file" && (inputs[i] as HTMLInputElement).type !== "hidden") {
          if (setNativeValue(inputs[i] as HTMLInputElement, title)) { ok = true; logOk("Title: fallback"); break }
        }
      }
    }
    if (!ok) logFail("Title: not found")
  }

  await sleep(300)

  // Description + Tags (视频号的话题通常在描述框里输入 #话题 触发)
  var fullDesc = descText || ""
  if (tags && tags.length > 0) {
    var n = normalizeTags(tags)
    var tagStr = n.join(" ")
    if (fullDesc) fullDesc += "\n" + tagStr
    else fullDesc = tagStr
  }

  if (fullDesc) {
    // ★ v3.1.4: 诊断日志 — 列出所有可编辑元素
    var eds = wqAll("div[contenteditable=true]")
    var tas = wqAll("textarea")
    logInfo("Form elements found: " + eds.length + " contenteditables, " + tas.length + " textareas")
    for (var di = 0; di < eds.length; di++) {
      var r = eds[di].getBoundingClientRect()
      logInfo("  ce[" + di + "]: " + Math.round(r.width) + "x" + Math.round(r.height) + " visible=" + ((eds[di] as HTMLElement).offsetParent !== null))
    }
    for (var di = 0; di < tas.length; di++) {
      var r = tas[di].getBoundingClientRect()
      logInfo("  ta[" + di + "]: " + Math.round(r.width) + "x" + Math.round(r.height) + " placeholder=" + ((tas[di] as HTMLTextAreaElement).placeholder || "").slice(0,20))
    }

    // Strategy 1: contenteditable divs (most common in modern apps)
    var bestEd: HTMLElement | null = null
    var bestArea = 0
    for (var i = 0; i < eds.length; i++) {
      var el = eds[i] as HTMLElement
      if (!isElementEditable(el)) continue
      var rect = el.getBoundingClientRect()
      var area = rect.width * rect.height
      if (area > bestArea) { bestArea = area; bestEd = el }
    }
    if (bestEd) {
      logInfo("Best contenteditable: area=" + Math.round(bestArea) + " tag=" + bestEd.tagName)
      if (setCE(bestEd, fullDesc)) {
        logOk("Desc+Tags: contenteditable (area=" + Math.round(bestArea) + ")")
        // verify
        await sleep(500)
        logInfo("Desc verification: text length=" + ((bestEd as HTMLElement).innerText || "").length)
      } else {
        logFail("Desc+Tags: contenteditable set failed")
      }
    } else {
      // Strategy 2: textareas
      var bestTa: HTMLTextAreaElement | null = null
      bestArea = 0
      for (var i = 0; i < tas.length; i++) {
        var el = tas[i] as HTMLTextAreaElement
        if (!isElementEditable(el)) continue
        var rect = el.getBoundingClientRect()
        var area = rect.width * rect.height
        if (area > bestArea) { bestArea = area; bestTa = el }
      }
      if (bestTa) {
        logInfo("Best textarea: area=" + Math.round(bestArea) + " placeholder=" + (bestTa.placeholder || "").slice(0,20))
        if (setNativeValue(bestTa, fullDesc)) logOk("Desc+Tags: textarea")
        else logFail("Desc+Tags: textarea set failed")
      } else {
        logFail("Desc+Tags: no editable element found")
      }
    }
  }

  logInfo("Form fill done")
}

function clickShipinhaoUpload(): boolean {
  var keywords = ["上传视频", "选择视频", "upload", "select video", "上传", "发布视频", "拖拽视频", "点击上传", "choose file", "请选择要上传的视频", "请上传视频"]
  var selectors = ["button", "div", "span", "a", "label", "[class*=upload]", "[class*=Upload]", "[class*=publish]", "[class*=Publish]"]
  for (var s = 0; s < selectors.length; s++) {
    var els = wqAll(selectors[s])
    for (var i = 0; i < els.length; i++) {
      var el = els[i] as HTMLElement
      var txt = (el.innerText || el.textContent || "").toLowerCase().trim()
      if (!txt) continue
      for (var k = 0; k < keywords.length; k++) {
        if (txt.indexOf(keywords[k].toLowerCase()) >= 0) {
          try {
            el.click(); el.dispatchEvent(new Event("click", { bubbles: true }))
            logInfo("Clicked upload trigger: " + txt.slice(0, 30))
            return true
          } catch (e) { }
        }
      }
    }
  }
  return false
}

async function waitForFileInput(maxWait: number): Promise<boolean> {
  var elapsed = 0
  while (elapsed < maxWait) {
    var all = wqAll('input[type="file"]')
    for (var i = 0; i < all.length; i++) {
      var inp = all[i] as HTMLInputElement
      var acc = (inp.getAttribute("accept") || "").toLowerCase()
      if (!acc || acc.indexOf("video") >= 0) return true
    }
    await sleep(500)
    elapsed += 500
  }
  return false
}
var _loginOverlay: HTMLElement | null = null
function showLoginOverlay() {
  if (_loginOverlay) return
  _loginOverlay = document.createElement("div")
  _loginOverlay.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:#ff4d4f;color:#fff;padding:24px 32px;border-radius:12px;font-size:16px;font-family:sans-serif;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.25);max-width:420px;line-height:1.6"
  _loginOverlay.innerHTML = "<div style='font-size:20px;font-weight:bold;margin-bottom:12px'>视频号需要登录</div><div>请使用微信扫码登录。<br/>登录成功后页面会自动刷新并继续发布视频。<br/><span style='font-size:13px;opacity:.85'>此标签页请保持打开，不要关闭。</span></div>"
  document.body.appendChild(_loginOverlay)
}
function hideLoginOverlay() {
  if (_loginOverlay) { _loginOverlay.remove(); _loginOverlay = null }
}
async function processPublish(raw: any) {
  var data = raw.platformData || raw  // ★ 解包
  logInfo("Start processing")
  var fileName = data.videoFileName || "video.mp4"

  showOverlay(PLATFORM, adapter)

  logInfo("Waiting for upload area...")
  var uploadReady = false
  for (var i = 0; i < 30; i++) {
    var state = adapter.detectState()
    if (state === "ERROR_LOGIN") {
      logInfo("Login page detected - waiting for user scan")
      updStatus(PLATFORM, TASK_ID, "waiting_login")
      showLoginOverlay()
      await new Promise(function () { })  // block forever; page will refresh after login
      return
    }
    if (state === "FORM_READY" || state === "WAITING_VIDEO" || state === "UPLOADING" || state === "PROCESSING") {
      uploadReady = true
      break
    }
    await sleep(1000)
  }
  if (!uploadReady) {
    logInfo("Upload area not detected, will try inject anyway")
  }

  // Video号: actively click upload trigger so wujie iframe creates the file input
  logInfo("Clicking upload trigger for shipinhao...")
  var clicked = clickShipinhaoUpload()
  if (clicked) {
    logInfo("Waiting for file input to appear...")
    var hasInput = await waitForFileInput(15000)
    logInfo("File input after click: " + (hasInput ? "yes" : "no"))
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

  // Immediate login check before doing anything
  if (adapter.detectState() === "ERROR_LOGIN") {
    logInfo("Login page detected at boot - waiting for user scan")
    showOverlay(PLATFORM, adapter)
    updStatus(PLATFORM, td.taskId, "waiting_login")
    showLoginOverlay()
    return
  }

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
