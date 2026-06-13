import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://member.bilibili.com/*","https://t.bilibili.com/*"],
  run_at: "document_end"
}

const PLATFORM = "bilibili"
const VERSION = "2.4.0"
var TASK_ID = ""

// ===== Logger =====
function logInfo(m) { console.log("["+PLATFORM+"]",m); sendS(m,"info") }
function logOk(m) { console.log("["+PLATFORM+"]",m); sendS(m,"ok") }
function logFail(m) { console.log("["+PLATFORM+"]",m); sendS(m,"fail") }
function sendS(m,t) { chrome.runtime.sendMessage({action:"STATUS",platform:PLATFORM,message:"["+t+"] "+m}).catch(function(){}) }

function sleep(ms) { return new Promise(function(r){setTimeout(r,ms)}) }

function waitForElement(sel,to) {
  to=to||25000; return new Promise(function(resolve) {
    var el=document.querySelector(sel); if(el){resolve(el);return}
    var iv=setInterval(function(){el=document.querySelector(sel);if(el){clearInterval(iv);resolve(el);return};to-=500;if(to<=0){clearInterval(iv);resolve(null)}},500)
  })
}

function setNativeValue(el,v) {
  try {
    var p=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(p,"value").set.call(el,v)
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))
    return true
  } catch(e){try{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));return true}catch(e2){return false}}
}

function setCE(el,v) {
  try {
    el.focus();var sel=window.getSelection();if(!sel)return false
    var r=document.createRange();r.selectNodeContents(el);sel.removeAllRanges();sel.addRange(r)
    document.execCommand("insertText",false,v)
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))
    return true
  } catch(e){try{el.innerText=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true}catch(e2){return false}}
}

function normalizeTags(t) {
  var r=[]; for(var i=0;i<t.length;i++){var tag=(t[i]||"").trim();if(!tag)continue;if(tag.indexOf("#")!==0)tag="#"+tag;r.push(tag)}
  return r
}

// ===== Video Injection (try auto, fallback to manual) =====
async function tryInjectVideo(dataUrl, fileName) {
  var fi = document.querySelector("input[type=file]")
  if (!fi) {
    // Click upload button first to reveal file input
    var btns = document.querySelectorAll("button, div, span")
    for (var i = 0; i < btns.length; i++) {
      var txt = (btns[i].innerText || "").toLowerCase()
      if (txt.indexOf("\u4e0a\u4f20") >= 0 || txt.indexOf("\u9009\u62e9\u89c6\u9891") >= 0 || txt.indexOf("select") >= 0 || txt.indexOf("upload") >= 0) {
        btns[i].click()
        await sleep(1000)
        fi = document.querySelector("input[type=file]")
        if (fi) break
      }
    }
  }
  if (!fi) { logInfo("No file input, will wait for manual"); return false }

  try {
    var r = await fetch(dataUrl)
    var blob = await r.blob()
    var file = new File([blob], fileName || "video.mp4", { type: blob.type || "video/mp4" })
    var dt = new DataTransfer(); dt.items.add(file)
    Object.defineProperty(fi, "files", { get: function() { return dt.files }, configurable: true })
    fi.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(200)
    fi.dispatchEvent(new Event("input", { bubbles: true }))
    await sleep(200)
    fi.dispatchEvent(new Event("change", { bubbles: true }))
    logOk("Auto inject video")
    return true
  } catch(e) { logInfo("Auto inject failed: "+e.message); return false }
}

async function loadVideo(k) {
  try {
    var d=await new Promise(function(r){chrome.storage.local.get([k],function(res){if(chrome.runtime.lastError){r(null);return};r(res[k]||null)})})
    if(!d||!d.dataUrl){return null}
    return d.dataUrl
  } catch(e){return null}
}

// ===== State Detection (FORM_READY based) =====
function isElementEditable(el) {
  if (!el) return false
  try {
    var style = window.getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false
    if (el.disabled || el.readOnly) return false
    var rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    return true
  } catch(e) { return false }
}

function deepQuerySelector(sel, root) {
  root = root || document
  var found = root.querySelector(sel)
  if (found) return found
  var all = root.querySelectorAll("*")
  for (var i = 0; i < all.length; i++) {
    if (all[i].shadowRoot) {
      var f = deepQuerySelector(sel, all[i].shadowRoot)
      if (f) return f
    }
  }
  return null
}

