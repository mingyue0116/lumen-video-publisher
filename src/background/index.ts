// ===== Video Publisher - Background Script v3.0 =====
// 双路径注入：1) File.path 直连 CDP  2) dataUrl → downloads → CDP
const VERSION = "3.1.4"
const TASKS_KEY = "publishTasks"

interface PlatformState {
  status: string; tabId?: number; url?: string; error?: string; claimedAt?: number; waitingLoginSince?: number
}
interface PublishTask {
  taskId: string; groupId?: number; title: string; content: string
  tags: string[]; videoFileName: string; videoFileType: string
  videoFilePath: string; videoDataUrl: string   // ← 双保险
  createdAt: number; updatedAt: number
  platforms: Record<string, PlatformState>
}

const PLATFORM_URLS: Record<string, string> = {
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
  xiaohongshu: "https://creator.xiaohongshu.com/publish/publish?from=menu&target=video",
  bilibili: "https://member.bilibili.com/platform/upload/video/frame",
  shipinhao: "https://channels.weixin.qq.com/platform/post/create",
  twitter: "https://x.com/compose/post"
}

function notifyUser(title: string, message: string) {
  try {
    var icons = (chrome.runtime.getManifest() as any).icons || {}
    var iconUrl = icons["128"] || icons["64"] || icons["48"] || icons["32"] || icons["16"] || ""
    if (iconUrl) iconUrl = chrome.runtime.getURL(iconUrl)
    chrome.notifications.create({
      type: "basic",
      iconUrl: iconUrl,
      title: title,
      message: message
    }).catch(function () { })
  } catch (e) { }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id })
})
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// ===== Message Router =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "CREATE_TASK") {
    handleCreateTask(msg.payload).then(t => sendResponse({ success: true, task: t }))
      .catch(e => sendResponse({ success: false, error: e.message })); return true
  }
  if (msg.action === "GET_TASKS") {
    getTasks().then(t => sendResponse({ success: true, tasks: t }))
      .catch(e => sendResponse({ success: false, error: e.message })); return true
  }
  if (msg.action === "START_PUBLISH") {
    startPublishTask(msg.taskId).then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message })); return true
  }
  if (msg.action === "CLAIM_TASK") {
    handleClaimTask(msg.platform, sender).then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, reason: e.message })); return true
  }
  if (msg.action === "HEARTBEAT") {
    handleHeartbeat(msg.platform, sender.tab?.id, msg.url)
      .then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true
  }
  if (msg.action === "UPDATE_TASK_STATUS") {
    updateTaskStatus(msg.taskId, msg.platform, msg.status, msg.error)
      .then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true
  }
  if (msg.action === "CLEAR_TASKS") {
    clearCompletedTasks().then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false })); return true
  }
  if (msg.action === "CLOSE_WORKSPACE") {
    closeWorkspace(msg.taskId).then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message })); return true
  }
  // ===== CDP Injection =====
  if (msg.action === "INJECT_VIDEO_CDP") {
    var tabId = sender.tab?.id
    if (!tabId) { sendResponse({ success: false, error: "No tab ID" }); return true }
    injectVideo(tabId, msg.taskId).then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message })); return true
  }
})

