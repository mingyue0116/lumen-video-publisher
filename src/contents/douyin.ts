import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://creator.douyin.com/*", "https://*.douyin.com/*"],
  run_at: "document_start"
}

function sendStatus(msg: string) {
  chrome.runtime.sendMessage({ action: "STATUS", platform: "douyin", message: msg }).catch(() => {})
  console.log("[Douyin] " + msg)
}

// Direct file injection into page DOM
async function injectFile(file: File, acceptType: string): Promise<boolean> {
  // Try existing file inputs
  var inputs = document.querySelectorAll("input[type=file]")
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i] as HTMLInputElement
    if (inp.accept && inp.accept.indexOf(acceptType) >= 0) {
      try {
        var dt = new DataTransfer()
        dt.items.add(file)
        inp.files = dt.files
        inp.dispatchEvent(new Event("change", { bubbles: true }))
        inp.dispatchEvent(new Event("input", { bubbles: true }))
        sendStatus("File injected via existing input")
        return true
      } catch(e) {
        sendStatus("Direct injection failed: " + e)
      }
    }
  }
  // Try creating a hidden input
  try {
    var input = document.createElement("input") as HTMLInputElement
    input.type = "file"
    input.accept = acceptType
    input.style.display = "none"
    document.body.appendChild(input)
    var dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
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

// Monkey-patch createElement (in ISOLATED world, this intercepts extensions' createElement too)
var origCE = document.createElement.bind(document)
;(document as any).createElement = function(tag: string, opts?: any) {
  var el = origCE(tag, opts) as HTMLInputElement
  if (tag.toLowerCase() === "input") {
    var origClick = el.click.bind(el)
    el.click = function() {
      if (el.type === "file") {
        // File should already be injected by now, but intercept as fallback
        origClick()
      }
    }
  }
  return el
}

// MAIN listener
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "FILL_FORM" || msg.platform !== "douyin") return
  var data = msg.data
  sendStatus("Received publish data"); console.log("[Douyin] data keys:", Object.keys(data)); console.log("[Douyin] videoData type:", typeof data.videoData, "length:", data.videoData?.byteLength)

  async function fetchBlob(url: string, name: string, type: string): Promise<File> {
    var resp = await fetch(url)
    var blob = await resp.blob()
    return new File([blob], name, { type: type || blob.type })
  }

  if (data.videoBlobUrl) {
    sendStatus("正在加载视频...")
    try {
      var videoFile = await fetchBlob(data.videoBlobUrl, data.videoName, data.videoType)
      sendStatus("Video: " + videoFile.name + " (" + (videoFile.size / 1024 / 1024).toFixed(1) + "MB)")

      await new Promise(r => setTimeout(r, 1000))

      // Try direct injection
      sendStatus("Injecting video...")
      var injected = await injectFile(videoFile, "video")

      if (!injected) {
        sendStatus("Trying drag-drop...")
        injected = await tryDragDrop(videoFile)
      }

      if (injected) {
        sendStatus("Video injected successfully!")
      } else {
        sendStatus("All strategies failed - dumping DOM")
        var all = document.querySelectorAll("*")
        var found: any[] = []
        for (var i = 0; i < all.length; i++) {
          var el = all[i]
          var cls = (el.className || "").toString().toLowerCase()
          var tag = el.tagName.toLowerCase()
          if ((tag === "input" && (el as HTMLInputElement).type === "file") || cls.indexOf("upload") >= 0 || cls.indexOf("video") >= 0 || cls.indexOf("drop") >= 0) {
            var r = el.getBoundingClientRect()
            found.push({tag: tag, id: el.id, cls: cls.substring(0, 60), w: Math.round(r.width), h: Math.round(r.height), accept: (el as HTMLInputElement).accept || ""})
          }
        }
        sendStatus("DOM: " + JSON.stringify(found).substring(0, 600))
      }

                    // Cover upload skipped - user will upload manually
// Fill form fields via MAIN world
      await new Promise(r => setTimeout(r, 1000))
      window.postMessage({
        source: "VIDEO_PUBLISHER_EXTENSION",
        action: "FILL_FORM_TEXT",
        platform: "douyin",
        data: { title: data.title || "", content: data.content || "", tags: data.tags || [] }
      }, window.location.origin)

      sendStatus("All done!")
    } catch(e: any) {
      sendStatus("Error: " + e.message)
    }
  } else {
    sendStatus("No video blob URL received!")
    console.log("[Douyin] data keys:", Object.keys(data))
  }

  sendResponse({ received: true })
})

// Forward STATUS from MAIN world
window.addEventListener("message", (ev) => {
  if (ev.data?.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data?.action === "STATUS") {
    chrome.runtime.sendMessage({ action: "STATUS", platform: "douyin", message: ev.data.message }).catch(() => {})
  }
})

sendStatus("Bridge ready")
