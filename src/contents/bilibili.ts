import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://member.bilibili.com/*", "https://t.bilibili.com/*"],
  run_at: "document_end"
}

function sendStatus(msg: string) {
  chrome.runtime.sendMessage({ action: "STATUS", platform: "bilibili", message: msg }).catch(() => {})
  console.log("[Bili] " + msg)
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function waitForElement(selector: string, timeout = 30000): Promise<Element | null> {
  var el = document.querySelector(selector)
  if (el) return Promise.resolve(el)
  return new Promise(function(resolve) {
    var elapsed = 0
    var interval = setInterval(function() {
      var el = document.querySelector(selector)
      if (el) { clearInterval(interval); resolve(el); return }
      elapsed += 1000
      if (elapsed >= timeout) { clearInterval(interval); resolve(null) }
    }, 1000)
  })
}

// ===== File injection (reference approach) =====
async function injectVideoFile(file: File): Promise<boolean> {
  sendStatus("Looking for upload area...")

  // Wait for upload area to be ready
  await waitForElement(".bili-dyn-publishing__image-upload, [class*=upload], input[type=file]", 15000)
  await delay(1000)

  // Find file input
  var fileInputs = document.querySelectorAll("input[type=file]")
  sendStatus("Found " + fileInputs.length + " file inputs")

  var targetInput: HTMLInputElement | null = null
  for (var i = 0; i < fileInputs.length; i++) {
    var inp = fileInputs[i] as HTMLInputElement
    if (inp.name === "upload" || (inp.accept && (inp.accept.indexOf("video") >= 0 || inp.accept.indexOf("*" ) >= 0))) {
      targetInput = inp
      break
    }
  }
  if (!targetInput && fileInputs.length > 0) targetInput = fileInputs[0] as HTMLInputElement
  if (!targetInput) { sendStatus("No file input found"); return false }

  sendStatus("File input found: name=" + targetInput.name + ", accept=" + (targetInput.accept || ""))

  // Inject file via DataTransfer
  try {
    var dt = new DataTransfer()
    dt.items.add(file)
    targetInput.files = dt.files

    // Try clicking the upload button (reference approach)
    var addBtn = document.querySelector(".bili-pics-uploader__add, [class*=uploader__add], [class*=add-btn], [class*=upload-btn]")
    if (addBtn) {
      sendStatus("Clicking upload button...")
      targetInput.disabled = true
      ;(addBtn as HTMLElement).click()
      await delay(1000)
      targetInput.disabled = false
    }

    // Dispatch change event
    targetInput.dispatchEvent(new Event("change", { bubbles: true }))
    targetInput.dispatchEvent(new Event("input", { bubbles: true }))
    sendStatus("File injected: " + file.name)
    return true
  } catch(e: any) {
    sendStatus("Inject failed: " + e.message)

    // Try drag-drop as fallback
    try {
      sendStatus("Trying drag-drop...")
      var dt = new DataTransfer()
      dt.items.add(file)
      var zone = document.querySelector(".bili-dyn-publishing__image-upload, [class*=upload-area], [class*=drag]")
      if (zone) {
        zone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }))
        zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }))
        zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }))
        sendStatus("Drag-drop attempted")
        return true
      }
    } catch(e2: any) {}
    return false
  }
}

// ===== Title filling =====
function fillTitle(title: string): boolean {
  if (!title) return false
  sendStatus("Filling title...")

  var allInputs = document.querySelectorAll("input")
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var ph = (inp.placeholder || "").toLowerCase()
    var type = (inp.type || "").toLowerCase()
    if ((ph.indexOf("标题") >= 0 || ph.indexOf("title") >= 0 || ph.indexOf("输入视频标题") >= 0) && type !== "hidden" && type !== "file") {
      sendStatus("Found title input by placeholder")
      return setInputValue(inp, title)
    }
  }

  // First visible text input
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var type = (inp.type || "").toLowerCase()
    if ((type === "text" || type === "") && inp.offsetParent !== null) {
      sendStatus("Found first visible input")
      return setInputValue(inp, title)
    }
  }

  // Fallback: first non-hidden, non-file input
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
    sendStatus("Property setter failed: " + e.message)
    try {
      inp.value = value
      inp.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    } catch(e2: any) {}
  }
  return false
}