var adapter = {
  findTitleInput: function() { return deepQuerySelector("input[placeholder*=\"\u6807\u9898\"], textarea[placeholder*=\"\u6807\u9898\"], input[placeholder*=\"title\"]") },
  findDescInput: function() { return deepQuerySelector("textarea[placeholder*=\"\u7b80\u4ecb\"], textarea[placeholder*=\"\u63cf\u8ff0\"], div[contenteditable=true], [contenteditable=\"true\"]") },
  isFormReady: function() {
    var t = this.findTitleInput()
    return isElementEditable(t)
  },
  detectState: function() {
    var text = document.body.innerText || ""
    if (/\u767b\u5f55|\u8bf7\u767b\u5f55|\u5b89\u5168\u9a8c\u8bc1/.test(text)) return "ERROR_LOGIN"
    if (this.isFormReady()) return "FORM_READY"
    if (/\u4e0a\u4f20\u4e2d|\u6b63\u5728\u4e0a\u4f20/.test(text)) return "UPLOADING"
    if (/\u5904\u7406\u4e2d|\u89e3\u6790\u4e2d|\u8f6c\u7801\u4e2d/.test(text)) return "PROCESSING"
    if (/\u4e0a\u4f20\u89c6\u9891|\u9009\u62e9\u89c6\u9891|\u70b9\u51fb\u4e0a\u4f20|\u8bf7\u5148\u4e0a\u4f20/.test(text)) return "WAITING_VIDEO"
    return "UNKNOWN"
  },
  diagnose: function() {
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
        uploading: /\u4e0a\u4f20\u4e2d|\u6b63\u5728\u4e0a\u4f20/.test(text),
        processing: /\u5904\u7406\u4e2d|\u89e3\u6790\u4e2d|\u8f6c\u7801\u4e2d/.test(text),
        waitingUpload: /\u4e0a\u4f20\u89c6\u9891|\u9009\u62e9\u89c6\u9891|\u70b9\u51fb\u4e0a\u4f20|\u8bf7\u5148\u4e0a\u4f20/.test(text)
      }
    }
  }
}

async function waitForFormReady(timeout) {
  timeout = timeout || 900000
  logInfo("Waiting for form ready...")
  return new Promise(function(resolve) {
    var observer = new MutationObserver(function() {
      if (adapter.isFormReady()) { cleanup(); resolve(true) }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })
    var timer = setInterval(function() {
      timeout -= 1000
      if (timeout <= 0) { cleanup(); logFail("Form not ready within timeout"); resolve(false); return }
      if (adapter.isFormReady()) { cleanup(); resolve(true); return }
    }, 1000)
    function cleanup() { observer.disconnect(); clearInterval(timer) }
    if (adapter.isFormReady()) { cleanup(); resolve(true) }
  })
}

// ===== Diagnostic Overlay =====
var _overlay = null
function showOverlay() {
  if (_overlay) return
  _overlay = document.createElement("div")
  _overlay.id = "vp_overlay"
  _overlay.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999999;background:#1677ff;color:#fff;padding:8px 16px;font-size:13px;font-family:sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)"
  document.body.prepend(_overlay)
  _overlay._timer = setInterval(function() {
    if (!_overlay) return
    var d = adapter.diagnose()
    var sl = {FORM_READY:1,UPLOADING:2,PROCESSING:3,WAITING_VIDEO:4,ERROR_LOGIN:5,UNKNOWN:6}
    // Build text safely - no innerHTML with Chinese
    var txt = "mu" + "lti-pub [" + PLATFORM + "]"
    var st = ["","form ready","uploading","processing","wait video","need login","unknown"][sl[d.state]||6]
    txt += " | title:" + (d.titleEditable ? "ok" : "no")
    txt += " desc:" + (d.descEditable ? "ok" : "no")
    txt += " iframes:" + d.iframeCount
    _overlay.textContent = txt
    _overlay.style.fontSize = "11px"
  }, 2000)
}

function hideOverlay() {
  if (_overlay) {
    if (_overlay._timer) clearInterval(_overlay._timer)
    _overlay.remove()
    _overlay = null
  }
}

