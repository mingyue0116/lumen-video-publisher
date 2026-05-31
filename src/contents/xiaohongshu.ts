import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.xiaohongshu.com/*"],
  run_at: "document_end"
}

function sendStatus(msg: string) {
  chrome.runtime.sendMessage({ action: "STATUS", platform: "xiaohongshu", message: msg }).catch(() => {})
  console.log("[XHS] " + msg)
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ===== File injection (reference approach) =====
async function injectVideoFile(file: File): Promise<boolean> {
  var fileInput = document.querySelector("input[type=file]")
  if (!fileInput) { sendStatus("No file input found"); return false }

  var uploadBtn: HTMLElement | null = document.querySelector("button.upload-button")
  if (!uploadBtn) {
    // Try alternative selectors
    var allButtons = document.querySelectorAll("button")
    for (var i = 0; i < allButtons.length; i++) {
      if (allButtons[i].textContent?.indexOf("上传") >= 0 || allButtons[i].className.indexOf("upload") >= 0) {
        uploadBtn = allButtons[i] as HTMLElement
        break
      }
    }
  }

  // Intercept file input click to prevent dialog
  var origClick = (fileInput as HTMLInputElement).click.bind(fileInput)
  ;(fileInput as HTMLInputElement).click = function() { /* suppress dialog */ }
  var clickHandler = function(e: Event) {
    e.preventDefault()
    e.stopPropagation()
  }
  fileInput.addEventListener("click", clickHandler, true)

  if (uploadBtn) {
    sendStatus("Clicking upload button...")
    uploadBtn.click()
    await delay(3000)
  }

  // Restore
  ;(fileInput as HTMLInputElement).click = origClick
  fileInput.removeEventListener("click", clickHandler, true)

  // Inject file via DataTransfer
  try {
    var dt = new DataTransfer()
    dt.items.add(file)
    ;(fileInput as HTMLInputElement).files = dt.files
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
    fileInput.dispatchEvent(new Event("input", { bubbles: true }))
    sendStatus("File injected: " + file.name)
    return true
  } catch(e: any) {
    sendStatus("Inject failed: " + e.message)

    // Try direct drag-drop approach
    try {
      sendStatus("Trying drag-drop...")
      var dt = new DataTransfer()
      dt.items.add(file)
      var uploadZone = fileInput.closest("[class*=upload], [class*=Upload], [class*=drop], [class*=Drag]")
      if (!uploadZone) uploadZone = document.body
      uploadZone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }))
      uploadZone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }))
      uploadZone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }))
      sendStatus("Drag-drop attempted")
      return true
    } catch(e2: any) {
      sendStatus("Drag-drop also failed: " + e2.message)
      return false
    }
  }
}

// ===== Title filling (React-friendly) =====
function fillTitle(title: string): boolean {
  if (!title) return false
  sendStatus("Looking for title input...")

  // Strategy 1: Find by placeholder (most reliable for Xiaohongshu)
  var allInputs = document.querySelectorAll("input")
  sendStatus("Found " + allInputs.length + " total inputs")
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var ph = (inp.placeholder || "").toLowerCase()
    var type = (inp.type || "").toLowerCase()
    if ((ph.indexOf("标题") >= 0 || ph.indexOf("title") >= 0 || ph.indexOf("填写标题") >= 0) && type !== "hidden") {
      sendStatus("Found by placeholder: " + ph)
      return setInputValue(inp, title)
    }
  }

  // Strategy 2: First visible text input on the publish page
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var type = (inp.type || "").toLowerCase()
    if (type === "text" || type === "search" || type === "") {
      if (inp.offsetParent !== null || inp.getBoundingClientRect().width > 0) {
        sendStatus("Found first visible input")
        return setInputValue(inp, title)
      }
    }
  }

  // Strategy 3: Fallback - just use the first non-file, non-hidden input
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var type = (inp.type || "").toLowerCase()
    if (type !== "file" && type !== "hidden" && type !== "submit" && type !== "button" && type !== "checkbox" && type !== "radio") {
      sendStatus("Fallback: first usable input")
      return setInputValue(inp, title)
    }
  }

  sendStatus("No suitable input found!")
  return false
}

