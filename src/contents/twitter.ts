import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://twitter.com/*", "https://x.com/*"],
  run_at: "document_end"
}

function sendStatus(msg: string) {
  chrome.runtime.sendMessage({ action: "STATUS", platform: "twitter", message: msg }).catch(() => {})
  console.log("[Twitter] " + msg)
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
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

  var fileInput = document.querySelector("input[data-testid=fileInput][type=file]")
  if (!fileInput) {
    fileInput = document.querySelector("input[type=file]")
  }

  if (!fileInput) {
    var mediaBtn = document.querySelector("div[aria-label='Media'], div[aria-label='媒體'], [data-testid=mediaUploadButton]")
    if (mediaBtn) {
      sendStatus("Clicking media button...")
      ;(mediaBtn as HTMLElement).click()
      await delay(2000)
      fileInput = document.querySelector("input[data-testid=fileInput][type=file]")
    }
  }

  if (!fileInput) {
    sendStatus("No file input found")
    return false
  }

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
    sendStatus("Inject failed: " + e.message)
    return false
  }
}

// ===== Tweet text filling =====
async function fillTweetText(text: string): Promise<boolean> {
  if (!text) return false
  sendStatus("Filling tweet text...")

  var textbox = document.querySelector("div[data-testid=tweetTextarea_0], div[role=textbox][contenteditable=true]")
  if (!textbox) {
    textbox = document.querySelector("div[role=textbox]")
  }
  if (!textbox) {
    sendStatus("No tweet textbox found")
    return false
  }

  sendStatus("Textbox found: " + textbox.tagName + " testid=" + (textbox.getAttribute("data-testid") || "none"))

  var ed = textbox as HTMLElement
  
  try {
    ed.focus()
    ed.click()
    await delay(500)

    var sel = window.getSelection()
    if (!sel) { sendStatus("No selection"); return false }
    var rng = document.createRange()
    rng.selectNodeContents(ed)
    sel.removeAllRanges()
    sel.addRange(rng)

    var dt = new DataTransfer()
    dt.setData("text/plain", text)

    var pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    })
    ed.dispatchEvent(pasteEvent)
    
    sendStatus("Tweet text filled via simulated paste (" + text.length + " chars)")
    return true
  } catch(e: any) {
    sendStatus("paste approach failed: " + e.message)
  }

  try {
    ed.focus()
    var sel = window.getSelection()
    if (sel) {
      var rng = document.createRange()
      rng.selectNodeContents(ed)
      sel.removeAllRanges()
      sel.addRange(rng)
      document.execCommand("insertText", false, text)
      sendStatus("Tweet text via insertText (fallback)")
      return true
    }
  } catch(e: any) {
    sendStatus("fallback failed: " + e.message)
  }

  return false
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
  if (msg.action !== "FILL_FORM" || msg.platform !== "twitter") return

  var data = msg.data
  sendStatus("Received publish data")

  // Build tweet text: title + content + tags with #
  var tweetText = data.title || ""
  if (data.content) {
    tweetText += (tweetText ? "\n\n" : "") + data.content
  }
  if (data.tags && data.tags.length > 0) {
    var tagStr = ""
    for (var t = 0; t < data.tags.length; t++) {
      tagStr += " #" + data.tags[t]
    }
    tweetText += tweetText ? "\n\n" + tagStr.trim() : tagStr.trim()
  }

  // Priority 1: Try blob URL first
  if (data.videoBlobUrl) {
    var file = await fetchVideoFromBlob(data.videoBlobUrl, data.videoName, data.videoType)
    if (file) {
      var injected = await injectVideoFile(file)
      if (injected) {
        sendStatus("Video injected via blob URL, filling text...")
        await delay(3000)
        await fillTweetText(tweetText)
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
    if (storageData && storageData.videoDataUrl) {
      data.videoDataUrl = storageData.videoDataUrl
      data.videoName = storageData.videoName || data.videoName
      data.videoType = storageData.videoType || data.videoType
      if (!data.title && storageData.title) data.title = storageData.title
      if (!data.content && storageData.content) data.content = storageData.content
      if (!data.tags && storageData.tags) data.tags = storageData.tags
    }
  }
    
  // Video injection via MAIN world
  if (data.videoDataUrl) {
    sendStatus("Loading video...")
    try {
      sendStatus("dataUrl ready (" + (data.videoDataUrl.length / 1024 / 1024).toFixed(1) + "MB)")

      sendStatus("Sending to MAIN world via postMessage...")
      window.postMessage({
        source: "VIDEO_PUBLISHER_EXTENSION",
        action: "INJECT_VIDEO",
        platform: "twitter",
        data: {
          dataUrl: data.videoDataUrl,
          fileName: data.videoName || "video.mp4",
          fileType: data.videoType || "video/mp4"
        }
      }, window.location.origin)

      sendStatus("Video data sent to MAIN world, waiting for injection...")
      await delay(8000)
    } catch(e: any) {
      sendStatus("Video error: " + e.message)
    }
  }

  await fillTweetText(tweetText)
  sendStatus("All done!")
  sendResponse({ received: true })
})

sendStatus("Bridge ready")

// Forward STATUS from MAIN world
window.addEventListener("message", (ev) => {
  if (ev.data?.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data?.action === "STATUS") {
    chrome.runtime.sendMessage({ action: "STATUS", platform: "twitter", message: ev.data.message }).catch(() => {})
  }
})
