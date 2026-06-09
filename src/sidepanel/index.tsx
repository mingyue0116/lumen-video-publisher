import React, { useState, useRef, useEffect } from "react"

const VERSION = "2.0.0"
const DRAFT_KEY = "publish_draft_v3"
const VIDEO_KEY_PREFIX = "publish_video_"

// Icons
var I: Record<string, React.ReactElement> = {
  douyin: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" })
  ),
  xiaohongshu: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 14h-9a.5.5 0 01-.5-.5v-7a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v7a.5.5 0 01-.5.5z" })
  ),
  bilibili: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 01-.373-.906c0-.356.124-.662.373-.92.249-.258.555-.387.92-.387.364 0 .671.129.92.387L9.333 4.44c.182.173.32.364.414.573.093.209.14.427.14.654H14.5c0-.227.047-.445.14-.654.094-.209.232-.4.414-.573l2.666-2.587c.24-.258.542-.387.907-.387.364 0 .671.129.92.387.249.258.373.564.373.92 0 .355-.124.662-.373.907l-1.174 1.12h.086z" })
  ),
  shipinhao: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M8.75 21V3l14 9-14 9z" })
  ),
  twitter: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" })
  ),
  video: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" })
  ),
  save: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" })
  ),
  delete: React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 4 } },
    React.createElement("path", { d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" })
  )
}

interface PlatformOption { id: string; label: string; icon: React.ReactElement }

var PLATFORMS: PlatformOption[] = [
  { id: "douyin", label: "\u6296\u97f3", icon: I.douyin },
  { id: "xiaohongshu", label: "\u5c0f\u7ea2\u4e66", icon: I.xiaohongshu },
  { id: "bilibili", label: "B\u7ad9", icon: I.bilibili },
  { id: "shipinhao", label: "\u89c6\u9891\u53f7", icon: I.shipinhao },
  { id: "twitter", label: "Twitter", icon: I.twitter }
]

var PLATFORM_NAMES: Record<string, string> = {
  douyin: "\u6296\u97f3", xiaohongshu: "\u5c0f\u7ea2\u4e66",
  bilibili: "B\u7ad9", shipinhao: "\u89c6\u9891\u53f7", twitter: "Twitter"
}