// ===== Core: Video Injection (双路径) =====
async function injectVideo(tabId: number, taskId: string): Promise<any> {
  var tasks = await getTasks()
  var task: PublishTask | null = null
  for (var i = 0; i < tasks.length; i++) { if (tasks[i].taskId === taskId) { task = tasks[i]; break } }
  if (!task) throw new Error("Task not found: " + taskId)

  // 路径 A: File.path 直连（最快，最可靠）
  if (task.videoFilePath) {
    console.log("[BG] PATH A: Using File.path:", task.videoFilePath)
    try {
      var result = await cdpInject(tabId, task.videoFilePath)
      if (result) return { method: "filepath", ...result }
      console.log("[BG] PATH A: CDP attached but injection failed")
    } catch (e: any) {
      console.log("[BG] PATH A failed:", e.message)
    }
  } else {
    console.log("[BG] PATH A: No videoFilePath in task")
  }

  // 路径 B: dataUrl 下载 → CDP
  if (task.videoDataUrl) {
    console.log("[BG] PATH B: Downloading from dataUrl...")
    try {
      var dlPath = await dlThenInject(tabId, task.videoDataUrl, task.videoFileName)
      if (dlPath) {
        var result2 = await cdpInject(tabId, dlPath)
        if (result2) return { method: "download", ...result2 }
      }
    } catch (e: any) {
      console.log("[BG] PATH B failed:", e.message)
    }
  } else {
    console.log("[BG] PATH B: No videoDataUrl in task")
  }

  throw new Error("Both injection paths failed. videoFilePath=" + (task.videoFilePath || "none") + " videoDataUrl=" + (task.videoDataUrl ? "present" : "none"))
}

// ===== CDP Injection (supports top doc + shadow DOM + same-origin iframes) =====
async function cdpInject(tabId: number, filePath: string): Promise<any> {
  var dbg = { tabId: tabId }
  console.log("[BG] CDP: attaching, path=", filePath)

  await chrome.debugger.attach(dbg, "1.3")
  console.log("[BG] CDP: attached")

  try {
    var rootId = await getRootNodeId(dbg)
    var nids = await collectFileInputs(dbg, rootId)
    console.log("[BG] CDP: initial file inputs:", nids.length)

    // If none, click upload triggers and retry
    if (nids.length === 0) {
      console.log("[BG] CDP: clicking upload triggers...")
      await chrome.debugger.sendCommand(dbg, "Runtime.evaluate", {
        expression: `
          (function(){
            function clickInRoot(root){
              if(!root) return false;
              var a=root.querySelectorAll('button,div,span,label,[class*=upload],[class*=Upload]');
              for(var i=0;i<a.length;i++){
                var t=(a[i].textContent||'').toLowerCase();
                if(/上传|upload|选择视频|select video|发布|点击|choose|拖拽|drag/i.test(t)){
                  try{a[i].click()}catch(e){}
                  return true;
                }
              }
              // shadow roots
              var all=root.querySelectorAll('*');
              for(var i=0;i<all.length;i++){
                if(all[i].shadowRoot && clickInRoot(all[i].shadowRoot)) return true;
              }
              // iframes
              var fs=root.querySelectorAll('iframe');
              for(var i=0;i<fs.length;i++){
                try{ if(clickInRoot(fs[i].contentDocument)) return true; }catch(e){}
              }
              return false;
            }
            return clickInRoot(document);
          })()`,
        returnByValue: true
      })
      for (var retry = 0; retry < 12; retry++) {
        await new Promise(r => setTimeout(r, 2000))
        rootId = await getRootNodeId(dbg)
        nids = await collectFileInputs(dbg, rootId)
        console.log("[BG] CDP: retry", retry + 1, "found", nids.length, "file inputs")
        if (nids.length > 0) break
      }
    }

    if (nids.length === 0) throw new Error("No file input found on page")

    // Prefer video-specific inputs
    var vidNids: number[] = []
    for (var i = 0; i < nids.length; i++) {
      try {
        var attrs = (await chrome.debugger.sendCommand(dbg, "DOM.getAttributes", { nodeId: nids[i] }) as any).attributes || []
        var acceptIdx = attrs.indexOf("accept")
        if (acceptIdx >= 0 && (attrs[acceptIdx + 1] || "").toLowerCase().indexOf("video") >= 0) {
          vidNids.push(nids[i])
        }
      } catch (e) { }
    }
    if (vidNids.length > 0) nids = vidNids

    // Try injection
    for (var i = 0; i < nids.length; i++) {
      try {
        console.log("[BG] CDP: inject nodeId=", nids[i], "files=[" + filePath + "]")
        await chrome.debugger.sendCommand(dbg, "DOM.setFileInputFiles", { nodeId: nids[i], files: [filePath] })
        console.log("[BG] CDP: SUCCESS! nodeId=", nids[i])
        return { injected: true, nodeId: nids[i], filePath: filePath }
      } catch (e: any) {
        console.log("[BG] CDP: nodeId", nids[i], "failed:", e.message)
      }
    }
    throw new Error("CDP injection failed on all " + nids.length + " file inputs")
  } finally {
    try { await chrome.debugger.detach(dbg) } catch (_) { }
  }
}