function showFormFillStatus() {
  if (_overlay) _overlay.textContent = "multi-pub ["+PLATFORM+"] filling form..."
}
// ===== Fill Form (platform specific - replaced per platform) =====

async function fillForm(title, descText, tags) {
  logInfo("Filling...")
  if(title){var s=["input[placeholder*=\"\u6807\u9898\"]","input:not([type=file]):not([type=hidden])"];for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(el&&el.type!=="file"&&el.type!=="hidden"){if(setNativeValue(el,title)){logOk("Title: OK");break}}}}
  if(descText){var s=["div[contenteditable=true]","[contenteditable=\"true\"]","textarea"];for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(!el)continue;if(el.tagName==="TEXTAREA"){if(setNativeValue(el,descText)){logOk("Desc: OK");break}}else if(el.getAttribute("contenteditable")==="true"){if(setCE(el,descText)){logOk("Desc: OK");break}}}}
  if(tags&&tags.length>0){var n=normalizeTags(tags);var bare=n.map(function(t){return t.indexOf("#")===0?t.slice(1):t});var s=["input[placeholder*=\"\u6807\u7b7e\"]"];var ok=false;for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(el&&setNativeValue(el,bare.join(","))){el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));await sleep(200);ok=true;logOk("Tags: OK");break}}if(!ok){var ds=["textarea","div[contenteditable=true]","[contenteditable=\"true\"]"];for(var i=0;i<ds.length;i++){var el=document.querySelector(ds[i]);if(!el)continue;var cur=el.tagName==="TEXTAREA"?el.value:el.innerText;if(cur){var nv=cur+"\n"+n.join(" ");if(el.tagName==="TEXTAREA"){setNativeValue(el,nv)}else{setCE(el,nv)};logOk("Tags: appended");ok=true;break}}}if(!ok)logFail("Tags: not filled")}
  logInfo("Done")
}


// ===== Main Process =====
async function processPublish(data) {
  logInfo("Start")
  var fileName = data.videoFileName || "video.mp4"
  
  // Step 1: Show diagnostic overlay
  showOverlay()
  
  // Step 2: Try auto inject (best-effort)
  if (data.videoStorageKey) {
    var du = await loadVideo(data.videoStorageKey)
    if (du) await tryInjectVideo(du, fileName)
  }
  
  // Step 3: Wait for FORM_READY (not upload complete!)
  logInfo("Waiting for form ready...")
  var ready = await waitForFormReady(900000)
  hideOverlay()
  
  if (!ready) {
    logFail("Form not ready within timeout")
    return
  }
  
  await sleep(2000)
  
  // Step 4: Fill form
  showFormFillStatus()
  var descText = data.content || ""
  await fillForm(data.title || "", descText, data.tags || [])
  
  logOk("Done")
}

// ===== Heartbeat + Task Claim =====
var _hb = null
function startHB() { _hb = setInterval(function(){chrome.runtime.sendMessage({action:"HEARTBEAT",platform:PLATFORM,url:location.href}).catch(function(){})},5000) }
function stopHB() { if(_hb){clearInterval(_hb);_hb=null} }

async function claimTask(n) {
  n=n||20
  for(var i=0;i<n;i++){
    try {
      var r = await new Promise(function(resolve){chrome.runtime.sendMessage({action:"CLAIM_TASK",platform:PLATFORM},function(resp){if(chrome.runtime.lastError){resolve({ok:false})}else{resolve(resp||{ok:false})}})})
      if(r&&r.ok){TASK_ID=r.taskId;return r.platformData}
    } catch(e){}
    await sleep(1000)
  }
  return null
}

async function updStatus(tid,st,err) {
  chrome.runtime.sendMessage({action:"UPDATE_TASK_STATUS",taskId:tid,platform:PLATFORM,status:st,error:err||""}).catch(function(){})
}

// ===== Boot =====
startHB()
logInfo("Ready")
claimTask(20).then(function(td){if(!td){logInfo("No task");return}
  updStatus(td.taskId,"filling")
  processPublish(td).then(function(){updStatus(td.taskId,"done");stopHB();hideOverlay()}).catch(function(e){logFail(e.message);updStatus(td.taskId,"error",e.message)})
}).catch(function(e){logFail("Boot: "+e.message)})