function SidePanel() {
  var _a = useState<File | null>(null), videoFile = _a[0], setVideoFile = _a[1]
  var _b = useState(""), videoName = _b[0], setVideoName = _b[1]
  var _c = useState(""), videoSizeStr = _c[0], setVideoSizeStr = _c[1]
  var _d = useState(""), title = _d[0], setTitle = _d[1]
  var _e = useState(""), content = _e[0], setContent = _e[1]
  var _f = useState(""), tags = _f[0], setTags = _f[1]
  var _g = useState<string[]>([]), status = _g[0], setStatus = _g[1]
  var _h = useState(false), publishing = _h[0], setPublishing = _h[1]
  var _i = useState<Set<string>>(new Set(["douyin"])), selectedPlatforms = _i[0], setSelectedPlatforms = _i[1]
  var videoRef = useRef<HTMLInputElement>(null)
  var draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load draft on mount
  useEffect(function() {
    chrome.storage.local.get([DRAFT_KEY], function(result) {
      if (result[DRAFT_KEY]) {
        var d = result[DRAFT_KEY]
        setTitle(d.title || "")
        setContent(d.content || "")
        setTags(d.tags || "")
        if (d.selectedPlatforms) setSelectedPlatforms(new Set(d.selectedPlatforms))
      }
    })
  }, [])

  // Auto-save draft
  function saveDraft() {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(function() {
      chrome.storage.local.set({
        [DRAFT_KEY]: { title: title, content: content, tags: tags, selectedPlatforms: Array.from(selectedPlatforms) }
      }, function() {})
    }, 1000)
  }

  useEffect(function() { saveDraft() }, [title, content, tags, selectedPlatforms])

  function addStatus(msg: string) {
    var t = new Date().toLocaleTimeString()
    setStatus(function(prev) { return prev.concat(["[" + t + "] " + msg]) })
  }

  function togglePlatform(id: string) {
    setSelectedPlatforms(function(prev) {
      var next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function clearDraft() {
    setVideoFile(null)
    setVideoName("")
    setVideoSizeStr("")
    setTitle("")
    setContent("")
    setTags("")
    setStatus([])
    chrome.storage.local.remove([DRAFT_KEY], function() {})
    if (videoRef.current) videoRef.current.value = ""
  }

  // Parse tags from input string (space/comma separated)
  function parseTags(input: string): string[] {
    return input.split(/[\s,\u3001]+/).filter(function(t) { return t.trim().length > 0 })
  }

  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files
    if (!files || files.length === 0) return
    var file = files[0]
    setVideoFile(file)
    setVideoName(file.name)
    setVideoSizeStr((file.size / 1024 / 1024).toFixed(1) + "MB")
    addStatus("\u5df2\u9009\u62e9\u89c6\u9891: " + file.name + " (" + (file.size / 1024 / 1024).toFixed(1) + "MB)")
  }

  // ===== Main publish flow =====
  async function publishAll() {
    if (!videoFile) { addStatus("[ERROR] \u8bf7\u5148\u9009\u62e9\u89c6\u9891"); return }
    if (selectedPlatforms.size === 0) { addStatus("[ERROR] \u8bf7\u9009\u62e9\u81f3\u5c11\u4e00\u4e2a\u5e73\u53f0"); return }

    setPublishing(true)
    addStatus("===== \u5f00\u59cb\u53d1\u5e03 (v" + VERSION + ") =====")

    try {
      // Step 1: Read video file as base64 data URL
      addStatus("\u6b63\u5728\u8bfb\u53d6\u89c6\u9891\u6587\u4ef6...")
      var dataUrl = await fileToDataUrl(videoFile)
      addStatus("\u89c6\u9891\u8bfb\u53d6\u5b8c\u6210 (" + (dataUrl.length / 1024 / 1024).toFixed(1) + "MB base64)")

      // Step 2: Store in chrome.storage.local
      var storageKey = VIDEO_KEY_PREFIX + Date.now()
      addStatus("\u6b63\u5728\u5b58\u50a8\u89c6\u9891\u6570\u636e...")
      await new Promise<void>(function(resolve, reject) {
        chrome.storage.local.set({
          [storageKey]: {
            dataUrl: dataUrl,
            videoName: videoFile.name,
            videoType: videoFile.type || "video/mp4"
          }
        }, function() {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else resolve()
        })
      })
      addStatus("\u89c6\u9891\u6570\u636e\u5b58\u50a8\u5b8c\u6210")

      // Step 3: Parse tags
      var tagList = parseTags(tags)
      addStatus("\u6807\u7b7e\u6570\u91cf: " + tagList.length + " (\u6bcf\u4e2a\u524d\u7f00 #)")

      // Step 4: Publish to each platform
      var platforms = Array.from(selectedPlatforms)
      for (var p = 0; p < platforms.length; p++) {
        var platform = platforms[p]
        var name = PLATFORM_NAMES[platform] || platform
        addStatus("------ " + name + " ------")

        try {
          // Open platform tab
          addStatus("\u6253\u5f00" + name + "\u53d1\u5e03\u9875...")
          var tabResult = await chrome.runtime.sendMessage({
            action: "OPEN_PLATFORM",
            platform: platform
          })

          if (!tabResult || !tabResult.success) {
            addStatus("[FAIL] " + name + " \u6253\u5f00\u5931\u8d25: " + (tabResult ? tabResult.error : "Unknown"))
            continue
          }

          var tabId = tabResult.tabId
          addStatus("\u9875\u9762\u5df2\u6253\u5f00 (tabId: " + tabId + ")")

          // Wait for content script to be ready
          await sleep(3000)

          // Send FILL_FORM to content script
          addStatus("\u53d1\u9001\u6570\u636e\u5230 " + name + "...")

          var fillResult = await chrome.runtime.sendMessage({
            action: "SEND_FILL_FORM",
            tabId: tabId,
            platform: platform,
            data: {
              videoStorageKey: storageKey,
              videoName: videoFile.name,
              videoType: videoFile.type || "video/mp4",
              title: title,
              content: content,
              tags: tagList
            }
          })

          if (fillResult && fillResult.success) {
            addStatus("[OK] " + name + " \u53d1\u5e03\u5b8c\u6210")
            // Show detailed results if available
            if (fillResult.steps) {
              for (var s = 0; s < fillResult.steps.length; s++) {
                var step = fillResult.steps[s]
                if (step.success) {
                  addStatus("  [OK] " + step.name)
                } else {
                  addStatus("  [FAIL] " + step.name + ": " + step.detail)
                }
              }
            }
          } else {
            addStatus("[FAIL] " + name + " \u53d1\u9001\u5931\u8d25: " + (fillResult ? fillResult.error : "No response"))
          }
        } catch (err: any) {
          addStatus("[FAIL] " + name + " \u5f02\u5e38: " + err.message)
        }

        await sleep(1000)
      }

      // Step 5: Clean up video from storage
      addStatus("\u6b63\u5728\u6e05\u7406\u89c6\u9891\u7f13\u5b58...")
      chrome.storage.local.remove([storageKey], function() {})

    } catch (err: any) {
      addStatus("[ERROR] " + err.message)
    }

    addStatus("===== \u53d1\u5e03\u5df2\u5b8c\u6210 =====")
    setPublishing(false)
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader()
      reader.onload = function() { resolve(reader.result as string) }
      reader.onerror = function() { reject(new Error("File read failed")) }
      reader.readAsDataURL(file)
    })
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(function(r) { setTimeout(r, ms) })
  }

  // ===== Render =====
  return React.createElement("div", { style: { padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 14, color: "#333", maxWidth: 400, margin: "0 auto" } },

    // Header
    React.createElement("div", { style: { textAlign: "center", marginBottom: 16 } },
      React.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#1677ff" } }, "\u89c6\u9891\u591a\u5e73\u53f0\u53d1\u5e03\u5668"),
      React.createElement("div", { style: { fontSize: 11, color: "#999" } }, "v" + VERSION)
    ),

    // Video selection
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        React.createElement("button", {
          onClick: function() { videoRef.current?.click() },
          style: { padding: "8px 16px", background: "#1677ff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }
        }, I.video, "\u9009\u62e9\u89c6\u9891"),
        React.createElement("input", {
          ref: videoRef, type: "file", accept: "video/*",
          onChange: handleVideoSelect,
          style: { display: "none" }
        }),
        videoName ? React.createElement("span", { style: { fontSize: 12, color: "#666" } }, videoName + " (" + videoSizeStr + ")") : null
      )
    ),

    // Platform selection
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("label", { style: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13, color: "#555" } }, "\u53d1\u5e03\u5230"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } },
        PLATFORMS.map(function(p) {
          return React.createElement("button", {
            key: p.id,
            onClick: function() { togglePlatform(p.id) },
            style: {
              display: "inline-flex", alignItems: "center", padding: "6px 12px",
              border: "1px solid " + (selectedPlatforms.has(p.id) ? "#1677ff" : "#d9d9d9"),
              borderRadius: 6, background: selectedPlatforms.has(p.id) ? "#e6f4ff" : "#fff",
              color: selectedPlatforms.has(p.id) ? "#1677ff" : "#666",
              cursor: "pointer", fontSize: 13, fontWeight: selectedPlatforms.has(p.id) ? 500 : 400,
              outline: "none"
            }
          }, p.icon, p.label)
        })
      )
    ),

    // Title
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("label", { style: { display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13, color: "#555" } }, "\u6807\u9898"),
      React.createElement("input", {
        value: title,
        onChange: function(e) { setTitle(e.target.value) },
        placeholder: "\u8f93\u5165\u89c6\u9891\u6807\u9898",
        style: { width: "100%", padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }
      })
    ),

    // Description
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("label", { style: { display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13, color: "#555" } }, "\u4f5c\u54c1\u7b80\u4ecb"),
      React.createElement("textarea", {
        value: content,
        onChange: function(e) { setContent(e.target.value) },
        placeholder: "\u8f93\u5165\u4f5c\u54c1\u7b80\u4ecb",
        rows: 4,
        style: { width: "100%", padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }
      })
    ),

    // Tags
    React.createElement("div", { style: { marginBottom: 16 } },
      React.createElement("label", { style: { display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13, color: "#555" } }, "\u8bdd\u9898\u6807\u7b7e (\u7528\u7a7a\u683c\u6216\u9017\u53f7\u5206\u9694)"),
      React.createElement("input", {
        value: tags,
        onChange: function(e) { setTags(e.target.value) },
        placeholder: "\u4f8b\u5982: \u641e\u7b11 \u7f8e\u98df \u6559\u7a0b",
        style: { width: "100%", padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }
      }),
      React.createElement("div", { style: { fontSize: 11, color: "#999", marginTop: 4 } },
        tags.split(/[\s,\u3001]+/).filter(Boolean).map(function(t, i) {
          return React.createElement("span", {
            key: i,
            style: { display: "inline-block", padding: "2px 6px", margin: "2px 4px 2px 0", background: "#f0f0f0", borderRadius: 4, fontSize: 12, color: "#1677ff" }
          }, (t.indexOf("#") === 0 ? "" : "#") + t)
        })
      )
    ),

    // Buttons
    React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } },
      React.createElement("button", {
        onClick: publishAll,
        disabled: publishing || !videoFile,
        style: {
          flex: 1, padding: "10px 0",
          background: publishing ? "#91caff" : "#1677ff",
          color: "#fff", border: "none", borderRadius: 6,
          fontSize: 15, fontWeight: 600, cursor: publishing ? "not-allowed" : "pointer"
        }
      }, publishing ? "\u53d1\u5e03\u4e2d..." : "\u53d1\u5e03\u5230\u6240\u9009\u5e73\u53f0"),
      React.createElement("button", {
        onClick: clearDraft,
        style: {
          padding: "10px 16px",
          background: "#fff", color: "#ff4d4f", border: "1px solid #ff4d4f", borderRadius: 6,
          fontSize: 13, cursor: "pointer"
        }
      }, I.delete, "\u6e05\u9664\u8349\u7a3f")
    ),

    // Status log
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 500, color: "#888", marginBottom: 4 } }, "\u8fd0\u884c\u65e5\u5fd7"),
      React.createElement("div", {
        style: {
          background: "#f6f8fa", border: "1px solid #e8e8e8", borderRadius: 6,
          padding: 8, height: 200, overflowY: "auto", fontSize: 11,
          fontFamily: "'Courier New', monospace", color: "#333", lineHeight: 1.6
        }
      },
        status.length === 0
          ? React.createElement("div", { style: { color: "#bbb" } }, "\u6682\u65e0\u65e5\u5fd7")
          : status.map(function(s, i) { return React.createElement("div", { key: i }, s) })
      )
    ),

    React.createElement("div", { style: { fontSize: 11, color: "#bbb", textAlign: "center", borderTop: "1px solid #eee", paddingTop: 8 } },
      "v" + VERSION
    )
  )
}

export default SidePanel