// ===== Video Publisher Shared Utils - v3.2.0 =====
// 跨平台共享的视频注入和表单填充工具函数
// v3.2: 视频字节由 sidepanel 分块上传到 background 内存，再用 CDP
//       DOM.setFileInputFiles 的 contents 参数按 nodeId 注入真实字节

export const VERSION = "3.2.1"

export function sleep(ms: number) {
  return new Promise<void>(function (r) { setTimeout(r, ms) })
}

export function waitForElement(sel: string, timeout?: number): Promise<Element | null> {
  timeout = timeout || 25000
  return new Promise(function (resolve) {
    var el = document.querySelector(sel)
    if (el) { resolve(el); return }
    var iv = setInterval(function () {
      el = document.querySelector(sel)
      if (el) { clearInterval(iv); resolve(el); return }
      timeout! -= 500
      if (timeout! <= 0) { clearInterval(iv); resolve(null) }
    }, 500)
  })
}

export function waitForElementsAny(sels: string[], timeout?: number): Promise<Element | null> {
  timeout = timeout || 25000
  return new Promise(function (resolve) {
    function check() {
      for (var i = 0; i < sels.length; i++) {
        var el = document.querySelector(sels[i])
        if (el) return el
      }
      return null
    }
    var el = check()
    if (el) { resolve(el); return }
    var iv = setInterval(function () {
      var el = check()
      if (el) { clearInterval(iv); resolve(el); return }
      timeout! -= 500
      if (timeout! <= 0) { clearInterval(iv); resolve(null) }
    }, 500)
  })
}

export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  // ★ v3.1.4: 使用元素所属文档的原型, 解决 iframe 跨域问题
  var doc = el.ownerDocument
  try {
    var proto = (el.tagName === "TEXTAREA"
      ? (doc.defaultView as any)?.HTMLTextAreaElement?.prototype
      : (doc.defaultView as any)?.HTMLInputElement?.prototype) || HTMLTextAreaElement.prototype
    var d = Object.getOwnPropertyDescriptor(proto, "value")
    if (d && d.set) {
      d.set.call(el, v)
    } else {
      el.value = v
    }
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  } catch (e) {
    try {
      el.value = v
      el.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    } catch (e2) {
      return false
    }
  }
}

export function setCE(el: HTMLElement, v: string) {
  // ★ v3.1.4: 使用元素所属文档的 window/document, 支持 iframe 内的 contenteditable
  var doc = el.ownerDocument
  var win = (doc.defaultView || window) as Window & typeof globalThis
  try {
    el.focus()
    var sel = win.getSelection()
    if (!sel) { setCE_Fallback(el, v); return true }
    var r = doc.createRange()
    r.selectNodeContents(el)
    sel.removeAllRanges()
    sel.addRange(r)
    try {
      doc.execCommand("insertText", false, v)
    } catch (e2) {
      // execCommand often fails in iframes; fallback to innerText
      setCE_Fallback(el, v)
    }
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  } catch (e) {
    setCE_Fallback(el, v)
    return true
  }
}
function setCE_Fallback(el: HTMLElement, v: string) {
  try {
    el.innerText = v
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  } catch (e2) { /* silent */ }
}

export function normalizeTags(t: string[]) {
  var r: string[] = []
  for (var i = 0; i < t.length; i++) {
    var tag = (t[i] || "").trim()
    if (!tag) continue
    if (tag.indexOf("#") !== 0) tag = "#" + tag
    r.push(tag)
  }
  return r
}

export function isElementEditable(el: Element | null): boolean {
  if (!el) return false
  try {
    var style = window.getComputedStyle(el as HTMLElement)
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false
    var inp = el as HTMLInputElement
    if (inp.disabled || inp.readOnly) return false
    var rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    return true
  } catch (e) { return false }
}

export function deepQuerySelector(sel: string, root?: Document | ShadowRoot | Element): Element | null {
  root = root || document
  var found = (root as Document).querySelector(sel)
  if (found) return found
  var all = root.querySelectorAll("*")
  for (var i = 0; i < all.length; i++) {
    if ((all[i] as any).shadowRoot) {
      var f = deepQuerySelector(sel, (all[i] as any).shadowRoot)
      if (f) return f
    }
  }
  return null
}

export function deepQuerySelectorAll(sel: string, root?: Document | ShadowRoot | Element): Element[] {
  root = root || document
  var results: Element[] = []
  var found = root.querySelectorAll(sel)
  for (var i = 0; i < found.length; i++) results.push(found[i])
  var all = root.querySelectorAll("*")
  for (var i = 0; i < all.length; i++) {
    if ((all[i] as any).shadowRoot) {
      var sub = deepQuerySelectorAll(sel, (all[i] as any).shadowRoot)
      for (var j = 0; j < sub.length; j++) results.push(sub[j])
    }
  }
  return results
}

