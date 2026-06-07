

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

// Read published data from chrome.storage.local (bypasses 64MB message limit)
async function readStorageData(storageKey: string): Promise<any> {
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

// Inject file directly into page (ISOLATED world can access DOM)
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

// MAIN listener - uses postMessage to MAIN world for file injection
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "xiaohongshu") return
  var data = msg.data
  sendStatus("Received publish data")

  // Priority 1: Try blob URL first (no 64MB limit, no atob corruption)
  if (data.videoBlobUrl) {
    var file = await fetchVideoFromBlob(data.videoBlobUrl, data.videoName, data.videoType)
    if (file) {
      var injected = await injectFileDirectly(file)
      if (injected) {
        sendStatus("Video injected via blob URL, proceeding to form fill...")
        await delay(3000)
        // Send FILL_FORM_TEXT to MAIN world
        window.postMessage({
          source: "VIDEO_PUBLISHER_EXTENSION",
          action: "FILL_FORM_TEXT",
          platform: "xiaohongshu",
          data: { title: data.title || "", content: data.content || "", tags: data.tags || [] }
        }, window.location.origin)
        sendStatus("Form data sent to MAIN world")
        await delay(3000)
        sendStatus("All done!")
        sendResponse({ received: true })
        return
      }
      sendStatus("Direct injection via blob URL failed, trying storage fallback...")
    }
  }

  // Priority 2: Read video data from storage
  if (data.videoStorageKey) {
    sendStatus("Reading video data from storage...")
    var storageData = await readStorageData(data.videoStorageKey)
    if (!storageData || !storageData.videoDataUrl) {
      sendStatus("Failed to read video data from storage!")
      sendResponse({ received: true })
      return
    }
    var videoDataUrl = storageData.videoDataUrl
    var videoName = storageData.videoName || "video.mp4"
    var videoType = storageData.videoType || "video/mp4"
    if (!data.title && storageData.title) data.title = storageData.title
    if (!data.content && storageData.content) data.content = storageData.content
    if (!data.tags && storageData.tags) data.tags = storageData.tags
  } else {
    sendStatus("No video storage key received!")
    sendResponse({ received: true })
    return
  }

  sendStatus("Loading video...")
  try {
    sendStatus("dataUrl ready (" + (videoDataUrl.length / 1024 / 1024).toFixed(1) + "MB)")

    // Send dataUrl to MAIN world via postMessage for file injection
    sendStatus("Sending to MAIN world via postMessage...")
    window.postMessage({
      source: "VIDEO_PUBLISHER_EXTENSION",
      action: "INJECT_VIDEO",
      platform: "xiaohongshu",
      data: {
        dataUrl: videoDataUrl,
        fileName: videoName,
        fileType: videoType
      }
    }, window.location.origin)

    sendStatus("Video data sent to MAIN world, waiting for injection...")
    await delay(8000)

    // Fill form fields via MAIN world
    window.postMessage({
      source: "VIDEO_PUBLISHER_EXTENSION",
      action: "FILL_FORM_TEXT",
      platform: "xiaohongshu",
      data: { title: data.title || "", content: data.content || "", tags: data.tags || [] }
    }, window.location.origin)

    sendStatus("Form data sent to MAIN world")
    await delay(3000)
      await requestCdpFormFill("xiaohongshu", data)
  sendStatus("All done!")
  } catch(e: any) {
    sendStatus("Error: " + e.message)
  }

  sendResponse({ received: true })
})

// Forward STATUS from MAIN world
window.addEventListener("message", (ev) => {
  if (ev.data?.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data?.action === "STATUS") {
    chrome.runtime.sendMessage({ action: "STATUS", platform: "xiaohongshu", message: ev.data.message }).catch(() => {})
  }
})

sendStatus("Bridge ready")
