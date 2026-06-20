import React, { useState, useRef, useEffect } from "react"

const VERSION = "3.2.0"
const DRAFT_KEY = "publish_draft_v3"
// ★ 分块大小：1.5MB（base64 后约 2MB，安全在 chrome 消息体限制内）
const CHUNK_BYTES = 1.5 * 1024 * 1024

var I: Record<string, React.ReactElement> = {
  douyin: React.createElement("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 3 } },
    React.createElement("path", { d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" })
  ),
  xiaohongshu: React.createElement("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 3 } },
    React.createElement("path", { d: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 14h-9a.5.5 0 01-.5-.5v-7a.5.5 0 01.5-.5h9a.5.5 0 01.5.5v7a.5.5 0 01-.5.5z" })
  ),
  bilibili: React.createElement("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 3 } },
    React.createElement("path", { d: "M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 01-.373-.906c0-.356.124-.662.373-.92.249-.258.555-.387.92-.387.364 0 .671.129.92.387L9.333 4.44c.182.173.32.364.414.573.093.209.14.427.14.654H14.5c0-.227.047-.445.14-.654.094-.209.232-.4.414-.573l2.666-2.587c.24-.258.542-.387.907-.387.364 0 .671.129.92.387.249.258.373.564.373.92 0 .355-.124.662-.373.907l-1.174 1.12h.086z" })
  ),
  shipinhao: React.createElement("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 3 } },
    React.createElement("path", { d: "M8.75 21V3l14 9-14 9z" })
  ),
  twitter: React.createElement("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "currentColor", style: { verticalAlign: "middle", marginRight: 3 } },
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

var PN: Record<string, string> = {
  douyin: "\u6296\u97f3", xiaohongshu: "\u5c0f\u7ea2\u4e66",
  bilibili: "B\u7ad9", shipinhao: "\u89c6\u9891\u53f7", twitter: "Twitter"
}

var SL: Record<string, string> = {
  pending: "\u5f85\u53d1\u5e03", opened: "\u9875\u9762\u5df2\u6253\u5f00",
  claimed: "\u5df2\u63a5\u53d7\u4efb\u52a1", filling: "\u586b\u5199\u4e2d",
  done: "\u5df2\u5b8c\u6210", error: "\u5931\u8d25"
}
var SC: Record<string, string> = {
  pending: "#999", opened: "#1677ff", claimed: "#52c41a",
  filling: "#faad14", done: "#52c41a", error: "#ff4d4f"
}

function SidePanel() {
  var _a = useState<File | null>(null), vf = _a[0], setVf = _a[1]
  var _b = useState(""), vn = _b[0], setVn = _b[1]
  var _c = useState(""), vs = _c[0], setVs = _c[1]
  var _d = useState(""), title = _d[0], setTitle = _d[1]
  var _e = useState(""), content = _e[0], setContent = _e[1]
  var _f = useState(""), tags = _f[0], setTags = _f[1]
  var _g = useState<any[]>([]), tasks = _g[0], setTasks = _g[1]
  var _h = useState(false), pub = _h[0], setPub = _h[1]
  var _h2 = useState(""), pubText = _h2[0], setPubText = _h2[1]
  var _i = useState<Set<string>>(new Set(["douyin"])), sel = _i[0], setSel = _i[1]
  var vr = useRef<HTMLInputElement>(null)
  var tr = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(function() {
    load()
    tr.current = setInterval(load, 3000)
    return function() { if (tr.current) clearInterval(tr.current) }
  }, [])

  function load() {
    chrome.runtime.sendMessage({ action: "GET_TASKS" }, function(r) {
      if (r && r.success) setTasks(r.tasks || [])
    })
  }

  function toggle(id: string) {
    setSel(function(p) { var n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function parseTags(inp: string): string[] {
    return inp.split(/[\s,\u3001]+/).filter(function(t) { return t.trim().length > 0 })
  }

  async function onVideo(e: React.ChangeEvent<HTMLInputElement>) {
    var fs = e.target.files
    if (!fs || fs.length === 0) return
    var f = fs[0]; setVf(f); setVn(f.name); setVs((f.size / 1024 / 1024).toFixed(1) + "MB")
  }

  // 把视频文件分块读成 base64，逐块发给 background 暂存，返回 storeId
  async function uploadVideoChunks(file: File, onProgress: (p: number) => void): Promise<string> {
    var totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_BYTES))
    var storeId = ""
    var type = file.type || "video/mp4"

    for (var i = 0; i < totalChunks; i++) {
      var start = i * CHUNK_BYTES
      var end = Math.min(start + CHUNK_BYTES, file.size)
      var blob = file.slice(start, end)

      var base64 = await new Promise<string>(function(res, rej) {
        var r = new FileReader()
        r.onload = function() {
          // readAsDataURL 返回 "data:...;base64,XXXX"，只取后面的纯 base64
          var s = r.result as string
          var idx = s.indexOf(",")
          res(idx >= 0 ? s.slice(idx + 1) : s)
        }
        r.onerror = function() { rej(new Error("读取视频分块失败 chunk " + i)) }
        r.readAsDataURL(blob)
      })

      var resp = await chrome.runtime.sendMessage({
        action: "STORE_VIDEO_CHUNK",
        storeId: storeId,         // 第一片为空，background 会生成并返回
        name: file.name, type: type,
        chunk: base64,
        done: i === totalChunks - 1,
        totalBytes: file.size
      })
      if (!resp || !resp.success) throw new Error("上传视频分块失败 chunk " + i + ": " + (resp && resp.error))
      if (!storeId) storeId = resp.storeId
      onProgress(Math.round(((i + 1) / totalChunks) * 100))
    }
    return storeId
  }

  async function publishAll() {
    console.log("[SidePanel] publishAll called. vf=", !!vf, "sel.size=", sel.size)
    if (!vf || sel.size === 0) {
      console.warn("[SidePanel] publishAll blocked: no file or no platforms")
      if (!vf) alert("请先选择视频文件！")
      return
    }
    setPub(true)
    setPubText("读取视频 0%")

    try {
      // 分块把视频字节流到 background 内存（不再用 File.path / dataUrl）
      var storeId = await uploadVideoChunks(vf!, function(p) {
        setPubText("读取视频 " + p + "%")
      })
      console.log("[SidePanel] video stored, storeId=", storeId)

      var tl = parseTags(tags)
      var pls = Array.from(sel)

      setPubText("创建任务…")
      var r = await chrome.runtime.sendMessage({
        action: "CREATE_TASK",
        payload: {
          title: title, content: content, tags: tl,
          videoStoreId: storeId,
          videoFileName: vf!.name, videoFileType: vf!.type || "video/mp4",
          platforms: pls
        }
      })

      if (!r || !r.success) {
        console.error("[SidePanel] Create failed:", r)
        alert("创建任务失败: " + (r && r.error ? r.error : "请检查 Background 日志"))
        return
      }

      setPubText("打开平台…")
      await chrome.runtime.sendMessage({ action: "START_PUBLISH", taskId: r.task.taskId })
      load()
    } catch(err: any) {
      console.error("[SidePanel] publishAll error:", err)
      alert("发布出错: " + (err.message || err))
    } finally {
      setPub(false)
      setPubText("")
    }
  }

  function clearDraft() {
    setVf(null); setVn(""); setVs(""); setTitle(""); setContent(""); setTags("")
    chrome.storage.local.remove([DRAFT_KEY], function() {})
    if (vr.current) vr.current.value = ""
  }

  function closeTask(taskId: string) {
    chrome.runtime.sendMessage({ action: "CLOSE_WORKSPACE", taskId: taskId }, function() { load() })
  }

  function clearCompleted() {
    chrome.runtime.sendMessage({ action: "CLEAR_TASKS" }, function() { load() })
  }

  return React.createElement("div", { style: { padding: 10, fontFamily: "-apple-system, sans-serif", fontSize: 12, color: "#333", maxWidth: 380 } },

    React.createElement("div", { style: { textAlign: "center", marginBottom: 10 } },
      React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#1677ff" } }, "\u89c6\u9891\u591a\u5e73\u53f0\u53d1\u5e03\u5668"),
      React.createElement("div", { style: { fontSize: 10, color: "#999" } }, "v" + VERSION + " \u5de5\u4f5c\u533a\u6a21\u5f0f")
    ),

    React.createElement("div", { style: { marginBottom: 6, display: "flex", gap: 4, alignItems: "center" } },
      React.createElement("button", { onClick: function() { vr.current?.click() }, style: { padding: "4px 10px", background: "#1677ff", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11 } }, "\u89c6\u9891"),
      React.createElement("input", { ref: vr, type: "file", accept: "video/*", onChange: onVideo, style: { display: "none" } }),
      vn ? React.createElement("span", { style: { fontSize: 10, color: "#666" } }, vn + " (" + vs + ")") : null
    ),

    React.createElement("div", { style: { marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 3 } },
      PLATFORMS.map(function(p) {
        return React.createElement("button", {
          key: p.id, onClick: function() { toggle(p.id) },
          style: {
            display: "inline-flex", alignItems: "center", padding: "3px 6px",
            border: "1px solid " + (sel.has(p.id) ? "#1677ff" : "#d9d9d9"),
            borderRadius: 3, background: sel.has(p.id) ? "#e6f4ff" : "#fff",
            color: sel.has(p.id) ? "#1677ff" : "#666", cursor: "pointer", fontSize: 11
          }
        }, p.icon, p.label)
      })
    ),

    React.createElement("div", { style: { marginBottom: 6 } },
      React.createElement("input", {
        value: title, onChange: function(e) { setTitle(e.target.value) },
        placeholder: "\u89c6\u9891\u6807\u9898",
        style: { width: "100%", padding: "5px 6px", border: "1px solid #d9d9d9", borderRadius: 3, fontSize: 12, boxSizing: "border-box" }
      })
    ),

    React.createElement("div", { style: { marginBottom: 6 } },
      React.createElement("textarea", {
        value: content, onChange: function(e) { setContent(e.target.value) },
        placeholder: "\u4f5c\u54c1\u7b80\u4ecb", rows: 2,
        style: { width: "100%", padding: "5px 6px", border: "1px solid #d9d9d9", borderRadius: 3, fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }
      })
    ),

    React.createElement("div", { style: { marginBottom: 6 } },
      React.createElement("input", {
        value: tags, onChange: function(e) { setTags(e.target.value) },
        placeholder: "\u8bdd\u9898 (\u7a7a\u683c\u5206\u9694)",
        style: { width: "100%", padding: "5px 6px", border: "1px solid #d9d9d9", borderRadius: 3, fontSize: 12, boxSizing: "border-box" }
      })
    ),

    React.createElement("div", { style: { display: "flex", gap: 3, marginBottom: 6 } },
      React.createElement("button", {
        onClick: publishAll, disabled: pub || !vf,
        style: {
          flex: 1, padding: "6px 0", background: pub ? "#91caff" : "#1677ff",
          color: "#fff", border: "none", borderRadius: 3, fontSize: 12, fontWeight: 600,
          cursor: pub ? "not-allowed" : "pointer"
        }
      }, pub ? (pubText || "\u53d1\u5e03\u4e2d...") : "\u53d1\u5e03"),
      React.createElement("button", {
        onClick: clearDraft,
        style: { padding: "6px 10px", background: "#fff", color: "#ff4d4f", border: "1px solid #ff4d4f", borderRadius: 3, fontSize: 11, cursor: "pointer" }
      }, "\u6e05\u9664")
    ),

    React.createElement("div", { style: { marginBottom: 6 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 500, color: "#888", marginBottom: 3, display: "flex", justifyContent: "space-between" } },
        React.createElement("span", null, "\u4efb\u52a1\u5de5\u4f5c\u533a"),
        React.createElement("span", { onClick: clearCompleted, style: { cursor: "pointer", color: "#1677ff" } }, "\u6e05\u7406\u5df2\u5b8c\u6210")
      ),
      React.createElement("div", { style: { maxHeight: 180, overflowY: "auto" } },
        tasks.length === 0
          ? React.createElement("div", { style: { color: "#bbb", fontSize: 10, padding: 6 } }, "\u6682\u65e0\u4efb\u52a1")
          : tasks.map(function(task: any, ti: number) {
            var pk = Object.keys(task.platforms || {})
            return React.createElement("div", {
              key: ti,
              style: { background: "#f6f8fa", borderRadius: 3, padding: 5, marginBottom: 3, fontSize: 10 }
            },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 } },
                React.createElement("span", { style: { color: "#333" } },
                  "#" + (task.taskId || "").slice(-6) + " " + (task.title || "").slice(0, 15)
                ),
                task.groupId
                  ? React.createElement("span", {
                      onClick: function() { closeTask(task.taskId) },
                      style: { color: "#ff4d4f", cursor: "pointer", fontSize: 10 }
                    }, "\u2716 \u5173\u95ed")
                  : null
              ),
              task.groupId
                ? React.createElement("div", { style: { fontSize: 9, color: "#999", marginBottom: 2 } },
                    "Group #" + task.groupId
                  )
                : null,
              pk.map(function(p: string) {
                var ps = task.platforms[p]
                var label = SL[ps.status] || ps.status
                var color = SC[ps.status] || "#999"
                return React.createElement("div", { key: p, style: { display: "flex", alignItems: "center", gap: 3, marginBottom: 1 } },
                  React.createElement("span", { style: { width: 5, height: 5, borderRadius: 2.5, background: color, display: "inline-block" } }),
                  React.createElement("span", null, (PN[p] || p) + ": "),
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