// ===== Description filling =====
function fillDescription(content: string): boolean {
  if (!content) return false
  sendStatus("Filling description...")

  // Strategy 1: Find textarea (Bilibili uses textarea for description)
  var textareas = document.querySelectorAll("textarea")
  sendStatus("Found " + textareas.length + " textareas")

  for (var i = 0; i < textareas.length; i++) {
    var ta = textareas[i] as HTMLTextAreaElement
    if (ta.offsetParent !== null || ta.getBoundingClientRect().width > 0) {
      sendStatus("Found visible textarea, filling...")
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set
        setter!.call(ta, content)
        ta.dispatchEvent(new Event("input", { bubbles: true }))
        ta.dispatchEvent(new Event("change", { bubbles: true }))
        sendStatus("Description filled via textarea")
        return true
      } catch(e: any) {
        sendStatus("Textarea setter failed: " + e.message)
        // Direct value set
        try {
          ta.value = content
          ta.dispatchEvent(new Event("input", { bubbles: true }))
          ta.dispatchEvent(new Event("change", { bubbles: true }))
          sendStatus("Description filled via textarea direct")
          return true
        } catch(e2: any) {}
      }
    }
  }

  // Strategy 2: Try contenteditable (in case Bilibili uses rich editor)
  var editors = document.querySelectorAll("div[contenteditable=true]")
  sendStatus("Found " + editors.length + " contenteditable divs")

  for (var i = 0; i < editors.length; i++) {
    var ed = editors[i] as HTMLElement
    try {
      ed.focus()
      // execCommand insertText
      var sel = window.getSelection()
      var rng = document.createRange()
      rng.selectNodeContents(ed)
      sel.removeAllRanges()
      sel.addRange(rng)
      var ok = document.execCommand("insertText", false, content)
      if (ok) {
        ed.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("Description via contenteditable execCommand")
        return true
      }
      // ClipboardEvent paste
      var dt = new DataTransfer()
      dt.setData("text/plain", content)
      var evt = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })
      ed.dispatchEvent(evt)
      ed.dispatchEvent(new Event("input", { bubbles: true }))
      sendStatus("Description via ClipboardEvent paste")
      return true
    } catch(e: any) {
      sendStatus("Contenteditable fill failed: " + e.message)
    }
  }

  // Strategy 3: Any input that looks like a description field
  var allInputs = document.querySelectorAll("input:not([type=file]):not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio])")
  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    if (!inp.value && inp.offsetParent !== null) {
      sendStatus("Trying empty visible input for description")
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
        setter!.call(inp, content)
        inp.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("Description via input fallback")
        return true
      } catch(e: any) {}
    }
  }

  sendStatus("No description field found!")
  return false
}


