

// ===== CDP fallback (most stable, bypasses all frameworks) =====
async function requestCdpFormFill(platform: string, data: any): Promise<boolean> {
  sendStatus("Requesting CDP fallback...")
  try {
    var descText = data.content || ""
    if (data.tags && data.tags.length > 0) {
      var tagStr = ""
      for (var t = 0; t < data.tags.length; t++) {
        tagStr += " #" + data.tags[t]
      }
      descText += (descText ? "\n" : "") + tagStr.trim()
    }
    var result = await chrome.runtime.sendMessage({
      action: "CDP_FILL_FORM",
      platform: platform,
      title: data.title || "",
      descText: descText
    })
    if (result && result.success) {
      sendStatus("CDP form fill successful")
      return true
    } else {
      sendStatus("CDP form fill result: " + (result ? result.error : "no response"))
      return false
    }
  } catch(e: any) {
    sendStatus("CDP request failed: " + e.message)
    return false
  }
}


﻿import type { PlasmoCSConfig } from "plasmo"

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

// ===== File injection =====
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
    if (inp.name === "upload" || (inp.accept && (inp.accept.indexOf("video") >= 0 || inp.accept.indexOf("*") >= 0))) {
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
    Object.defineProperty(targetInput, "files", {
        get: function() { return dt.files },
        configurable: true
      })

    // Try clicking the upload button
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
    try {
      inp.value = value
      inp.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    } catch(e2: any) {
      sendStatus("setInputValue error: " + e2.message)
      return false
    }
  }
}

// ===== Description filling =====
function fillDescription(text: string): boolean {
  if (!text) return false
  sendStatus("Filling description...")

  // Try textarea
  var textareas = document.querySelectorAll("textarea")
  for (var i = 0; i < textareas.length; i++) {
    var ta = textareas[i] as HTMLTextAreaElement
    if (!ta.closest(".bili-comment")) {
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set
        setter!.call(ta, text)
        ta.dispatchEvent(new Event("input", { bubbles: true }))
        ta.dispatchEvent(new Event("change", { bubbles: true }))
        sendStatus("Description filled via textarea")
        return true
      } catch(e: any) {}
    }
  }

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
        document.execCommand("insertText", false, text)
        sendStatus("Description filled via contenteditable")
        return true
      }
    } catch(e: any) {}
  }

  sendStatus("No description field found")
  return false
}

// ===== Tags filling (Bilibili specific) =====
async function fillTags(tags: string[]): Promise<boolean> {
  if (!tags || tags.length === 0) return false
  sendStatus("Filling " + tags.length + " tags...")

  // Find tag input - Bilibili uses a specific tag component
  var tagInput = document.querySelector("input[placeholder*=\"标签\"]") as HTMLInputElement
  if (!tagInput) {
    tagInput = document.querySelector("input[placeholder*=\"tag\"]") as HTMLInputElement
  }
  if (!tagInput) {
    tagInput = document.querySelector("input[placeholder*=\"话题\"]") as HTMLInputElement
  }
  if (!tagInput) {
    // Try Bilibili's specific tag input structure
    tagInput = document.querySelector(".tag-input input, .bili-tag input, [class*=\"tag\"] input") as HTMLInputElement
  }

  if (!tagInput) {
    sendStatus("No tag input found")
    return false
  }

  sendStatus("Tag input found, adding tags...")
  await delay(500)

  // Remove existing tags first
  var closeButtons = document.querySelectorAll(".tag-item .close, .tag-close, [class*=\"tag\"] [class*=\"close\"], [class*=\"tag\"] [class*=\"del\"], .bili-tag .close")
  for (var i = 0; i < closeButtons.length; i++) {
    try {
      ;(closeButtons[i] as HTMLElement).click()
      await delay(200)
    } catch(e: any) {}
  }

  await delay(500)

  // Add each tag
  for (var i = 0; i < tags.length; i++) {
    var tagText = tags[i].trim()
    if (!tagText) continue
    sendStatus("Adding tag " + (i+1) + ": " + tagText)
    if (i === 0) await delay(1000)

    tagInput.click()
    tagInput.focus()
    tagInput.dispatchEvent(new Event("mousedown", { bubbles: true }))
    tagInput.dispatchEvent(new Event("focus", { bubbles: true }))
    await delay(200)

    try {
      tagInput.value = ""
      tagInput.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true, cancelable: true }))
      await delay(200)
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set
      setter!.call(tagInput, tagText)
      tagInput.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: tagText, bubbles: true, cancelable: true }))
      tagInput.dispatchEvent(new Event("change", { bubbles: true }))
    } catch(e: any) {
      tagInput.value = tagText
      tagInput.dispatchEvent(new Event("input", { bubbles: true }))
      tagInput.dispatchEvent(new Event("change", { bubbles: true }))
    }
    await delay(400)

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

