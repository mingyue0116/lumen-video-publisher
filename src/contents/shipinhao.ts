import type { PlasmoCSConfig } from 'plasmo'

export const config: PlasmoCSConfig = {
  matches: ['https://channels.weixin.qq.com/*'],
  run_at: 'document_end'
}




// ===== Wujie micro-frontend helpers =====
// 视频号使用无界(Wujie)微前端，实际DOM在wujie-app的ShadowRoot内
function getRoot(): Document | ShadowRoot {
  var app = document.querySelector("wujie-app")
  if (app && (app as any).shadowRoot) {
    return (app as any).shadowRoot
  }
  return document
}

function qs(selector: string, root?: Document | ShadowRoot): Element | null {
  return (root || getRoot()).querySelector(selector)
}

function qsa(selector: string, root?: Document | ShadowRoot): NodeListOf<Element> {
  return (root || getRoot()).querySelectorAll(selector)
}

function sendStatus(msg: string) {
  chrome.runtime.sendMessage({ action: "STATUS", platform: "shipinhao", message: msg }).catch(() => {})
  console.log("[Shipinhao] " + msg)
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function injectVideoFile(file: File): Promise<boolean> {
  sendStatus("Looking for upload area...")
  await delay(2000)

  var fileInput = qs("input[type=file]")
  if (fileInput) {
    sendStatus("Found file input, injecting...")
    try {
      var dt = new DataTransfer()
      dt.items.add(file)
      Object.defineProperty(fileInput, "files", {
        get: function() { return dt.files },
        configurable: true
      })
      fileInput.dispatchEvent(new Event("change", { bubbles: true }))
      fileInput.dispatchEvent(new Event("input", { bubbles: true }))
      sendStatus("File injected: " + file.name)
      return true
    } catch(e: any) {
      sendStatus("Direct inject failed: " + e.message)
    }
  }

  var areas = qsa("[class*=upload], [class*=Upload], [class*=drop], [class*=Drag]")
  sendStatus("Found " + areas.length + " potential upload areas")

  for (var i = 0; i < areas.length; i++) {
    var area = areas[i] as HTMLElement
    var rect = area.getBoundingClientRect()
    if (rect.width > 100 && rect.height > 50) {
      area.click()
      await delay(2000)
      var newInput = qs("input[type=file]")
      if (newInput) {
        try {
          var dt = new DataTransfer()
          dt.items.add(file)
          Object.defineProperty(newInput, "files", {
        get: function() { return dt.files },
        configurable: true
      })
          newInput.dispatchEvent(new Event("change", { bubbles: true }))
          sendStatus("File injected after click")
          return true
        } catch(e: any) {}
      }
      try {
        var dt = new DataTransfer()
        dt.items.add(file)
        area.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }))
        area.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }))
        area.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }))
        sendStatus("Drag-drop OK")
        return true
      } catch(e2: any) {}
    }
  }

  sendStatus("All upload strategies failed")
  return false
}
function fillTitle(title: string): boolean {
  if (!title) return false
  sendStatus("Filling title...")

  var allInputs = qsa("input")
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var ph = (inp.placeholder || "").toLowerCase()
    var type = (inp.type || "").toLowerCase()
    if (ph.indexOf("标题") >= 0 || ph.indexOf("title") >= 0 || ph.indexOf("概括视频") >= 0 || ph.indexOf("主要内容") >= 0) {
      if (type !== "hidden" && type !== "file") {
        sendStatus("Found by placeholder")
        return setInputValue(inp, title)
      }
    }
  }

  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var type = (inp.type || "").toLowerCase()
    if ((type === "text" || type === "") && inp.offsetParent !== null) {
      sendStatus("First visible input")
      return setInputValue(inp, title)
    }
  }

  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var type = (inp.type || "").toLowerCase()
    if (type !== "file" && type !== "hidden" && type !== "submit" && type !== "button") {
      sendStatus("Fallback input")
      return setInputValue(inp, title)
    }
  }

  sendStatus("No title input found")
  return false
}