async function getRootNodeId(dbg: any): Promise<number> {
  var doc = await chrome.debugger.sendCommand(dbg, "DOM.getDocument", { depth: -1, pierce: true }) as any
  return doc.root.nodeId
}

async function collectFileInputs(dbg: any, rootId: number): Promise<number[]> {
  var found: number[] = []
  var visited = new Set<number>()
  async function walk(nodeId: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    try {
      var node = await chrome.debugger.sendCommand(dbg, "DOM.querySelector", { nodeId: nodeId, selector: 'input[type="file"]' }) as any
      if (node && node.nodeId) found.push(node.nodeId)
    } catch (e) { }
    // Query direct children including iframes
    try {
      var children = await chrome.debugger.sendCommand(dbg, "DOM.requestChildNodes", { nodeId: nodeId, depth: 1, pierce: true }) as any
    } catch (e) { }
    // Recurse into children via querySelectorAll on this subtree
    try {
      var all = await chrome.debugger.sendCommand(dbg, "DOM.querySelectorAll", { nodeId: nodeId, selector: '*' }) as any
      var ids: number[] = all.nodeIds || []
      for (var i = 0; i < ids.length; i++) {
        try {
          var info = await chrome.debugger.sendCommand(dbg, "DOM.describeNode", { nodeId: ids[i], depth: 1 }) as any
          var n = info.node
          if (n && n.nodeName === "INPUT" && n.attributes) {
            var ai = n.attributes.indexOf("type")
            if (ai >= 0 && n.attributes[ai + 1] === "file") {
              if (found.indexOf(ids[i]) < 0) found.push(ids[i])
            }
          }
          // iframe contentDocument
          if (n && n.contentDocument && n.contentDocument.nodeId) {
            await walk(n.contentDocument.nodeId)
          }
          // shadow roots
          if (n && n.shadowRoots && n.shadowRoots.length) {
            for (var sr = 0; sr < n.shadowRoots.length; sr++) {
              if (n.shadowRoots[sr].nodeId) await walk(n.shadowRoots[sr].nodeId)
            }
          }
        } catch (e) { }
      }
    } catch (e) { }
  }
  await walk(rootId)
  return found
}