// Read published data from chrome.storage.local (bypasses 64MB message limit)
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
  if (msg.action !== "FILL_FORM" || msg.platform !== "bilibili") return

  var data = msg.data
  sendStatus("Received publish data")

  // Priority 1: Try blob URL first
  if (data.videoBlobUrl) {
    var file = await fetchVideoFromBlob(data.videoBlobUrl, data.videoName, data.videoType)
    if (file) {
      var injected = await injectVideoFile(file)
      if (injected) {
        sendStatus("Video injected via blob URL, proceeding to form fill...")
        await delay(3000)
        // Fill form directly in ISOLATED world
        fillTitle(data.title || "")
        await delay(500)
        fillDescription(data.content || "")
        await delay(500)
        await fillTags(data.tags || [])
        sendStatus("All done!")
        sendResponse({ received: true })
        return
      }
      sendStatus("Blob URL injection failed, trying storage fallback...")
    }
  }

  // Priority 2: Read from storage
  if (data.videoStorageKey) {
    sendStatus("Reading video data from storage...")
    var storageData = await readStorageData(data.videoStorageKey)
    if (!storageData || !storageData.videoDataUrl) {
      sendStatus("Failed to read video data from storage!")
      sendResponse({ received: true })
      return
    }
    data.videoDataUrl = storageData.videoDataUrl
    data.videoName = storageData.videoName || data.videoName
    data.videoType = storageData.videoType || data.videoType
    if (!data.title && storageData.title) data.title = storageData.title
    if (!data.content && storageData.content) data.content = storageData.content
    if (!data.tags && storageData.tags) data.tags = storageData.tags
  } else if (!data.videoDataUrl) {
    sendStatus("No video data URL received!")
    sendResponse({ received: true })
    return
  }

  sendStatus("Loading video...")
  try {
    sendStatus("dataUrl ready (" + (data.videoDataUrl.length / 1024 / 1024).toFixed(1) + "MB)")

    // Send to MAIN world via postMessage for file injection
    sendStatus("Sending to MAIN world via postMessage...")
    window.postMessage({
      source: "VIDEO_PUBLISHER_EXTENSION",
      action: "INJECT_VIDEO",
      platform: "bilibili",
      data: {
        dataUrl: data.videoDataUrl,
        fileName: data.videoName || "video.mp4",
        fileType: data.videoType || "video/mp4"
      }
    }, window.location.origin)

    sendStatus("Video data sent to MAIN world, waiting for injection...")
    await delay(8000)
    fillTitle(data.title || "")
    await delay(500)
    fillDescription(data.content || "")
    await delay(500)
    await fillTags(data.tags || [])
      await requestCdpFormFill("bilibili", data)
  sendStatus("All done!")
  } catch(e: any) {
    sendStatus("Error: " + e.message)
  }

  sendResponse({ received: true })
})

sendStatus("Bridge ready")

// Forward STATUS from MAIN world
window.addEventListener("message", (ev) => {
  if (ev.data?.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data?.action === "STATUS") {
    chrome.runtime.sendMessage({ action: "STATUS", platform: "bilibili", message: ev.data.message }).catch(() => {})
  }
})
