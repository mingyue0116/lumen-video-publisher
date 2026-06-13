import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://twitter.com/*","https://x.com/*"],
  run_at: "document_end"
}

const PLATFORM = "twitter"
const VERSION = "2.1.0"

// ===== Utilities =====
function logInfo(m) { console.log("["+PLATFORM+"] [INFO]",m); sendS("[INFO] "+m) }
function logOk(m) { console.log("["+PLATFORM+"] [OK]",m); sendS("[OK] "+m) }
function logFail(m) { console.log("["+PLATFORM+"] [FAIL]",m); sendS("[FAIL] "+m) }
function sendS(m) { chrome.runtime.sendMessage({action:"STATUS",platform:PLATFORM,message:m}).catch(function(){}) }

function sleep(ms) { return new Promise(function(r){setTimeout(r,ms)}) }

function waitForElement(sel,to) {
  to=to||25000; return new Promise(function(resolve) {
    var el=document.querySelector(sel)
    if(el){resolve(el);return}
    var iv=setInterval(function(){el=document.querySelector(sel);if(el){clearInterval(iv);resolve(el);return}
    to-=500;if(to<=0){clearInterval(iv);resolve(null)}},500)
  })
}

function setNativeValue(el,v) {
  try {
    var p=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(p,"value").set.call(el,v)
    el.dispatchEvent(new Event("input",{bubbles:true}))
    el.dispatchEvent(new Event("change",{bubbles:true}))
    return true
  } catch(e) { try{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));return true}catch(e2){return false} }
}

function setCE(el,v) {
  try {
    el.focus();var sel=window.getSelection()
    if(!sel)return false
    var r=document.createRange();r.selectNodeContents(el)
    sel.removeAllRanges();sel.addRange(r)
    document.execCommand("insertText",false,v)
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))
    return true
  } catch(e) { try{el.innerText=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true}catch(e2){return false} }
}

function normalizeTags(t) {
  var r=[]
  for(var i=0;i<t.length;i++){var tag=(t[i]||"").trim();if(!tag)continue;if(tag.indexOf("#")!==0)tag="#"+tag;r.push(tag)}
  return r
}

async function loadVideo(k) {
  try {
    var d=await new Promise(function(resolve){chrome.storage.local.get([k],function(r){if(chrome.runtime.lastError){resolve(null);return};resolve(r[k]||null)})})
    if(!d||!d.dataUrl){logFail("No video");return null}
    logInfo("Video: "+(d.dataUrl.length/1024/1024).toFixed(1)+"MB")
    return d.dataUrl
  } catch(e){logFail("Load: "+e.message);return null}
}

async function injectVideo(fi,du,fn) {
  try {
    var r=await fetch(du);var b=await r.blob();var f=new File([b],fn||"video.mp4",{type:b.type||"video/mp4"})
    logInfo("File: "+(f.size/1024/1024).toFixed(1)+"MB")
    var dt=new DataTransfer();dt.items.add(f)
    Object.defineProperty(fi,"files",{get:function(){return dt.files},configurable:true})
    fi.dispatchEvent(new Event("change",{bubbles:true}))
    await sleep(200)
    fi.dispatchEvent(new Event("input",{bubbles:true}))
    await sleep(200)
    fi.dispatchEvent(new Event("change",{bubbles:true}))
    logOk("Video injected");return true
  } catch(e){logFail("Inject: "+e.message);return false}
}

async function findAndInjectVideo(du,fn) {
  var fi=await waitForElement("input[type=file]")
  if(!fi){logFail("No file input");return false}
  logInfo("File input found")
  return await injectVideo(fi,du,fn)
}

var _hb=null
function startHB() {
  _hb=setInterval(function(){chrome.runtime.sendMessage({action:"HEARTBEAT",platform:PLATFORM,url:location.href}).catch(function(){})},5000)
}
function stopHB() { if(_hb){clearInterval(_hb);_hb=null} }

async function claimTask(n) {
  n=n||20
  for(var i=0;i<n;i++){
    try {
      var r=await new Promise(function(resolve){chrome.runtime.sendMessage({action:"CLAIM_TASK",platform:PLATFORM},function(resp){if(chrome.runtime.lastError){resolve({ok:false});return};resolve(resp||{ok:false})})})
      if(r&&r.ok){logOk("Claimed!");return r.platformData}
    } catch(e){}
    await sleep(1000)
  }
  logFail("No task after "+n+" attempts");return null
}

async function updStatus(tid,st,err) {
  chrome.runtime.sendMessage({action:"UPDATE_TASK_STATUS",taskId:tid,platform:PLATFORM,status:st,error:err||""}).catch(function(){})
}

async function fillForm(title, descText, tags) {
  logInfo("Filling twitter...")
  var tweetText=descText||title||""
  var n=normalizeTags(tags||[])
  if(n.length>0){tweetText+=(tweetText?"\n":"")+n.join(" ")}
  if(tweetText){
    var s=["div[data-testid=tweetTextarea_0]","div[role=textbox][contenteditable=true]","div[role=textbox]"]
    var ok=false
    for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(el&&setCE(el,tweetText)){ok=true;logOk("Tweet: OK");break}}
    if(!ok)logFail("Tweet: not found")
  }
  logInfo("Form done")
}


async function processPublish(data) {
  logInfo("Publishing...")
  var du=null
  if(data.videoStorageKey){du=await loadVideo(data.videoStorageKey)}
  if(!du){logFail("No video");return}
  await sleep(2000)
  var vok=await findAndInjectVideo(du,data.videoFileName||"video.mp4")
  if(!vok){logFail("Video failed");return}
  await sleep(2000)
  logInfo("Waiting upload...")
  var s=["video[src]","video","[data-testid=videoPlayer]"]
  var upOk=await new Promise(function(resolve){var iv=setInterval(function(){for(var i=0;i<s.length;i++){if(document.querySelector(s[i])){clearInterval(iv);resolve(true);return}};setTimeout(function(){clearInterval(iv);resolve(false)},120000)},1000)})
  if(!upOk){logFail("Upload timeout");return}
  await sleep(2000)
  logOk("Upload done")
  var descText=data.content||""
  await fillForm(data.title||"",descText,data.tags||[])
  logOk("Publish complete!")
}


startHB()
logInfo("Script ready, claiming...")
claimTask(20).then(function(td){if(!td){logInfo("No task");return}
  updStatus(td.taskId,"filling")
  processPublish(td).then(function(){updStatus(td.taskId,"done");stopHB()}).catch(function(e){logFail("Error: "+e.message);updStatus(td.taskId,"error",e.message)})
}).catch(function(e){logFail("Boot: "+e.message)})
