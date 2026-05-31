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

// ===== File injection =====
async function injectVideoFile(file: File): Promise<boolean> {
  sendStatus("Looking for upload area...")

  // Twitter uses data-testid="fileInput" for media upload
  var fileInput = document.querySelector("input[data-testid=fileInput][type=file]")
  if (!fileInput) {
    fileInput = document.querySelector("input[type=file]")
  }

  if (!fileInput) {
    // Click the media button to open file picker
    var mediaBtn = document.querySelector("div[aria-label='Media'], div[aria-label='媒体'], [data-testid=mediaUploadButton]")
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
    ;(fileInput as HTMLInputElement).files = dt.files
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

  // Twitter compose: contenteditable div with data-testid="tweetTextarea_0" or role="textbox"
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
  
  // Strategy: Simulate paste (works best with React/Draft.js editors)
  // Draft.js listens for paste events and handles them via clipboardData
  try {
    ed.focus()
    ed.click()
    await delay(500)

    // Select all existing content
    var sel = window.getSelection()
    if (!sel) { sendStatus("No selection"); return false }
    var rng = document.createRange()
    rng.selectNodeContents(ed)
    sel.removeAllRanges()
    sel.addRange(rng)

    // Create DataTransfer with our text
    var dt = new DataTransfer()
    dt.setData("text/plain", text)

    // Dispatch paste event - React/Draft.js will handle this as user paste
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

  // Fallback: insertText one shot
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
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "twitter") return

  var data = msg.data
  sendStatus("Received publish data")
  sendStatus("DEBUG title=" + JSON.stringify(data.title) + " content=" + JSON.stringify(data.content) + " tags=" + JSON.stringify(data.tags))

  if (data.videoBlobUrl) {
    sendStatus("Loading video...")
    try {
      var resp = await fetch(data.videoBlobUrl)
      var blob = await resp.blob()
      var videoFile = new File([blob], data.videoName, { type: data.videoType || blob.type })
      sendStatus("Video: " + videoFile.name + " (" + (videoFile.size / 1024 / 1024).toFixed(1) + "MB)")

      await delay(1000)
      var injected = await injectVideoFile(videoFile)
      if (!injected) {
        sendStatus("Video injection FAILED")
        sendResponse({ received: true }); return
      }

      sendStatus("Video injected! Waiting...")
      await delay(3000)
    } catch(e: any) {
      sendStatus("Video error: " + e.message)
    }
  }

  // Build tweet text (title + content + tags in one box)
  var tweetText = ""
  if (data.title) tweetText += data.title
  if (data.content) {
    if (tweetText) tweetText += "\n"
    tweetText += data.content
  }
  if (data.tags && data.tags.length > 0) {
    var tagStr = data.tags.map(function(t: string) { return "#" + t + " " }).join("")
    if (tweetText) tweetText += " "
    tweetText += tagStr
  }
  sendStatus("Tweet text: " + tweetText.substring(0, 100))

  await fillTweetText(tweetText)

  sendStatus("All done!")
  sendResponse({ received: true })
})

sendStatus("Bridge ready")
