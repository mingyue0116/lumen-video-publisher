// ===== Video Publisher v2.2.0 - Workspace + Tab Group =====

const VERSION = "2.3.0"
const TASKS_KEY = "publishTasks"

interface PlatformState {
  status: string  // pending | opened | claimed | filling | done | error
  tabId?: number
  url?: string
  error?: string
  claimedAt?: number
}

interface PublishTask {
  taskId: string
  groupId?: number
  title: string
  content: string
  tags: string[]
  videoStorageKey: string
  videoFileName: string
  videoFileType: string
  createdAt: number
  updatedAt: number
  platforms: Record<string, PlatformState>
}

const PLATFORM_URLS: Record<string, string> = {
  douyin: "https://creator.douyin.com/creator-micro/content/upload",
  xiaohongshu: "https://creator.xiaohongshu.com/publish/publish?from=menu&target=video",
  bilibili: "https://member.bilibili.com/platform/upload/video/frame",
  shipinhao: "https://channels.weixin.qq.com/platform/post/create",
  twitter: "https://x.com/compose/post"
}

var PLATFORM_NAMES: Record<string, string> = {
  douyin: "抖音", xiaohongshu: "小红书",
  bilibili: "B站", shipinhao: "视频号", twitter: "Twitter"
}

// ===== Side Panel =====
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id })
})

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// ===== Message Router =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "CREATE_TASK") {
    handleCreateTask(msg.payload)
      .then((t) => sendResponse({ success: true, task: t }))
      .catch((e) => sendResponse({ success: false, error: e.message }))
    return true
  }
  if (msg.action === "GET_TASKS") {
    getTasks()
      .then((t) => sendResponse({ success: true, tasks: t }))
      .catch((e) => sendResponse({ success: false, error: e.message }))
    return true
  }
  if (msg.action === "START_PUBLISH") {
    startPublishTask(msg.taskId)
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }))
    return true
  }
  if (msg.action === "CLAIM_TASK") {
    handleClaimTask(msg.platform, sender)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: e.message }))
    return true
  }
  if (msg.action === "HEARTBEAT") {
    handleHeartbeat(msg.platform, sender.tab?.id, msg.url)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }
  if (msg.action === "UPDATE_TASK_STATUS") {
    updateTaskStatus(msg.taskId, msg.platform, msg.status, msg.error)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }
  if (msg.action === "CLEAR_TASKS") {
    clearCompletedTasks()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }))
    return true
  }
  if (msg.action === "CLOSE_WORKSPACE") {
    closeWorkspace(msg.taskId)
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }))
    return true
  }
})

// ===== Task CRUD =====
async function getTasks(): Promise<PublishTask[]> {
  var r = await chrome.storage.local.get([TASKS_KEY])
  return r[TASKS_KEY] || []
}

async function saveTasks(t: PublishTask[]) {
  await chrome.storage.local.set({ [TASKS_KEY]: t })
}

async function handleCreateTask(payload: any): Promise<PublishTask> {
  var task: PublishTask = {
    taskId: "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    title: payload.title || "",
    content: payload.content || "",
    tags: payload.tags || [],
    videoStorageKey: payload.videoStorageKey || "",
    videoFileName: payload.videoFileName || "video.mp4",
    videoFileType: payload.videoFileType || "video/mp4",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    platforms: {}
  }
  var plats = payload.platforms || ["douyin"]
  for (var p = 0; p < plats.length; p++) {
    task.platforms[plats[p]] = { status: "pending" }
  }
  var tasks = await getTasks()
  tasks.push(task)
  await saveTasks(tasks)
  return task
}

async function updateTaskStatus(taskId: string, platform: string, st: string, err?: string) {
  var tasks = await getTasks()
  for (var t = 0; t < tasks.length; t++) {
    if (tasks[t].taskId === taskId && tasks[t].platforms[platform]) {
      tasks[t].platforms[platform].status = st
      if (err) tasks[t].platforms[platform].error = err
      tasks[t].updatedAt = Date.now()
      updateGroupTitle(tasks[t]).catch(function() {})
      break
    }
  }
  await saveTasks(tasks)
}

async function clearCompletedTasks() {
  var tasks = await getTasks()
  var remaining: PublishTask[] = []
  for (var t = 0; t < tasks.length; t++) {
    var allDone = true
    var keys = Object.keys(tasks[t].platforms)
    for (var p = 0; p < keys.length; p++) {
      var st = tasks[t].platforms[keys[p]].status
      if (st !== "done" && st !== "error") { allDone = false; break }
    }
    if (!allDone) remaining.push(tasks[t])
  }
  await saveTasks(remaining)
}