// ===== Path B: Download dataUrl → get path → CDP =====
async function dlThenInject(tabId: number, dataUrl: string, fileName: string): Promise<string | null> {
  var safeName = (fileName || "video.mp4").replace(/[<>:"/\\|?*]/g, "_")
  var dlFilename = "video-publisher-temp/" + safeName

  console.log("[BG] PATH B: downloading as", dlFilename)

  // Use data: URL directly (NO blob URL conversion!)
  var dlId = await new Promise<number | undefined>(function (resolve) {
    chrome.downloads.download({
      url: dataUrl,
      filename: dlFilename,
      conflictAction: "overwrite",
      saveAs: false
    }, function (id) {
      if (chrome.runtime.lastError) {
        console.log("[BG] PATH B: download error:", chrome.runtime.lastError.message)
        resolve(undefined)
      } else {
        resolve(id)
      }
    })
  })

  if (!dlId) { console.log("[BG] PATH B: download failed to start"); return null }

  // Wait for completion
  var dlFilenameResult = await new Promise<string | null>(function (resolve) {
    var attempts = 0
    var iv = setInterval(function () {
      attempts++
      chrome.downloads.search({ id: dlId }, function (results) {
        if (results.length === 0) { clearInterval(iv); resolve(null); return }
        var d = results[0]
        if (d.state === "complete") {
          clearInterval(iv)
          console.log("[BG] PATH B: download complete. filename from API:", d.filename)
          resolve(d.filename)
          return
        }
        if (d.state === "interrupted") {
          clearInterval(iv); console.log("[BG] PATH B: download interrupted"); resolve(null); return
        }
        if (attempts > 240) { // 2 min timeout
          clearInterval(iv); console.log("[BG] PATH B: download timeout"); resolve(null)
        }
      })
    }, 500)
  })

  if (!dlFilenameResult) return null

  // The filename from downloads API on Windows should be absolute
  console.log("[BG] PATH B: resolved path:", dlFilenameResult)
  return dlFilenameResult
}

// ===== Task CRUD =====
async function getTasks(): Promise<PublishTask[]> {
  var r = await chrome.storage.local.get([TASKS_KEY])
  return r[TASKS_KEY] || []
}
async function saveTasks(t: PublishTask[]) { await chrome.storage.local.set({ [TASKS_KEY]: t }) }

// ===== Storage mutex — serializes read-modify-write to prevent race conditions =====
var _storageLock: Promise<any> = Promise.resolve()
function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  var p = _storageLock.then(function () { return fn() })
  _storageLock = p.then(function () { }, function () { })  // clear regardless of result
  return p
}

async function handleCreateTask(payload: any): Promise<PublishTask> {
  return withStorageLock(async function () {
    var filePath = payload.videoFilePath || ""
    var dataUrl = payload.videoDataUrl || ""
    // 如果已经有本地路径，就不需要把巨大的 dataUrl 存进 storage，避免超限
    if (filePath) dataUrl = ""
    // 兜底 dataUrl 也不能太大（storage.local 单条约 10MB）
    if (dataUrl.length > 8 * 1024 * 1024) {
      console.warn("[BG] DataUrl too large, truncating fallback")
      dataUrl = ""
    }

    var task: PublishTask = {
      taskId: "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      title: payload.title || "", content: payload.content || "", tags: payload.tags || [],
      videoFileName: payload.videoFileName || "video.mp4",
      videoFileType: payload.videoFileType || "video/mp4",
      videoFilePath: filePath,
      videoDataUrl: dataUrl,
      createdAt: Date.now(), updatedAt: Date.now(), platforms: {}
    }
    var plats = payload.platforms || ["douyin"]
    for (var i = 0; i < plats.length; i++) { task.platforms[plats[i]] = { status: "pending" } }
    var tasks = await getTasks()
    tasks.push(task)
    await saveTasks(tasks)
    console.log("[BG] Task created:", task.taskId,
      "path:", task.videoFilePath || "(none)",
      "dataUrl:", task.videoDataUrl ? task.videoDataUrl.length + " bytes" : "(none)")
    return task
  })
}

async function updateTaskStatus(taskId: string, platform: string, st: string, err?: string) {
  await withStorageLock(async function () {
    var tasks = await getTasks()
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].taskId === taskId && tasks[i].platforms[platform]) {
        tasks[i].platforms[platform].status = st
        if (st === "waiting_login" && !tasks[i].platforms[platform].waitingLoginSince) {
          tasks[i].platforms[platform].waitingLoginSince = Date.now()
        }
        if (st !== "waiting_login") {
          tasks[i].platforms[platform].waitingLoginSince = undefined
        }
        if (err) tasks[i].platforms[platform].error = err
        tasks[i].updatedAt = Date.now()
        await saveTasks(tasks)
        updateGroupTitle(tasks[i]).catch(function () { })
        break
      }
    }
  })
}

async function clearCompletedTasks() {
  await withStorageLock(async function () {
    var tasks = await getTasks(); var remaining: PublishTask[] = []
    for (var i = 0; i < tasks.length; i++) {
      var allDone = true
      var keys = Object.keys(tasks[i].platforms)
      for (var j = 0; j < keys.length; j++) {
        if (tasks[i].platforms[keys[j]].status !== "done" && tasks[i].platforms[keys[j]].status !== "error") { allDone = false; break }
      }
      if (!allDone) remaining.push(tasks[i])
    }
    await saveTasks(remaining)
  })
}