// ===== Cross-frame element finder =====
export function findElementInAllFrames(sel: string): Element | null {
  var el = deepQuerySelector(sel)
  if (el) return el
  var frames = document.querySelectorAll("iframe")
  for (var f = 0; f < frames.length; f++) {
    try {
      var frameDoc = frames[f].contentDocument || (frames[f] as any).contentWindow?.document
      if (!frameDoc) continue
      el = frameDoc.querySelector(sel)
      if (el) return el
    } catch (e) { }
  }
  return null
}

// ===== Click upload trigger to reveal file input =====
export async function clickUploadTrigger(): Promise<boolean> {
  var keywords = ["上传视频", "选择视频", "upload", "select video", "上传", "发布视频", "拖拽视频", "点击上传", "choose file"]
  var selectors = [
    "button", "div", "span", "a", "label",
    "[class*=upload]", "[class*=Upload]",
    "[class*=publish]", "[class*=Publish]"
  ]

  for (var s = 0; s < selectors.length; s++) {
    var els = document.querySelectorAll(selectors[s])
    for (var i = 0; i < els.length; i++) {
      var el = els[i] as HTMLElement
      var txt = (el.innerText || el.textContent || "").toLowerCase().trim()
      if (!txt) continue
      for (var k = 0; k < keywords.length; k++) {
        if (txt.indexOf(keywords[k].toLowerCase()) >= 0) {
          try {
            el.click()
            el.dispatchEvent(new Event("click", { bubbles: true }))
            return true
          } catch (e) { }
        }
      }
    }
  }
  return false
}

// ===== CDP-based file injection (v2.8 - 直接文件路径，无需 dataUrl) =====
// Background 持有视频的本地绝对路径，Content Script 只需触发
export async function injectVideoViaCDP(
  taskId: string,
  fileName: string,
  fileType: string
): Promise<boolean> {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage({
      action: "INJECT_VIDEO_CDP",
      taskId: taskId,
      fileName: fileName,
      fileType: fileType
    }, function (resp) {
      if (chrome.runtime.lastError) {
        logInfo("CDP injection failed: " + chrome.runtime.lastError.message)
        resolve(false)
        return
      }
      if (resp && resp.success) {
        logOk("CDP injection succeeded")
        resolve(true)
      } else {
        logInfo("CDP injection failed: " + (resp && resp.error))
        resolve(false)
      }
    })
  })
}

// ===== Main video injection entry point (v3.2 — 字节注入) =====
// Background 从内存 store 拼出完整 base64，用 CDP DOM.setFileInputFiles contents 注入
export async function injectVideoToInput(
  taskId: string,
  fileName: string,
  fileType: string
): Promise<boolean> {
  try {
    logInfo("Trying CDP contents injection...")
    var cdpSuccess = await injectVideoViaCDP(taskId, fileName, fileType)
    if (cdpSuccess) {
      // 只信任 CDP 的 success 返回；不再用页面文本"上传中"判定（太不可靠，多平台文案各异）
      logOk("CDP injection completed")
      return true
    }

    logFail("CDP injection failed")
    return false
  } catch (e: any) {
    logFail("Video injection error: " + e.message)
    return false
  }
}

// ===== Logger stubs =====
export var logInfo = function (m: string) { console.log("[VP]", m) }
export var logOk = function (m: string) { console.log("[VP] OK", m) }
export var logFail = function (m: string) { console.log("[VP] FAIL", m) }
export var sendS = function (m: string, t: string) {
  chrome.runtime.sendMessage({ action: "STATUS", message: "[" + t + "] " + m }).catch(function () { })
}

export function setLogger(li: typeof logInfo, lo: typeof logOk, lf: typeof logFail, ss: typeof sendS) {
  logInfo = li; logOk = lo; logFail = lf; sendS = ss
}

// ===== State Detection =====
export interface Adapter {
  findTitleInput(): Element | null
  findDescInput(): Element | null
  isFormReady(): boolean
  detectState(): string
  diagnose(): any
}

export function createDefaultAdapter(platform: string): Adapter {
  return {
    findTitleInput: function () {
      return deepQuerySelector('input[placeholder*="标题"], textarea[placeholder*="标题"], input[placeholder*="title"], input[placeholder*="Title"]')
    },
    findDescInput: function () {
      return deepQuerySelector('textarea[placeholder*="简介"], textarea[placeholder*="描述"], div[contenteditable=true], [contenteditable="true"]')
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
        fileInputCount: deepQuerySelectorAll('input[type=file]').length,
        signals: {
          uploading: /上传中|正在上传/.test(text),
          processing: /处理中|解析中|转码中/.test(text),
          waitingUpload: /上传视频|选择视频|点击上传|请先上传/.test(text)
        }
      }
    }
  }
}

