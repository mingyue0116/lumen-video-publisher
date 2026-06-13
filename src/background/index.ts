// ===== Video Publisher v2.1.0 - Background Task Queue =====

const VERSION = "2.1.0"
const TASKS_KEY = "publishTasks"
const RUNTIME_KEY = "platformRuntime"

interface PlatformState {
  status: string  // pending | opened | claimed | filling | done | error
  tabId?: number
  url?: string
  error?: string
  claimedAt?: number
}

interface PublishTask {
  taskId: string
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

// ===== Side Panel =====
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id })
})

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// ===== Message Router =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Side panel: create a new task
  if (msg.action === "CREATE_TASK") {
    handleCreateTask(msg.payload)
      .then((task) => sendResponse({ success: true, task: task }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  // Side panel: get all tasks
  if (msg.action === "GET_TASKS") {
    getTasks()
      .then((tasks) => sendResponse({ success: true, tasks: tasks }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  // Side panel: start publishing (open platform pages)
  if (msg.action === "START_PUBLISH") {
    startPublishTask(msg.taskId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  // Content script: claim a task for their platform
  if (msg.action === "CLAIM_TASK") {
    handleClaimTask(msg.platform, sender)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, reason: err.message }))
    return true
  }

  // Content script: heartbeat
  if (msg.action === "HEARTBEAT") {
    handleHeartbeat(msg.platform, sender.tab?.id, msg.url)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  // Content script: update task status
  if (msg.action === "UPDATE_TASK_STATUS") {
    updateTaskStatus(msg.taskId, msg.platform, msg.status, msg.error)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  // Side panel: remove completed tasks
  if (msg.action === "CLEAR_TASKS") {
    clearCompletedTasks()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }))
    return true
  }
})

// ===== Task Management =====
async function getTasks(): Promise<PublishTask[]> {
  var result = await chrome.storage.local.get([TASKS_KEY])
  return result[TASKS_KEY] || []
}

async function saveTasks(tasks: PublishTask[]): Promise<void> {
  await chrome.storage.local.set({ [TASKS_KEY]: tasks })
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

  var platforms = payload.platforms || ["douyin"]
  for (var p = 0; p < platforms.length; p++) {
    task.platforms[platforms[p]] = { status: "pending" }
  }

  var tasks = await getTasks()
  tasks.push(task)
  await saveTasks(tasks)

  return task
}

async function updateTaskStatus(taskId: string, platform: string, status: string, error?: string): Promise<void> {
  var tasks = await getTasks()
  for (var t = 0; t < tasks.length; t++) {
    if (tasks[t].taskId === taskId && tasks[t].platforms[platform]) {
      tasks[t].platforms[platform].status = status
      if (error) tasks[t].platforms[platform].error = error
      tasks[t].updatedAt = Date.now()
      break
    }
  }
  await saveTasks(tasks)
}

async function clearCompletedTasks(): Promise<void> {
  var tasks = await getTasks()
  var remaining: PublishTask[] = []
  for (var t = 0; t < tasks.length; t++) {
    var allDone = true
    var platformKeys = Object.keys(tasks[t].platforms)
    for (var p = 0; p < platformKeys.length; p++) {
      var st = tasks[t].platforms[platformKeys[p]].status
      if (st !== "done" && st !== "error") {
        allDone = false
        break
      }
    }
    if (!allDone) {
      remaining.push(tasks[t])
    }
  }
  await saveTasks(remaining)
}

// ===== Claim Task Handler =====
async function handleClaimTask(platform: string, sender: any): Promise<any> {
  if (!platform) return { ok: false, reason: "NO_PLATFORM" }

  var tasks = await getTasks()

  // Find a task that has this platform pending/opened
  var task: PublishTask | null = null
  for (var t = 0; t < tasks.length; t++) {
    var ps = tasks[t].platforms[platform]
    if (ps && (ps.status === "pending" || ps.status === "opened")) {
      task = tasks[t]
      break
    }
  }

  if (!task) {
    return { ok: false, reason: "NO_TASK" }
  }

  // Assign task to this content script
  task.platforms[platform].status = "claimed"
  task.platforms[platform].tabId = sender.tab?.id
  task.platforms[platform].claimedAt = Date.now()
  task.platforms[platform].url = sender.tab?.url || ""
  task.updatedAt = Date.now()

  await saveTasks(tasks)

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
async function handleHeartbeat(platform: string, tabId: number | undefined, url: string | undefined): Promise<void> {
  if (!platform) return
  var data: any = {}
  data[RUNTIME_KEY + "_" + platform] = {
    tabId: tabId,
    url: url,
    lastSeenAt: Date.now()
  }
  await chrome.storage.local.set(data)
}

async function getHeartbeat(platform: string): Promise<any | null> {
  var result = await chrome.storage.local.get([RUNTIME_KEY + "_" + platform])
  return result[RUNTIME_KEY + "_" + platform] || null
}

// ===== Start Publishing =====
async function startPublishTask(taskId: string): Promise<void> {
  var tasks = await getTasks()
  var task: PublishTask | null = null
  for (var t = 0; t < tasks.length; t++) {
    if (tasks[t].taskId === taskId) {
      task = tasks[t]
      break
    }
  }

  if (!task) throw new Error("Task not found: " + taskId)

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

      // Inject MAIN world script
      injectMainScript(tab.id).catch(function(e) {
        console.log("[BG] Inject MAIN:", e.message)
      })
    } catch(e: any) {
      task.platforms[plat].status = "error"
      task.platforms[plat].error = e.message
    }
  }

  task.updatedAt = Date.now()
  await saveTasks(tasks)
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
    console.log("[BG] Inject MAIN:", e.message)
  }
}

function setupMainWorld() {
  // Anti-detection
  try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined } }) } catch(e) {}
  try { Object.defineProperty(navigator, "plugins", { get: function() { return [1, 2, 3, 4, 5] } }) } catch(e) {}
  try { Object.defineProperty(navigator, "languages", { get: function() { return ["zh-CN", "zh", "en"] } }) } catch(e) {}

  // Listen for INJECT_VIDEO from content script
  window.addEventListener("message", function(ev) {
    if (ev.data && ev.data.source === "VIDEO_PUBLISHER_EXTENSION" && ev.data.action === "INJECT_VIDEO") {
      var data = ev.data.data
      if (!data || !data.dataUrl) return

      fetch(data.dataUrl)
        .then(function(r) { return r.blob() })
        .then(function(blob) {
          var file = new File([blob], data.fileName || "video.mp4", { type: data.fileType || blob.type || "video/mp4" })
          var dt = new DataTransfer()
          dt.items.add(file)
          var inputs = document.querySelectorAll("input[type=file]")
          for (var i = 0; i < inputs.length; i++) {
            try {
              Object.defineProperty(inputs[i], "files", {
                get: function() { return dt.files },
                configurable: true
              })
              inputs[i].dispatchEvent(new Event("change", { bubbles: true }))
              inputs[i].dispatchEvent(new Event("input", { bubbles: true }))
            } catch(e) {}
          }
          window.postMessage({
            source: "VIDEO_PUBLISHER_EXTENSION",
            action: "INJECT_VIDEO_RESULT",
            success: true
          }, window.location.origin)
        })
        .catch(function(e) {
          window.postMessage({
            source: "VIDEO_PUBLISHER_EXTENSION",
            action: "INJECT_VIDEO_RESULT",
            success: false,
            error: e.message
          }, window.location.origin)
        })
    }
  })
}