// ===== Workspace =====
async function startPublishTask(taskId: string) {
  var tasks = await getTasks(); var task: PublishTask | null = null
  for (var i = 0; i < tasks.length; i++) { if (tasks[i].taskId === taskId) { task = tasks[i]; break } }
  if (!task) throw new Error("Task not found: " + taskId)

  var tabIds: number[] = []
  var platformKeys = Object.keys(task.platforms)
  for (var i = 0; i < platformKeys.length; i++) {
    var plat = platformKeys[i]; var url = PLATFORM_URLS[plat]
    if (!url) continue
    try {
      var tab = await chrome.tabs.create({ url: url, active: false })
      task.platforms[plat].tabId = tab.id
      task.platforms[plat].url = url
      // Only advance from "pending" — don't overwrite if CS already claimed
      if (task.platforms[plat].status === "pending") {
        task.platforms[plat].status = "opened"
      }
      tabIds.push(tab.id!)
      console.log("[BG] Tab opened for", plat, "tabId=", tab.id, "status=", task.platforms[plat].status)
    } catch (e: any) { task.platforms[plat].status = "error"; task.platforms[plat].error = e.message }
  }
  if (tabIds.length > 0) {
    try {
      var groupId = await chrome.tabs.group({ tabIds: tabIds })
      task.groupId = groupId
      await chrome.tabGroups.update(groupId, { title: "发布 " + (task.title || "").slice(0, 15), color: "blue", collapsed: false })
      console.log("[BG] Workspace group created:", groupId)
    } catch (e: any) { console.log("[BG] Group err:", e.message) }
  }

  // ★ Re-read before saving to avoid overwriting CS claim changes
  // Each tab creation took ~1s — CS may have already claimed in the meantime
  await withStorageLock(async function () {
    var freshTasks = await getTasks()
    for (var i = 0; i < freshTasks.length; i++) {
      if (freshTasks[i].taskId === taskId) {
        for (var j = 0; j < platformKeys.length; j++) {
          var plat = platformKeys[j]
          if (task.platforms[plat].tabId) {
            freshTasks[i].platforms[plat].tabId = task.platforms[plat].tabId
          }
          if (task.platforms[plat].url) {
            freshTasks[i].platforms[plat].url = task.platforms[plat].url
          }
          // Only advance "pending" → "opened"; respect CS changes
          if (freshTasks[i].platforms[plat].status === "pending") {
            freshTasks[i].platforms[plat].status = "opened"
          }
        }
        freshTasks[i].groupId = task.groupId
        freshTasks[i].updatedAt = Date.now()
        break
      }
    }
    await saveTasks(freshTasks)
  })
}

async function updateGroupTitle(task: PublishTask) {
  if (!task.groupId) return
  var keys = Object.keys(task.platforms); var done = 0; var hasErr = false
  for (var i = 0; i < keys.length; i++) {
    if (task.platforms[keys[i]].status === "done") done++
    if (task.platforms[keys[i]].status === "error") hasErr = true
  }
  try {
    await chrome.tabGroups.update(task.groupId, {
      title: "发布 " + done + "/" + keys.length + (hasErr ? " ✖" : ""),
      color: hasErr ? "red" : (done === keys.length ? "green" : "blue")
    })
  } catch (e) { }
}

