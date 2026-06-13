import React, { useState, useRef, useEffect } from "react"

const VERSION = "2.1.0"
const DRAFT_KEY = "publish_draft_v3"

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
  )
}

var PLATFORMS = [
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

var STATUS_LABELS: Record<string, string> = {
  pending: "\u5f85\u53d1\u5e03", opened: "\u9875\u9762\u5df2\u6253\u5f00",
  claimed: "\u5df2\u63a5\u53d7\u4efb\u52a1", filling: "\u586b\u5199\u4e2d",
  done: "\u5df2\u5b8c\u6210", error: "\u5931\u8d25"
}

var STATUS_COLORS: Record<string, string> = {
  pending: "#999", opened: "#1677ff", claimed: "#52c41a",
  filling: "#faad14", done: "#52c41a", error: "#ff4d4f"
}

function SidePanel() {
  var _a = useState<File | null>(null), videoFile = _a[0], setVideoFile = _a[1]
  var _b = useState(""), videoName = _b[0], setVideoName = _b[1]
  var _c = useState(""), videoSize = _c[0], setVideoSize = _c[1]
  var _d = useState(""), title = _d[0], setTitle = _d[1]
  var _e = useState(""), content = _e[0], setContent = _e[1]
  var _f = useState(""), tags = _f[0], setTags = _f[1]
  var _g = useState<any[]>([]), tasks = _g[0], setTasks = _g[1]
  var _h = useState(false), publishing = _h[0], setPublishing = _h[1]
  var _i = useState<Set<string>>(new Set(["douyin"])), selected = _i[0], setSelected = _i[1]
  var videoRef = useRef<HTMLInputElement>(null)
  var timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll tasks
  useEffect(function() {
    loadTasks()
    timerRef.current = setInterval(loadTasks, 3000)
    return function() { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function loadTasks() {
    chrome.runtime.sendMessage({ action: "GET_TASKS" }, function(resp) {
      if (resp && resp.success) setTasks(resp.tasks || [])
    })
  }

  function togglePlatform(id: string) {
    setSelected(function(prev) {
      var next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function parseTags(input: string): string[] {
    return input.split(/[\s,\u3001]+/).filter(function(t) { return t.trim().length > 0 })
  }

  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files
    if (!files || files.length === 0) return
    var file = files[0]
    setVideoFile(file)
    setVideoName(file.name)
    setVideoSize((file.size / 1024 / 1024).toFixed(1) + "MB")
  }

  async function publishAll() {
    if (!videoFile) return
    if (selected.size === 0) return

    setPublishing(true)

    try {
      // Read video as data URL
      var dataUrl = await new Promise<string>(function(resolve, reject) {
        var reader = new FileReader()
        reader.onload = function() { resolve(reader.result as string) }
        reader.onerror = function() { reject(new Error("Read failed")) }
        reader.readAsDataURL(videoFile!)
      })

      // Store video
      var storageKey = "video_" + Date.now()
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

      // Create task
      var tagList = parseTags(tags)
      var platforms = Array.from(selected)

      var result = await chrome.runtime.sendMessage({
        action: "CREATE_TASK",
        payload: {
          title: title,
          content: content,
          tags: tagList,
          videoStorageKey: storageKey,
          videoFileName: videoFile.name,
          videoFileType: videoFile.type || "video/mp4",
          platforms: platforms
        }
      })

      if (!result || !result.success) {
        console.error("Create task failed", result)
        return
      }

      // Start publishing
      await chrome.runtime.sendMessage({
        action: "START_PUBLISH",
        taskId: result.task.taskId
      })

      loadTasks()
    } catch(err: any) {
      console.error("Publish error:", err)
    }

    setPublishing(false)
  }

  function clearDraft() {
    setVideoFile(null)
    setVideoName("")
    setVideoSize("")
    setTitle("")
    setContent("")
    setTags("")
    chrome.storage.local.remove([DRAFT_KEY], function() {})
    if (videoRef.current) videoRef.current.value = ""
  }

  function clearCompleted() {
    chrome.runtime.sendMessage({ action: "CLEAR_TASKS" }, function() { loadTasks() })
  }

  // ===== Render =====
  return React.createElement("div", { style: { padding: 12, fontFamily: "-apple-system, sans-serif", fontSize: 13, color: "#333", maxWidth: 400 } },

    React.createElement("div", { style: { textAlign: "center", marginBottom: 12 } },
      React.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#1677ff" } }, "\u89c6\u9891\u591a\u5e73\u53f0\u53d1\u5e03\u5668"),
      React.createElement("div", { style: { fontSize: 10, color: "#999" } }, "v" + VERSION + " \u4efb\u52a1\u961f\u5217\u6a21\u5f0f")
    ),

    // Video + Platforms
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("button", { onClick: function() { videoRef.current?.click() }, style: { padding: "6px 12px", background: "#1677ff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 } }, "\u9009\u62e9\u89c6\u9891"),
      React.createElement("input", { ref: videoRef, type: "file", accept: "video/*", onChange: handleVideoSelect, style: { display: "none" } }),
      videoName ? React.createElement("span", { style: { marginLeft: 8, fontSize: 11, color: "#666" } }, videoName + " (" + videoSize + ")") : null
    ),

    React.createElement("div", { style: { marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 } },
      PLATFORMS.map(function(p) {
        return React.createElement("button", {
          key: p.id, onClick: function() { togglePlatform(p.id) },
          style: {
            display: "inline-flex", alignItems: "center", padding: "4px 8px", border: "1px solid " + (selected.has(p.id) ? "#1677ff" : "#d9d9d9"),
            borderRadius: 4, background: selected.has(p.id) ? "#e6f4ff" : "#fff",
            color: selected.has(p.id) ? "#1677ff" : "#666", cursor: "pointer", fontSize: 12
          }
        }, p.icon, p.label)
      })
    ),

    // Title
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("input", {
        value: title, onChange: function(e) { setTitle(e.target.value) },
        placeholder: "\u89c6\u9891\u6807\u9898",
        style: { width: "100%", padding: "6px 8px", border: "1px solid #d9d9d9", borderRadius: 4, fontSize: 13, boxSizing: "border-box" }
      })
    ),

    // Description
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("textarea", {
        value: content, onChange: function(e) { setContent(e.target.value) },
        placeholder: "\u4f5c\u54c1\u7b80\u4ecb", rows: 3,
        style: { width: "100%", padding: "6px 8px", border: "1px solid #d9d9d9", borderRadius: 4, fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }
      })
    ),

    // Tags
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("input", {
        value: tags, onChange: function(e) { setTags(e.target.value) },
        placeholder: "\u8bdd\u9898\u6807\u7b7e (\u7a7a\u683c\u5206\u9694)",
        style: { width: "100%", padding: "6px 8px", border: "1px solid #d9d9d9", borderRadius: 4, fontSize: 13, boxSizing: "border-box" }
      })
    ),

    // Publish button
    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 8 } },
      React.createElement("button", {
        onClick: publishAll, disabled: publishing || !videoFile,
        style: {
          flex: 1, padding: "8px 0", background: publishing ? "#91caff" : "#1677ff",
          color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600,
          cursor: publishing ? "not-allowed" : "pointer"
        }
      }, publishing ? "\u53d1\u5e03\u4e2d..." : "\u53d1\u5e03"),
      React.createElement("button", {
        onClick: clearDraft,
        style: { padding: "8px 12px", background: "#fff", color: "#ff4d4f", border: "1px solid #ff4d4f", borderRadius: 4, fontSize: 12, cursor: "pointer" }
      }, "\u6e05\u9664")
    ),

    // Task status
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("div", { style: { fontSize: 11, fontWeight: 500, color: "#888", marginBottom: 4, display: "flex", justifyContent: "space-between" } },
        React.createElement("span", null, "\u4efb\u52a1\u72b6\u6001"),
        React.createElement("span", { onClick: clearCompleted, style: { cursor: "pointer", color: "#1677ff" } }, "\u6e05\u7406\u5df2\u5b8c\u6210")
      ),
      React.createElement("div", { style: { maxHeight: 200, overflowY: "auto" } },
        tasks.length === 0
          ? React.createElement("div", { style: { color: "#bbb", fontSize: 11, padding: 8 } }, "\u6682\u65e0\u4efb\u52a1")
          : tasks.map(function(task: any, ti: number) {
            var platKeys = Object.keys(task.platforms || {})
            return React.createElement("div", {
              key: ti,
              style: { background: "#f6f8fa", borderRadius: 4, padding: 6, marginBottom: 4, fontSize: 11 }
            },
              React.createElement("div", { style: { color: "#333", marginBottom: 4 } },
                "#" + (task.taskId || "").slice(-8) + " " + (task.title || "\u65e0\u6807\u9898").slice(0, 20)
              ),
              platKeys.map(function(pk: string) {
                var ps = task.platforms[pk]
                var label = STATUS_LABELS[ps.status] || ps.status
                var color = STATUS_COLORS[ps.status] || "#999"
                return React.createElement("div", { key: pk, style: { display: "flex", alignItems: "center", gap: 4, marginBottom: 2 } },
                  React.createElement("span", { style: { width: 6, height: 6, borderRadius: 3, background: color, display: "inline-block" } }),
                  React.createElement("span", null, (PLATFORM_NAMES[pk] || pk) + ": "),
                  React.createElement("span", { style: { color: color } }, label)
                )
              })
            )
          })
      )
    )
  )
}

export default SidePanel