// ===== Workspace: Start Publishing + Tab Group =====
async function startPublishTask(taskId: string) {
  var tasks = await getTasks()
  var task: PublishTask | null = null
  for (var t = 0; t < tasks.length; t++) {
    if (tasks[t].taskId === taskId) { task = tasks[t]; break }
  }
  if (!task) throw new Error("Task not found: " + taskId)

  // Create workspace: open all platform tabs first
  var tabIds: number[] = []
  var platformKeys = Object.keys(task.platforms)

  for (var p = 0; p < platformKeys.length; p++) {
    var plat = platformKeys[p]
    var url = PLATFORM_URLS[plat]
    if (!url) continue

    try {
      var tab = await chrome.tabs.create({ url: url, active: false })
      task.platforms[plat].status = "opened"
      task.platforms[plat].tabId = tab.id
      task.platforms[plat].url = url
      tabIds.push(tab.id)

      // Inject MAIN world script
      injectMainScript(tab.id).catch(function(e) {
        console.log("[BG] Inject:", e.message)
      })
    } catch(e: any) {
      task.platforms[plat].status = "error"
      task.platforms[plat].error = e.message
    }
  }

  // Create tab group for all platform tabs
  if (tabIds.length > 0) {
    try {
      var groupId = await chrome.tabs.group({ tabIds: tabIds })
      task.groupId = groupId
      await chrome.tabGroups.update(groupId, {
        title: "发布 " + (task.title || "").slice(0, 15),
        color: "blue",
        collapsed: false
      })
    } catch(e: any) {
      console.log("[BG] Group creation:", e.message)
    }
  }

  task.updatedAt = Date.now()
  await saveTasks(tasks)
}

// ===== Update Tab Group Title =====
async function updateGroupTitle(task: PublishTask) {
  if (!task.groupId) return
  var keys = Object.keys(task.platforms)
  var doneCount = 0
  var hasError = false
  for (var p = 0; p < keys.length; p++) {
    var st = task.platforms[keys[p]].status
    if (st === "done") doneCount++
    if (st === "error") hasError = true
  }
  var title = "发布 " + doneCount + "/" + keys.length
  if (hasError) title += " ✖"
  try {
    await chrome.tabGroups.update(task.groupId, {
      title: title,
      color: hasError ? "red" : (doneCount === keys.length ? "green" : "blue")
    })
  } catch(e) {}
}

// ===== Workspace Guardian =====
// Periodically check workspace health
var guardianInterval: any = null

function startGuardian() {
  if (guardianInterval) return
  guardianInterval = setInterval(runGuardian, 10000)
}

async function runGuardian() {
  try {
    var tasks = await getTasks()
    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t]
      if (!task.groupId) continue

      // Check if tab group still exists
      try {
        await chrome.tabGroups.get(task.groupId)
      } catch(e) {
        // Group was closed by user, update status
        for (var p in task.platforms) {
          if (task.platforms[p].status === "opened" || task.platforms[p].status === "claimed" || task.platforms[p].status === "filling") {
            task.platforms[p].status = "error"
            task.platforms[p].error = "Workspace closed"
          }
        }
        task.updatedAt = Date.now()
        continue
      }

      // Check each platform tab
      for (var p in task.platforms) {
        var ps = task.platforms[p]
        if (!ps.tabId) continue
        if (ps.status === "done" || ps.status === "error") continue

        try {
          var tab = await chrome.tabs.get(ps.tabId)
          if (tab.groupId !== task.groupId) {
            ps.status = "error"
            ps.error = "Tab left workspace"
          }
        } catch(e) {
          // Tab was closed
          ps.status = "error"
          ps.error = "Tab closed"
        }
      }
    }
    await saveTasks(tasks)

    // Update group titles
    for (var t = 0; t < tasks.length; t++) {
      if (tasks[t].groupId) {
        updateGroupTitle(tasks[t]).catch(function() {})
      }
    }
  } catch(e) {
    console.log("[Guardian]:", e.message)
  }
}

startGuardian()