function setInputValue(inp: HTMLInputElement, value: string): boolean {
  try {
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
    setter!.call(inp, value)
    inp.dispatchEvent(new Event("input", { bubbles: true }))
    inp.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  } catch(e: any) {
    try {
      inp.value = value
      inp.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    } catch(e2: any) {}
  }
  return false
}
async function fillDescription(content: string, tags: string[]): Promise<boolean> {
  if (!content && (!tags || tags.length === 0)) return false
  var root = getRoot()
  sendStatus("Filling description + tags...")

  // Find description editor: div[data-placeholder="添加描述"]
  var descEditor = qs('div[data-placeholder="添加描述"]', root)
  sendStatus("Description editor: " + (descEditor ? "found" : "NOT found"))

  if (!descEditor) {
    // Fallback: any contenteditable
    descEditor = qs("div[contenteditable=true], [contenteditable=true]", root)
    sendStatus("Fallback editor: " + (descEditor ? "found" : "NOT found"))
  }

  if (!descEditor) {
    sendStatus("No editable description field found");
    // Try textarea as last resort
    var ta = qs("textarea", root) as HTMLTextAreaElement
    if (ta) {
      var text = content || ""
      if (tags && tags.length > 0) {
        text = text + " " + tags.map(function(t: string) { return "#" + t + " " }).join("")
      }
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set
        setter!.call(ta, text)
        ta.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("Filled via textarea fallback")
        return true
      } catch(e: any) {}
    }
    return false
  }

  var ed = descEditor as HTMLElement

  // Step 1: Focus the editor
  ed.focus()
  ed.dispatchEvent(new Event("focus", { bubbles: true }))
  ed.click()
  sendStatus("Editor focused")

  // Step 2: Paste description via ClipboardEvent (reference approach)
  if (content) {
    try {
      var dt = new DataTransfer()
      dt.setData("text/plain", content)
      var pasteEvent = new ClipboardEvent("paste", {
        bubbles: true, cancelable: true, clipboardData: dt
      })
      ed.dispatchEvent(pasteEvent)
      ed.dispatchEvent(new Event("input", { bubbles: true }))
      sendStatus("Description pasted")
      await delay(500)
    } catch(e: any) {
      sendStatus("Paste failed: " + e.message)
      // Fallback: execCommand
      try {
        var sel = window.getSelection()
        var rng = document.createRange()
        rng.selectNodeContents(ed)
        sel.removeAllRanges()
        sel.addRange(rng)
        document.execCommand("insertText", false, content)
        ed.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("Description via execCommand")
      } catch(e2: any) {}
    }
  }

  // Step 3: Add tags one by one (reference approach)
  if (tags && tags.length > 0) {
    for (var i = 0; i < tags.length; i++) {
      var tag = tags[i].trim()
      if (!tag) continue
      sendStatus("Adding tag " + (i+1) + ": " + tag)

      try {
        // Focus editor
        ed.focus()
        ed.dispatchEvent(new Event("focus", { bubbles: true }))
        await delay(200)

        // Paste " #tag" via ClipboardEvent
        var dt = new DataTransfer()
        dt.setData("text/plain", " #" + tag)
        var pasteEvent = new ClipboardEvent("paste", {
          bubbles: true, cancelable: true, clipboardData: dt
        })
        ed.dispatchEvent(pasteEvent)
        ed.dispatchEvent(new Event("input", { bubbles: true }))

        // Press Enter to confirm the tag
        var enterEvent = new KeyboardEvent("keydown", {
          bubbles: true, cancelable: true,
          key: "Enter", code: "Enter", keyCode: 13, which: 13
        })
        ed.dispatchEvent(enterEvent)

        sendStatus("Tag " + tag + " added")
        await delay(500)
      } catch(e: any) {
        sendStatus("Tag paste failed: " + e.message)
      }
    }
  }

  sendStatus("Description + tags done")
  return true
}