// ===== Guardian =====
var giv: any = null
function startGuardian() { if (!giv) giv = setInterval(runGuardian, 10000) }
async function runGuardian() {
  try {
    var tasks = await getTasks()
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i]; if (!task.groupId) continue
      var ks = Object.keys(task.platforms)  // ★ 声明在 try-catch 外，两个分支都能访问
      var groupGone = false
      try { await chrome.tabGroups.get(task.groupId) } catch (e) { groupGone = true }

      if (groupGone) {
        for (var j = 0; j < ks.length; j++) {
          var s = task.platforms[ks[j]].status
          if (s === "opened" || s === "claimed" || s === "filling") { task.platforms[ks[j]].status = "error"; task.platforms[ks[j]].error = "Workspace closed" }
        }
        task.updatedAt = Date.now(); continue
      }
      for (var j = 0; j < ks.length; j++) {
        var ps = task.platforms[ks[j]]; if (!ps.tabId) continue
        if (ps.status === "done" || ps.status === "error") continue
        if (ps.status === "waiting_login") {
          // Notify user once if stuck on login for > 10s
          if (ps.waitingLoginSince && Date.now() - ps.waitingLoginSince > 10000) {
            notifyUser("视频号需要登录", "请切换到视频号标签页，用微信扫码登录。登录成功后会自动继续发布。")
          }
          continue
        }
        try {
          var tab = await chrome.tabs.get(ps.tabId)
          if (tab.groupId !== task.groupId) { ps.status = "error"; ps.error = "Tab left workspace" }
        } catch (e) { ps.status = "error"; ps.error = "Tab closed" }
      }
    }
    await withStorageLock(async function () { await saveTasks(tasks) })
    for (var i = 0; i < tasks.length; i++) { if (tasks[i].groupId) updateGroupTitle(tasks[i]).catch(function () { }) }
  } catch (e: any) { console.log("[Guardian]:", e.message) }
}
startGuardian()

// ===== Close Workspace =====
async function closeWorkspace(taskId: string) {
  var tasks = await getTasks(); var task: PublishTask | null = null
  for (var i = 0; i < tasks.length; i++) { if (tasks[i].taskId === taskId) { task = tasks[i]; break } }
  if (!task) throw new Error("Task not found")
  var tabIds: number[] = []
  var ks = Object.keys(task.platforms)
  for (var i = 0; i < ks.length; i++) { if (task.platforms[ks[i]].tabId) tabIds.push(task.platforms[ks[i]].tabId!) }
  try {
    if (task.groupId) await chrome.tabs.ungroup(tabIds)
    for (var i = 0; i < tabIds.length; i++) chrome.tabs.remove(tabIds[i]).catch(function () { })
  } catch (e: any) { console.log("[Close]:", e.message) }
}

// ===== Claim Task =====
async function handleClaimTask(platform: string, sender: any): Promise<any> {
  if (!platform) return { ok: false, reason: "NO_PLATFORM" }

  // Quick checks outside the lock (read-only)
  var tabId = sender.tab?.id
  if (!tabId) return { ok: false, reason: "NO_TABID" }

  // Locked read-modify-write to prevent race with other platforms
  return withStorageLock(async function () {
    var tasks = await getTasks()
    var task: PublishTask | null = null
    for (var i = 0; i < tasks.length; i++) {
      var ps = tasks[i].platforms[platform]
      if (ps && (ps.status === "pending" || ps.status === "opened" || ps.status === "waiting_login")) { task = tasks[i]; break }
    }
    if (!task) return { ok: false, reason: "NO_TASK" }
    if (task.groupId) {
      try { if ((await chrome.tabs.get(tabId)).groupId !== task.groupId) return { ok: false, reason: "WRONG_WORKSPACE" } }
      catch (e) { return { ok: false, reason: "TAB_ERROR" } }
    }
    task.platforms[platform].status = "claimed"
    task.platforms[platform].tabId = tabId
    task.platforms[platform].claimedAt = Date.now()
    task.platforms[platform].url = sender.tab?.url || ""
    task.updatedAt = Date.now()
    await saveTasks(tasks)
    updateGroupTitle(task).catch(function () { })
    return {
      ok: true, taskId: task.taskId,
      platformData: {
        taskId: task.taskId, platform: platform,
        title: task.title, content: task.content, tags: task.tags,
        videoFileName: task.videoFileName, videoFileType: task.videoFileType,
        videoFilePath: task.videoFilePath
      }
    }
  })
}

async function handleHeartbeat(platform: string, tabId: number | undefined, url: string | undefined) {
  if (platform) await chrome.storage.local.set({ ["hb_" + platform]: { tabId, url, lastSeenAt: Date.now() } })
}