// ===== Close Workspace =====
async function closeWorkspace(taskId: string) {
  var tasks = await getTasks()
  var task: PublishTask | null = null
  for (var t = 0; t < tasks.length; t++) {
    if (tasks[t].taskId === taskId) { task = tasks[t]; break }
  }
  if (!task) throw new Error("Task not found")

  var tabIds: number[] = []
  for (var p in task.platforms) {
    if (task.platforms[p].tabId) tabIds.push(task.platforms[p].tabId!)
  }

  // Remove from group (ungroup) and close
  try {
    if (task.groupId) {
      await chrome.tabs.ungroup(tabIds)
      // Remove empty group
      try {
        var groupTabs = await chrome.tabs.query({ groupId: task.groupId })
        if (groupTabs.length === 0) {
          // Can't delete group directly in MV3, but ungroup is enough
        }
      } catch(e) {}
    }
    for (var i = 0; i < tabIds.length; i++) {
      chrome.tabs.remove(tabIds[i]).catch(function() {})
    }
  } catch(e) {
    console.log("[Close]:", e.message)
  }
}

// ===== Claim Task Handler =====
async function handleClaimTask(platform: string, sender: any): Promise<any> {
  if (!platform) return { ok: false, reason: "NO_PLATFORM" }
  var tasks = await getTasks()

  var task: PublishTask | null = null
  for (var t = 0; t < tasks.length; t++) {
    var ps = tasks[t].platforms[platform]
    if (ps && (ps.status === "pending" || ps.status === "opened")) {
      task = tasks[t]
      break
    }
  }

  if (!task) return { ok: false, reason: "NO_TASK" }

  // Verify tab is in the right workspace group
  if (task.groupId && sender.tab?.id) {
    try {
      var tab = await chrome.tabs.get(sender.tab.id)
      if (tab.groupId !== task.groupId) {
        return { ok: false, reason: "WRONG_WORKSPACE" }
      }
    } catch(e) {
      return { ok: false, reason: "TAB_ERROR" }
    }
  }

  task.platforms[platform].status = "claimed"
  task.platforms[platform].tabId = sender.tab?.id
  task.platforms[platform].claimedAt = Date.now()
  task.platforms[platform].url = sender.tab?.url || ""
  task.updatedAt = Date.now()

  await saveTasks(tasks)
  updateGroupTitle(task).catch(function() {})

  return {
    ok: true,
    taskId: task.taskId,
    platformData: {
      taskId: task.taskId,
      platform: platform,
      title: task.title,
      content: task.content,
      tags: task.tags,
      videoStorageKey: task.videoStorageKey,
      videoFileName: task.videoFileName,
      videoFileType: task.videoFileType
    }
  }
}

// ===== Heartbeat =====
async function handleHeartbeat(platform: string, tabId: number | undefined, url: string | undefined) {
  if (!platform) return
  await chrome.storage.local.set({
    ["hb_" + platform]: { tabId: tabId, url: url, lastSeenAt: Date.now() }
  })
}

// ===== MAIN Script Injection =====
async function injectMainScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: setupMainWorld
    })
  } catch(e: any) {
    console.log("[BG] Inject:", e.message)
  }
}

function setupMainWorld() {
  try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined } }) } catch(e) {}
  try { Object.defineProperty(navigator, "plugins", { get: function() { return [1, 2, 3, 4, 5] } }) } catch(e) {}
  try { Object.defineProperty(navigator, "languages", { get: function() { return ["zh-CN", "zh", "en"] } }) } catch(e) {}

  window.addEventListener("message", function(ev) {
    if (ev.data && ev.data.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data.action === "INJECT_VIDEO") {
      var d = ev.data.data
      if (!d || !d.dataUrl) return
      fetch(d.dataUrl).then(function(r) { return r.blob() }).then(function(blob) {
        var f = new File([blob], d.fileName || "video.mp4", { type: d.fileType || blob.type || "video/mp4" })
        var dt = new DataTransfer(); dt.items.add(f)
        var ins = document.querySelectorAll("input[type=file]")
        for (var i = 0; i < ins.length; i++) {
          try {
            Object.defineProperty(ins[i], "files", { get: function() { return dt.files }, configurable: true })
            ins[i].dispatchEvent(new Event("change", { bubbles: true }))
            ins[i].dispatchEvent(new Event("input", { bubbles: true }))
          } catch(e) {}
        }
        window.postMessage({ source: "VIDEO_PUBLISHER_EXTENSION", action: "INJECT_VIDEO_RESULT", success: true }, window.location.origin)
      }).catch(function(e) {
        window.postMessage({ source: "VIDEO_PUBLISHER_EXTENSION", action: "INJECT_VIDEO_RESULT", success: false, error: e.message }, window.location.origin)
      })
    }
  })
}