function setInputValue(inp: HTMLInputElement, value: string): boolean {
  try {
    // Try React-friendly approach first
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
    setter!.call(inp, value)
    inp.dispatchEvent(new Event("input", { bubbles: true }))
    inp.dispatchEvent(new Event("change", { bubbles: true }))
    sendStatus("Title set via property setter")
    return true
  } catch(e: any) {
    sendStatus("Property setter failed: " + e.message)
  }
  // Fallback: direct value set
  try {
    inp.value = value
    inp.dispatchEvent(new Event("input", { bubbles: true }))
    inp.dispatchEvent(new Event("change", { bubbles: true }))
    sendStatus("Title set via direct value")
    return true
  } catch(e: any) {
    sendStatus("Direct value also failed: " + e.message)
  }
  return false
}


// ===== Description + Tags filling (ClipboardEvent paste - reference approach) =====
function fillDescriptionTags(content: string, tags: string[]): boolean {
  var text = content || ""
  if (tags && tags.length > 0) {
    var tagStr = tags.map(function(t: string) { return "#" + t + " " }).join("")
    text = text ? (text + " " + tagStr) : tagStr
  }
  if (!text) return false

  // Find contenteditable (same as reference plugin)
  var editors = document.querySelectorAll("div[contenteditable=true]")
  sendStatus("Found " + editors.length + " contenteditable divs")

  for (var i = 0; i < editors.length; i++) {
    var ed = editors[i] as HTMLElement
    ed.focus()

    // Strategy 1: ClipboardEvent paste (reference approach)
    try {
      ed.dispatchEvent(new Event("focus", { bubbles: true }))
      var dt = new DataTransfer()
      dt.setData("text/plain", text)
      var pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      })
      var dispatched = ed.dispatchEvent(pasteEvent)
      ed.dispatchEvent(new Event("input", { bubbles: true }))
      ed.dispatchEvent(new Event("change", { bubbles: true }))
      sendStatus("ClipboardEvent paste dispatched: " + dispatched)
      return true
    } catch(e: any) {
      sendStatus("ClipboardEvent failed: " + e.message)
    }

    // Strategy 2: execCommand insertText
    try {
      var sel = window.getSelection()
      var rng = document.createRange()
      rng.selectNodeContents(ed)
      sel.removeAllRanges()
      sel.addRange(rng)
      var ok = document.execCommand("insertText", false, text)
      if (ok) {
        ed.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("execCommand insertText OK")
        return true
      }
    } catch(e: any) {}

    // Strategy 3: Direct innerHTML / textContent (last resort)
    try {
      // Clear and set text
      while (ed.firstChild) ed.removeChild(ed.firstChild)
      var p = document.createElement("p")
      p.textContent = text
      ed.appendChild(p)
      ed.dispatchEvent(new Event("input", { bubbles: true }))
      sendStatus("DOM text fill used")
      return true
    } catch(e: any) {}
  }

  return false
}

// ===== Message listener =====
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "xiaohongshu") return

  var data = msg.data
  if (!data.videoBlobUrl) {
    sendStatus("No video blob URL received!")
    sendResponse({ received: true })
    return
  }

  sendStatus("Loading video...")
  try {
    var resp = await fetch(data.videoBlobUrl)
    var blob = await resp.blob()
    var videoFile = new File([blob], data.videoName, { type: data.videoType || blob.type })
    sendStatus("Video: " + videoFile.name + " (" + (videoFile.size / 1024 / 1024).toFixed(1) + "MB)")

    await delay(1000)

    // Inject video
    sendStatus("Injecting video...")
    var injected = await injectVideoFile(videoFile)

    if (!injected) {
      sendStatus("Video injection FAILED")
      sendResponse({ received: true })
      return
    }

    sendStatus("Video injected! Waiting for page to process...")
    await delay(3000)

    // Fill title
    sendStatus("Filling title...")
    fillTitle(data.title || "")

    // Fill description + tags
    sendStatus("Filling description + tags...")
    fillDescriptionTags(data.content || "", data.tags || [])

    sendStatus("All done!")
  } catch(e: any) {
    sendStatus("Error: " + e.message)
  }

  sendResponse({ received: true })
})

sendStatus("Bridge ready")
