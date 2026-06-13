import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.douyin.com/*","https://*.douyin.com/*"],
  run_at: "document_end"
}

const PLATFORM = "douyin"
const VERSION = "2.3.0"
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
      if (txt.indexOf("上传") >= 0 || txt.indexOf("选择视频") >= 0 || txt.indexOf("select") >= 0 || txt.indexOf("upload") >= 0) {
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

// ===== Upload Detection =====
function isUploadStarted(fileName) {
  var text = document.body.innerText || ""
  var keywords = ["上传中", "上传完成", "上传进度", "解析中", "转码中", "视频处理中", "processing", fileName]
  for (var i = 0; i < keywords.length; i++) {
    if (text.indexOf(keywords[i]) >= 0) return true
  }
  // Only text-based detection
  return false
}

function isUploadComplete() {
  var text = document.body.innerText || ""
  if (text.indexOf("上传完成") >= 0 || text.indexOf("upload complete") >= 0 || text.indexOf("upload success") >= 0) return true
  // Only trust blob: video elements
  var v = document.querySelector("video[src]")
  if (v && v.src && v.src.indexOf("blob:") === 0) return true
  return false
}

async function waitForUpload(fileName, timeout) {
  timeout = timeout || 600000
  logInfo("Waiting for upload...")
  while (timeout > 0) {
    if (isUploadStarted(fileName)) {
      logOk("Upload started")
      var extra = 60000
      while (extra > 0) {
        if (isUploadComplete()) {
          await sleep(3000)
          logOk("Upload complete")
          return true
        }
        await sleep(1000)
        extra -= 1000
      }
      logInfo("Upload did not confirm completion within 60s, continuing...")
      return true
    }
    await sleep(1000)
    timeout -= 1000
  }
  logFail("Upload timeout")
  return false
}

// ===== Overlay (show when waiting for manual upload) =====
var _overlay = null
function showOverlay(fileName) {
  if (_overlay) return
  _overlay = document.createElement("div")
  _overlay.id = "vp_overlay"
  _overlay.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999999;background:#1677ff;color:#fff;padding:8px 16px;font-size:13px;font-family:sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)"
  _overlay.innerHTML = "多平台发布助手 ["+PLATFORM+"]<br><span style='font-size:11px;opacity:0.9'>请手动选择视频文件："+fileName+"<br>检测到上传后自动填写标题、简介、标签</span>"
  document.body.prepend(_overlay)
}

function hideOverlay() {
  if (_overlay) { _overlay.remove(); _overlay = null }
}

function showFormFillStatus() {
  if (_overlay) _overlay.innerHTML = "多平台发布助手 ["+PLATFORM+"]<br><span style='font-size:11px;opacity:0.9'>正在填写标题、简介、标签...</span>"
}

// ===== Fill Form (platform specific - replaced per platform) =====

async function fillForm(title, descText, tags) {
  logInfo("Filling...")
  if(title){var s=["input[placeholder*=\"标题\"]","input:not([type=file]):not([type=hidden])"];for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(el&&el.type!=="file"&&el.type!=="hidden"){if(setNativeValue(el,title)){logOk("Title: OK");break}}}}
  if(descText){var s=["textarea[placeholder*=\"简介\"]","textarea[placeholder*=\"描述\"]","div[contenteditable=true]","[contenteditable=\"true\"]","textarea"];for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(!el)continue;if(el.tagName==="TEXTAREA"){if(setNativeValue(el,descText)){logOk("Desc: OK");break}}else if(el.getAttribute("contenteditable")==="true"){if(setCE(el,descText)){logOk("Desc: OK");break}}}}
  if(tags&&tags.length>0){var n=normalizeTags(tags),ts=n.join(" ");var s=["input[placeholder*=\"话题\"]"];var ok=false;for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(el&&setNativeValue(el,ts)){el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));ok=true;logOk("Tags: "+ts);break}}if(!ok){var ds=["textarea","div[contenteditable=true]","[contenteditable=\"true\"]"];for(var i=0;i<ds.length;i++){var el=document.querySelector(ds[i]);if(!el)continue;var cur=el.tagName==="TEXTAREA"?el.value:el.innerText;if(cur){var nv=cur+"\n"+ts;if(el.tagName==="TEXTAREA"){setNativeValue(el,nv)}else{setCE(el,nv)};logOk("Tags: appended");ok=true;break}}}if(!ok)logFail("Tags: not filled")}
  logInfo("Done")
}


// ===== Main Process =====
async function processPublish(data) {
  logInfo("Start")
  var fileName = data.videoFileName || "video.mp4"
  
  // Step 1: Try auto inject
  var autoOk = false
  if (data.videoStorageKey) {
    var du = await loadVideo(data.videoStorageKey)
    if (du) autoOk = await tryInjectVideo(du, fileName)
  }
  
  // Step 2: If auto failed, show overlay and wait for manual
  if (!autoOk) {
    showOverlay(fileName)
    logInfo("Waiting for manual upload...")
    await sleep(3000) // give user time
  } else {
    logInfo("Auto injected, waiting for upload...")
  }
  
  // Step 3: Wait for upload
  var uploadOk = await waitForUpload(fileName, autoOk ? 120000 : 600000)
  hideOverlay()
  
  if (!uploadOk) {
    logFail("Upload timeout")
    return
  }
  
  await sleep(3000)
  
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
