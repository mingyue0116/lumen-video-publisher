import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://example.com/never-match/*"
  ],
  run_at: "document_start"
}

// Bridge: ISOLATED world <-> MAIN world via window.postMessage
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "FILL_FORM") {
    window.postMessage({
      source: "VIDEO_PUBLISHER_EXTENSION",
      action: "FILL_FORM",
      platform: msg.platform,
      data: msg.data
    }, window.location.origin)
    sendResponse({ received: true })
  }
})

window.addEventListener("message", (ev) => {
  if (ev.data?.source !== "VIDEO_PUBLISHER_EXTENSION") return
  if (ev.data?.action === "STATUS") {
    chrome.runtime.sendMessage({
      action: "STATUS",
      platform: ev.data.platform,
      message: ev.data.message
    }).catch(() => {})
  }
})