// ===== Message listener =====
function readStorageData(storageKey) {
  return new Promise(function(resolve) {
    chrome.storage.local.get([storageKey], function(result) {
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

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "shipinhao") return
  var data = msg.data
  sendStatus("Received publish data")
  // Try blob URL first (same extension origin)
  if (data.videoBlobUrl) {
    sendStatus("Fetching video from blob URL...")
    try {
      var resp = await fetch(data.videoBlobUrl)
      var blob = await resp.blob()
      var videoFile = new File([blob], data.videoName || "video.mp4", { type: data.videoType || blob.type })
      sendStatus("Video: " + videoFile.name + " (" + (videoFile.size / 1024 / 1024).toFixed(1) + "MB)")
      await injectDirect(videoFile, data)
      sendResponse({ received: true })
      return
    } catch(e: any) { sendStatus("Blob URL failed: " + e.message) }
  }
  // Fallback: read from storage
  if (data.videoStorageKey) {
    sendStatus("Reading video data from storage...")
    var storageData = await readStorageData(data.videoStorageKey)
    if (!storageData || !storageData.videoDataUrl) {
      sendStatus("Failed to read video data from storage!")
      sendResponse({ received: true }); return
    }
    data.videoDataUrl = storageData.videoDataUrl
    data.videoName = storageData.videoName || data.videoName
    data.videoType = storageData.videoType || data.videoType
    if (!data.title && storageData.title) data.title = storageData.title
    if (!data.content && storageData.content) data.content = storageData.content
    if (!data.tags && storageData.tags) data.tags = storageData.tags
  } else if (!data.videoDataUrl) {
    sendStatus("No video data received!")
    sendResponse({ received: true }); return
  }
  // Send INJECT_VIDEO via postMessage to Wujie iframe
  sendStatus("Sending INJECT_VIDEO to iframe...")
  window.postMessage({ source: "VIDEO_PUBLISHER_EXTENSION", action: "INJECT_VIDEO", platform: "shipinhao", data: { dataUrl: data.videoDataUrl, fileName: data.videoName || "video.mp4", fileType: data.videoType || "video/mp4" } }, "*")
  sendStatus("Waiting for iframe injection...")
  await new Promise(r => setTimeout(r, 10000))
  // Also try direct injection
  sendStatus("Trying direct injection...")
  try {
    var parts = data.videoDataUrl.split(",")
    if (parts.length >= 2) {
      var bs = atob(parts[1]); var ms = parts[0].split(":")[1].split(";")[0]
      var ab = new ArrayBuffer(bs.length); var ia = new Uint8Array(ab)
      for (var bi = 0; bi < bs.length; bi++) { ia[bi] = bs.charCodeAt(bi) }
      var vf = new File([ab], data.videoName || "video.mp4", { type: data.videoType || ms || "video/mp4" })
      sendStatus("Video: " + vf.name + " (" + (vf.size / 1024 / 1024).toFixed(1) + "MB)")
      await injectDirect(vf, data)
    }
  } catch(e: any) { sendStatus("Direct inject error: " + e.message) }
  // Always fill form
  try {
    fillTitle(data.title || "")
    await delay(500)
    await fillDescription(data.content || "", data.tags || [])
  } catch(e: any) { sendStatus("Form fill error: " + e.message) }
  sendStatus("All done!")
  sendResponse({ received: true })
})

async function injectDirect(videoFile, data) {
  var injected = await injectVideoFile(videoFile)
  if (!injected) { sendStatus("Video injection FAILED"); return }
  sendStatus("Video injected! Waiting...")
  await delay(3000)
  fillTitle(data.title || "")
  await delay(500)
  await fillDescription(data.content || "", data.tags || [])
  sendStatus("All done!")
}

sendStatus("Bridge ready")