export async function waitForFormReady(adapter: Adapter, timeout?: number): Promise<boolean> {
  timeout = timeout || 900000
  return new Promise(function (resolve) {
    var observer = new MutationObserver(function () {
      if (adapter.isFormReady()) { cleanup(); resolve(true) }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })
    var timer = setInterval(function () {
      timeout! -= 1000
      if (timeout! <= 0) { cleanup(); logFail("Form not ready within timeout"); resolve(false); return }
      if (adapter.isFormReady()) { cleanup(); resolve(true); return }
    }, 1000)
    function cleanup() { observer.disconnect(); clearInterval(timer) }
    if (adapter.isFormReady()) { cleanup(); resolve(true) }
  })
}

// ===== Overlay =====


var _overlay = null

function _t(codes) { var r=[]; for(var i=0;i<codes.length;i++) r[i]=String.fromCharCode(codes[i]); return r.join("") }
var _L = {
  title: _t([22810,24179,21488,24179,21457,24067,24161,21161]),
  manual: _t([35831,25163,21160,36873,25345,35270,39057,25991,20214,19978,20256]),
  autoFill: _t([31561,24453,34920,21333,23601,32467,21518,23558,21160,21160,22635,20889]),
  status: _t([29366,24577]),
  ttl: _t([26631,31616]),
  desc: _t([25551,36848]),
  fr: _t([34920,21333,21487,32534,36753]),
  uploading: _t([19978,20256,20013]),
  processing: _t([22788,29702,20013]),
  waitVideo: _t([31561,24453,35270,39057,19978,20256]),
}

export function showOverlay(platform: string, adapter: Adapter, extra?: string) {
  if (_overlay) return
  _overlay = document.createElement("div")
  _overlay.id = "vp_overlay"
  _overlay.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999999;background:#1677ff;color:#fff;padding:8px 16px;font-size:13px;font-family:sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)"
  _overlay.innerHTML = "<b>" + _L.title + " [" + platform + "]</b><br>" +
    "<span id='vp_state' style='font-size:12px'>" + _L.waitVideo + "</span><br>" +
    "<span id='vp_info' style='font-size:11px;opacity:0.9'>" + _L.manual + "</span>"
  document.body.prepend(_overlay)
  ;(_overlay as any)._timer = setInterval(function () {
    if (!_overlay) return
    var d = adapter.diagnose()
    var st = _overlay.querySelector("#vp_state")
    var info = _overlay.querySelector("#vp_info")
    if (!st) return
    var stateLabels = {FORM_READY: _L.fr, UPLOADING: _L.uploading, PROCESSING: _L.processing, WAITING_VIDEO: _L.waitVideo, ERROR_LOGIN: "need login", UNKNOWN: "unknown"}
    st.textContent = _L.status + ": " + (stateLabels[d.state] || d.state)
    st.textContent += " | " + _L.ttl + ":" + (d.titleEditable ? "OK" : "--")
    st.textContent += " " + _L.desc + ":" + (d.descEditable ? "OK" : "--")
    if (d.state === "FORM_READY") {
      if (info) info.textContent = _L.autoFill
    } else if (d.state === "WAITING_VIDEO") {
      if (info) info.innerHTML = _L.manual + "<br><span style='font-size:10px;opacity:0.7'>files:" + d.fileInputCount + " iframes:" + d.iframeCount + "</span>"
    } else {
      if (info && extra) info.textContent = extra
    }
  }, 2000)
}

export function hideOverlay() {
  if (_overlay) {
    if ((_overlay as any)._timer) clearInterval((_overlay as any)._timer)
    _overlay.remove()
    _overlay = null
  }
}

export function showFormFillStatus(platform: string) {
  if (_overlay) {
    var st = _overlay.querySelector("#vp_state")
    if (st) st.textContent = _L.autoFill
  }
}
export function setOverlayExtra(msg: string) {
  // Call again with extra info
}

// ===== Heartbeat + Task Claim =====
export function startHB(platform: string) {
  return setInterval(function () {
    chrome.runtime.sendMessage({ action: "HEARTBEAT", platform: platform, url: location.href }).catch(function () { })
  }, 5000)
}

export function stopHB(timer: ReturnType<typeof setInterval> | null) {
  if (timer) { clearInterval(timer); timer = null }
}

export async function claimTask(platform: string, n?: number): Promise<any> {
  n = n || 20
  for (var i = 0; i < n; i++) {
    try {
      var r = await new Promise<any>(function (resolve) {
        chrome.runtime.sendMessage({ action: "CLAIM_TASK", platform: platform }, function (resp) {
          if (chrome.runtime.lastError) { resolve({ ok: false }) } else { resolve(resp || { ok: false }) }
        })
      })
      if (r && r.ok) return r
    } catch (e) { }
    await sleep(1000)
  }
  return null
}

export async function updStatus(platform: string, taskId: string, status: string, error?: string) {
  chrome.runtime.sendMessage({
    action: "UPDATE_TASK_STATUS",
    taskId: taskId,
    platform: platform,
    status: status,
    error: error || ""
  }).catch(function () { })
}
