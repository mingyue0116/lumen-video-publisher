import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.douyin.com/*", "https://*.douyin.com/*"],
  run_at: "document_start"
}

function sendStatus(msg: string) {
  chrome.runtime.sendMessage({ action: "STATUS", platform: "douyin", message: msg }).catch(() => {})
  console.log("[Douyin] " + msg)
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// Read published data from chrome.storage.local (bypasses 64MB message limit)
async function readStorageData(storageKey: string): Promise<any> {
  return new Promise(function(resolve) {
    chrome.storage.local.get([storageKey], function(result) {
      if (chrome.runtime.lastError) {
        console.error("[Douyin] storage read error:", chrome.runtime.lastError)
        resolve(null)
        return
      }
      if (result && result[storageKey]) {
        var data = result[storageKey]
        chrome.storage.local.remove(storageKey, function() {})
        resolve(data)
      } else {
        resolve(null)
      }
    })
  })
}

// Try to fetch video from blob URL (same extension origin, no 64MB limit)
async function fetchVideoFromBlob(blobUrl: string, fileName: string, fileType: string): Promise<File | null> {
  try {
    var resp = await fetch(blobUrl)
    var blob = await resp.blob()
    var file = new File([blob], fileName || "video.mp4", { type: fileType || blob.type || "video/mp4" })
    sendStatus("Fetched video from blob URL: " + file.name + " (" + (file.size / 1024 / 1024).toFixed(1) + "MB)")
    return file
  } catch(e: any) {
    sendStatus("Blob URL fetch failed: " + e.message)
    return null
  }
}

// ===== ISOLATED world form filling (avoids dependency on MAIN world) =====
function fillTitle(title: string): boolean {
  if (!title) return false
  sendStatus("Filling title...")
  var inputs = document.querySelectorAll("input")
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i] as HTMLInputElement
    var ph = (inp.placeholder || "").toLowerCase()
    if ((ph.indexOf("标题") >= 0 || ph.indexOf("title") >= 0 || ph.indexOf("输入视频") >= 0) && inp.type !== "hidden" && inp.type !== "file") {
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
        setter!.call(inp, title)
        inp.dispatchEvent(new Event("input", { bubbles: true }))
        inp.dispatchEvent(new Event("change", { bubbles: true }))
        sendStatus("Title filled")
        return true
      } catch(e: any) {}
    }
  }
  // Fallback: first visible non-file input
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i] as HTMLInputElement
    if (inp.type !== "file" && inp.type !== "hidden" && inp.offsetParent !== null) {
      try {
        inp.focus()
        inp.value = title
        inp.dispatchEvent(new Event("input", { bubbles: true }))
        inp.dispatchEvent(new Event("change", { bubbles: true }))
        sendStatus("Title filled (fallback)")
        return true
      } catch(e: any) {}
    }
  }
  sendStatus("No title input found")
  return false
}

function fillDescription(descText: string): boolean {
  if (!descText) return false
  sendStatus("Filling description...")
  // Try contenteditable
  var editors = document.querySelectorAll("[contenteditable=true]")
  for (var i = 0; i < editors.length; i++) {
    try {
      editors[i].focus()
      var sel = window.getSelection()
      if (sel) {
        var rng = document.createRange()
        rng.selectNodeContents(editors[i])
        sel.removeAllRanges()
        sel.addRange(rng)
        document.execCommand("insertText", false, descText)
        editors[i].dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("Description filled")
        return true
      }
    } catch(e: any) {}
  }
  // Try textarea
  var textareas = document.querySelectorAll("textarea")
  for (var i = 0; i < textareas.length; i++) {
    try {
      textareas[i].focus()
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set
      setter!.call(textareas[i], descText)
      textareas[i].dispatchEvent(new Event("input", { bubbles: true }))
      textareas[i].dispatchEvent(new Event("change", { bubbles: true }))
      sendStatus("Description filled (textarea)")
      return true
    } catch(e: any) {}
  }
  sendStatus("No description field found")
  return false
}

// ===== Inject file directly into page =====
async function injectFileDirectly(file: File): Promise<boolean> {
  var inputs = document.querySelectorAll("input[type=file]")
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i] as HTMLInputElement
    try {
      var dt = new DataTransfer()
      dt.items.add(file)
      Object.defineProperty(inp, "files", {
        get: function() { return dt.files },
        configurable: true
      })
      inp.dispatchEvent(new Event("change", { bubbles: true }))
      inp.dispatchEvent(new Event("input", { bubbles: true }))
      sendStatus("Video injected directly into file input")
      return true
    } catch(e) {}
  }
  return false
}

// Direct file injection into page DOM (for specific accept types)
async function injectFile(file: File, acceptType: string): Promise<boolean> {
  var inputs = document.querySelectorAll("input[type=file]")
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i] as HTMLInputElement
    if (inp.accept && inp.accept.indexOf(acceptType) >= 0) {
      try {
        var dt = new DataTransfer()
        dt.items.add(file)
        Object.defineProperty(inp, "files", {
          get: function() { return dt.files },
          configurable: true
        })
        inp.dispatchEvent(new Event("change", { bubbles: true }))
        inp.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("File injected via existing input")
        return true
      } catch(e) {
        sendStatus("Direct injection failed: " + e)
      }
    }
  }
  try {
    var input = document.createElement("input") as HTMLInputElement
    input.type = "file"
    input.accept = acceptType
    input.style.display = "none"
    document.body.appendChild(input)
    var dt = new DataTransfer()
    dt.items.add(file)
    Object.defineProperty(input, "files", {
      get: function() { return dt.files },
      configurable: true
    })
    input.dispatchEvent(new Event("change", { bubbles: true }))
    input.dispatchEvent(new Event("input", { bubbles: true }))
    sendStatus("File injected via created input")
    return true
  } catch(e) {
    sendStatus("Created input failed: " + e)
  }
  return false
}

// Try drag-and-drop simulation
async function tryDragDrop(file: File): Promise<boolean> {
  var sels = ["[class*=upload]", "[class*=Upload]", "[class*=dragger]", "[class*=video-upload]", "[class*=container]", "div[class*=zone]", "div[class*=drop]"]
  for (var s = 0; s < sels.length; s++) {
    var els = document.querySelectorAll(sels[s])
    for (var e = 0; e < els.length; e++) {
      var rect = els[e].getBoundingClientRect()
      if (rect.width > 100 && rect.height > 50) {
        var dt = new DataTransfer()
        dt.items.add(file)
        els[e].dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }))
        els[e].dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }))
        var result = els[e].dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }))
        if (result) { sendStatus("Drag-drop OK: " + sels[s]); return true }
      }
    }
  }
  return false
}

// Monkey-patch createElement
var origCE = document.createElement.bind(document)
;(document as any).createElement = function(tag: string, opts?: any) {
  var el = origCE(tag, opts) as HTMLInputElement
  if (tag.toLowerCase() === "input") {
    var origClick = el.click.bind(el)
    el.click = function() {
      if (el.type === "file") {
        origClick()
      }
    }
  }
  return el
}

// ===== Handle form fill (title + description + tags) in ISOLATED world =====
async function handleFormFill(data: any): Promise<void> {
  // Fill title
  fillTitle(data.title || "")
  await delay(1000)

  // Build description with tags - EACH tag gets # prefix
  var descText = data.content || ""
  if (data.tags && data.tags.length > 0) {
    var tagStr = ""
    for (var t = 0; t < data.tags.length; t++) {
      tagStr += " #" + data.tags[t]
    }
    descText += descText ? "\n" + tagStr.trim() : tagStr.trim()
  }

  // Fill description
  if (descText) {
    fillDescription(descText)
  }

  sendStatus("Form filled in ISOLATED world")
}

// ===== Main flow =====
async function processPublish(data: any): Promise<void> {
  sendStatus("Received publish data")

  // Priority 1: Try blob URL first (no 64MB limit, no atob corruption)
  if (data.videoBlobUrl) {
    var file = await fetchVideoFromBlob(data.videoBlobUrl, data.videoName, data.videoType)
    if (file) {
      var injected = await injectFileDirectly(file)
      if (injected) {
        sendStatus("Video injected via blob URL")
        await delay(3000)
        await handleFormFill(data)
        await delay(3000)
        sendStatus("All done!")
        return true
      }
      sendStatus("Direct injection via blob URL failed, trying storage...")
    }
  }

  // Priority 2: Read video data from storage
  var videoDataUrl: string | null = null
  var videoName = "video.mp4"
  var videoType = "video/mp4"

  if (data.videoStorageKey) {
    sendStatus("Reading video data from storage...")
    var storageData = await readStorageData(data.videoStorageKey)
    if (storageData && storageData.videoDataUrl) {
      videoDataUrl = storageData.videoDataUrl
      videoName = storageData.videoName || "video.mp4"
      videoType = storageData.videoType || "video/mp4"
      if (!data.title && storageData.title) data.title = storageData.title
      if (!data.content && storageData.content) data.content = storageData.content
      if (!data.tags && storageData.tags) data.tags = storageData.tags
    }
  } else if (data.videoDataUrl) {
    videoDataUrl = data.videoDataUrl
    videoName = data.videoName || "video.mp4"
    videoType = data.videoType || "video/mp4"
  }

  if (videoDataUrl) {
    sendStatus("dataUrl ready (" + (videoDataUrl.length / 1024 / 1024).toFixed(1) + "MB)")

    // Send dataUrl to MAIN world via postMessage for file injection
    sendStatus("Sending to MAIN world via postMessage...")
    window.postMessage({
      source: "VIDEO_PUBLISHER_EXTENSION",
      action: "INJECT_VIDEO",
      platform: "douyin",
      data: {
        dataUrl: videoDataUrl,
        fileName: videoName,
        fileType: videoType
      }
    }, window.location.origin)

    sendStatus("Video data sent to MAIN world, waiting for injection...")
    await delay(5000)
  } else {
    sendStatus("No video data received!")
    return false
  }

  // Fill form in ISOLATED world (not relying on MAIN world which may not have handler)
  await handleFormFill(data)
  await delay(3000)
  sendStatus("All done!")
  return true
}

// MAIN listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "douyin") return
  processPublish(msg.data).then((result) => {
    sendResponse({ received: true, success: result })
  }).catch((e) => {
    sendStatus("Error: " + e.message)
    sendResponse({ received: true, success: false })
  })
  return true // keep channel open for async response
})

// Forward STATUS from MAIN world
window.addEventListener("message", (ev) => {
  if (ev.data?.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data?.action === "STATUS") {
    chrome.runtime.sendMessage({ action: "STATUS", platform: "douyin", message: ev.data.message }).catch(() => {})
  }
})

sendStatus("Bridge ready")