// ===== Tags filling =====
async function fillTags(tags: string[]): Promise<boolean> {
  if (!tags || tags.length === 0) return false
  sendStatus("Filling tags... Count: " + tags.length)

  // Find the tag input - Bilibili chip input
  var tagInput: HTMLInputElement | null = null

  // Strategy 1: Find by placeholder
  var allInputs = document.querySelectorAll("input")
  sendStatus("Found " + allInputs.length + " total inputs")

  for (var i = 0; i < allInputs.length; i++) {
    var inp = allInputs[i] as HTMLInputElement
    var ph = (inp.placeholder || "").toLowerCase()
    if (ph.indexOf("标签") >= 0 || ph.indexOf("tag") >= 0 || ph.indexOf("输入标签") >= 0 || ph.indexOf("添加标签") >= 0) {
      tagInput = inp
      sendStatus("Found tag input by placeholder: " + ph)
      break
    }
  }

  // Strategy 2: Look inside tag container
  if (!tagInput) {
    var containers = document.querySelectorAll("[class*=tag], [class*=Topic], [class*=topic]")
    sendStatus("Searching " + containers.length + " tag containers")
    for (var i = 0; i < containers.length; i++) {
      var innerInput = containers[i].querySelector("input")
      if (innerInput) {
        tagInput = innerInput as HTMLInputElement
        sendStatus("Found tag input inside container")
        break
      }
    }
  }

  // Strategy 3: Smallest input in the form (tags are usually compact inputs)
  if (!tagInput) {
    var visible: HTMLInputElement[] = []
    for (var i = 0; i < allInputs.length; i++) {
      var inp = allInputs[i] as HTMLInputElement
      var type = (inp.type || "").toLowerCase()
      if (type !== "hidden" && type !== "file" && inp.offsetParent !== null) {
        visible.push(inp)
      }
    }
    sendStatus("Visible inputs: " + visible.length)
    // Tag input is usually the last or second-to-last visible input
    if (visible.length >= 2) {
      tagInput = visible[visible.length - 1]
      sendStatus("Using last visible input as tag input")
    }
  }

  if (!tagInput) {
    sendStatus("No tag input found!")
    return false
  }

    // Remove existing tags
  var removedCount = 0
  var closeButtons = document.querySelectorAll("[class*=tag-close], [class*=tag-delete], [class*=close], [class*=remove], [aria-label*=remove]")
  sendStatus("Found " + closeButtons.length + " close buttons")

  for (var i = 0; i < closeButtons.length; i++) {
    try {
      ;(closeButtons[i] as HTMLElement).click()
      removedCount++
      await delay(200)
    } catch(e: any) {}
  }

  sendStatus("Removed " + removedCount + " existing tags")
  await delay(500)

  // Add each tag
  for (var i = 0; i < tags.length; i++) {
    var tagText = tags[i].trim()
    if (!tagText) continue
    sendStatus("Adding tag " + (i+1) + ": " + tagText)

    // For first tag, add extra delay
    if (i === 0) await delay(1000)

    // Click + focus to ensure React state
    tagInput.click()
    tagInput.focus()
    tagInput.dispatchEvent(new Event("mousedown", { bubbles: true }))
    tagInput.dispatchEvent(new Event("focus", { bubbles: true }))
    await delay(200)

    // Clear and set value
    try {
      tagInput.value = ""
      tagInput.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true, cancelable: true }))
      await delay(200)

      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
      setter!.call(tagInput, tagText)
      tagInput.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: tagText, bubbles: true, cancelable: true }))
      tagInput.dispatchEvent(new Event("change", { bubbles: true }))
    } catch(e: any) {
      // Fallback to direct
      tagInput.value = tagText
      tagInput.dispatchEvent(new Event("input", { bubbles: true }))
      tagInput.dispatchEvent(new Event("change", { bubbles: true }))
    }
    await delay(400)

    // Enter key
    var enterOpts = { key: "Enter", keyCode: 13, which: 13, code: "Enter", bubbles: true, cancelable: true }
    tagInput.dispatchEvent(new KeyboardEvent("keydown", enterOpts))
    tagInput.dispatchEvent(new KeyboardEvent("keypress", enterOpts))
    tagInput.dispatchEvent(new KeyboardEvent("keyup", enterOpts))

    await delay(800)
  }

sendStatus("All tags processed")
  return true
}


// ===== Message listener =====
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "bilibili") return

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

    // Upload video
    sendStatus("Injecting video...")
    var injected = await injectVideoFile(videoFile)
    if (!injected) {
      sendStatus("Video injection FAILED")
      sendResponse({ received: true })
      return
    }

    sendStatus("Video injected! Waiting for processing...")
    await delay(3000)

    // Fill title
    fillTitle(data.title || "")

    await delay(500)

    // Fill description (tags are separate on Bilibili)
    fillDescription(data.content || "")

    // Fill tags separately
    await fillTags(data.tags || [])

    sendStatus("All done!")
  } catch(e: any) {
    sendStatus("Error: " + e.message)
  }

  sendResponse({ received: true })
})

sendStatus("Bridge ready")
