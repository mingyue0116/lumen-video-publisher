import React, { useState, useRef, useEffect } from "react"

const DRAFT_KEY = "publish_draft_v2"
const VIDEO_STORAGE_KEY = "publish_video_data"
const VERSION = "1.3.0"

const Icons = {
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
};

interface PlatformOption {
  id: string;
  label: string;
  icon: React.ReactElement;
}

const PLATFORMS: PlatformOption[] = [
  { id: "douyin", label: "抖音", icon: Icons.douyin },
  { id: "xiaohongshu", label: "小红书", icon: Icons.xiaohongshu },
  { id: "bilibili", label: "B站", icon: Icons.bilibili },
  { id: "shipinhao", label: "视频号", icon: Icons.shipinhao },
  { id: "twitter", label: "Twitter", icon: Icons.twitter }
];

function SidePanel() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(["douyin"]));
  const videoRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft on mount
  useEffect(() => {
    chrome.storage.local.get(DRAFT_KEY, (result) => {
      if (result && result[DRAFT_KEY]) {
        const draft = result[DRAFT_KEY];
        setTitle(draft.title || "");
        setContent(draft.content || "");
        setTags(draft.tags || "");
        if (draft.videoName) setVideoName(draft.videoName);
        if (draft.videoBlobUrl) setVideoBlobUrl(draft.videoBlobUrl);
        if (draft.videoDataUrl) setVideoDataUrl(draft.videoDataUrl);
        if (draft.videoFile) setVideoFile(draft.videoFile as unknown as File);
        if (draft.platform) setSelectedPlatforms(new Set(draft.platform));
      }
    });
  }, []);

  function addStatus(msg: string) {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setStatus(prev => [...prev, `[${time}] ${msg}`]);
  }

  function saveDraft(completed: boolean) {
    const draft: any = {
      title,
      content,
      tags,
      videoName,
      videoBlobUrl,
      videoDataUrl,
      videoFile,
      platform: Array.from(selectedPlatforms)
    };
    if (completed) {
      chrome.storage.local.remove(DRAFT_KEY, () => {});
    } else {
      chrome.storage.local.set({ [DRAFT_KEY]: draft }, () => {});
    }
  }

  // Auto-save draft on field change
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(false), 2000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [title, content, tags, videoFile, selectedPlatforms]);

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoName(file.name);
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
      const url = URL.createObjectURL(file);
      setVideoBlobUrl(url);
      // Also read as data URL for cross-context transfer
      const reader = new FileReader();
      reader.onload = () => {
        setVideoDataUrl(reader.result as string);
        addStatus("视频已加载: " + file.name + " (" + (file.size / 1024 / 1024).toFixed(1) + "MB)");
      };
      reader.onerror = () => {
        addStatus("视频读取失败: " + reader.error);
      };
      reader.readAsDataURL(file);
    }
  }

  function togglePlatform(id: string) {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function publishToPlatform(platform: string): Promise<number | null> {
    if (!videoFile || !videoDataUrl) {
      addStatus("请先选择视频文件");
      return null;
    }

    addStatus("打开 " + PLATFORMS.find(p => p.id === platform)?.label + " 页面...");

    // Step 1: Open platform tab via background
    const tabResult = await chrome.runtime.sendMessage({ action: "OPEN_PLATFORM", platform });
    if (!tabResult?.success) {
      addStatus("打开页面失败: " + tabResult?.error);
      return null;
    }

    const tabId = tabResult.tabId;

    // Step 2: Wait and inject MAIN world script
    addStatus("注入发布脚本...");
    await chrome.runtime.sendMessage({ action: "INJECT_MAIN", tabId, platform });
    await chrome.runtime.sendMessage({ action: "INJECT_MAIN", tabId, platform: "bilibili" });
    await delay(2000);

    // Step 3: Store video data in chrome.storage.local (bypasses 64MB message limit)
    addStatus("存储视频数据到缓存...");
    const storageKey = VIDEO_STORAGE_KEY + "_" + platform + "_" + Date.now();
    const tagList = tags.split(/[\uFF0C,，\s]+/).filter(Boolean);
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({
        [storageKey]: {
          videoDataUrl: videoDataUrl,
          videoName: videoFile.name,
          videoType: videoFile.type,
          title: title,
          content: content,
          tags: tagList
        }
      }, () => {
        if (chrome.runtime.lastError) {
          addStatus("存储视频数据失败: " + chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve()
        }
      });
    });
    addStatus("视频数据已缓存(" + (videoDataUrl.length / 1024 / 1024).toFixed(1) + "MB)");

    // Step 4: Send lightweight message with just the storage key and blobUrl
    addStatus("发送数据到 " + PLATFORMS.find(p => p.id === platform)?.label + "...");
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "FILL_FORM",
        platform,
        data: {
          videoStorageKey: storageKey,
          videoBlobUrl: videoBlobUrl,
          videoName: videoFile.name,
          videoType: videoFile.type,
          title,
          content,
          tags: tagList
        }
      });
      addStatus(PLATFORMS.find(p => p.id === platform)?.label + " 数据已发送");
    } catch (e: any) {
      addStatus(PLATFORMS.find(p => p.id === platform)?.label + " 发送失败: " + e.message);
    }

    addStatus("发布已完成");
    return tabId
  }

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

  async function publishAll() {
    if (selectedPlatforms.size === 0) {
      addStatus("请至少选择一个平台");
      return;
    }
    if (!videoFile || !videoDataUrl) {
      addStatus("请先选择视频文件");
      return;
    }

    setPublishing(true);
    addStatus("开始发布...");

    var firstTabId: number | null = null
    var platformIndex = 0
    var total = selectedPlatforms.size
    for (const pid of selectedPlatforms) {
      platformIndex++
      addStatus("[" + platformIndex + "/" + total + "] 开始发布到 " + PLATFORMS.find(p => p.id === pid)?.label)
      const tabId = await publishToPlatform(pid)
      if (tabId && !firstTabId) firstTabId = tabId
      if (platformIndex < total) {
        addStatus("等待3秒后发布下一个平台...")
        await delay(3000)
      }
    }

    addStatus("全部发布完成! 请检查各平台页面确认发布结果。")
    saveDraft(true)
    setPublishing(false)

    if (firstTabId) {
      addStatus("正在打开第一个平台页面...")
      await chrome.tabs.update(firstTabId, { active: true })
    }
  }

  function clearDraft() {
    chrome.storage.local.remove(DRAFT_KEY, () => {});
    setTitle("");
    setContent("");
    setTags("");
    setVideoFile(null);
    setVideoName("");
    if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    setVideoBlobUrl(null);
    setVideoDataUrl(null);
    if (videoRef.current) videoRef.current.value = "";
    addStatus("草稿已清除");
  }

  return React.createElement("div", { style: { padding: "16px 12px", fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif" } },
    React.createElement("h1", { style: { fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" } }, "视频多平台发布器"),
    React.createElement("p", { style: { fontSize: 11, color: "#aaa", marginBottom: 16 } }, "v" + VERSION),

    // Video selection
    React.createElement("div", { style: { marginBottom: 16 } },
      React.createElement("label", { style: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13, color: "#555" } }, "视频文件"),
      React.createElement("input", {
        ref: videoRef,
        type: "file",
        accept: "video/*",
        onChange: handleVideoSelect,
        style: { display: "block", width: "100%", padding: "6px 0", fontSize: 13 }
      }),
      videoName && React.createElement("div", { style: { fontSize: 12, color: "#1677ff", marginTop: 4 } }, videoName)
    ),

    // Platform selection
    React.createElement("div", { style: { marginBottom: 16 } },
      React.createElement("label", { style: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13, color: "#555" } }, "发布到"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } },
        PLATFORMS.map(p =>
          React.createElement("button", {
            key: p.id,
            onClick: () => togglePlatform(p.id),
            style: {
              display: "inline-flex", alignItems: "center", padding: "6px 12px",
              border: "1px solid " + (selectedPlatforms.has(p.id) ? "#1677ff" : "#d9d9d9"),
              borderRadius: 6, background: selectedPlatforms.has(p.id) ? "#e6f4ff" : "#fff",
              color: selectedPlatforms.has(p.id) ? "#1677ff" : "#666",
              cursor: "pointer", fontSize: 13, fontWeight: selectedPlatforms.has(p.id) ? 500 : 400,
              outline: "none"
            }
          }, p.icon, p.label)
        )
      )
    ),

    // Title
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("label", { style: { display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13, color: "#555" } }, "标题"),
      React.createElement("input", {
        value: title,
        onChange: e => setTitle(e.target.value),
        placeholder: "输入视频标题",
        style: { width: "100%", padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }
      })
    ),

    // Description
    React.createElement("div", { style: { marginBottom: 12 } },
      React.createElement("label", { style: { display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13, color: "#555" } }, "作品简介"),
      React.createElement("textarea", {
        value: content,
        onChange: e => setContent(e.target.value),
        placeholder: "输入作品简介",
        rows: 4,
        style: { width: "100%", padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }
      })
    ),

    // Tags
    React.createElement("div", { style: { marginBottom: 16 } },
      React.createElement("label", { style: { display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13, color: "#555" } }, "话题标签 (用空格或逗号分隔)"),
      React.createElement("input", {
        value: tags,
        onChange: e => setTags(e.target.value),
        placeholder: "例如: 搞笑 美食 教程",
        style: { width: "100%", padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }
      }),
      React.createElement("div", { style: { fontSize: 11, color: "#999", marginTop: 4 } },
        tags.split(/[\s,\u3001]+/).filter(Boolean).map((t, i) =>
          React.createElement("span", {
            key: i,
            style: { display: "inline-block", padding: "2px 6px", margin: "2px 4px 2px 0", background: "#f0f0f0", borderRadius: 4, fontSize: 12, color: "#1677ff" }
          }, "#" + t)
        )
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
      }, publishing ? "发布中..." : "发布到所选平台"),
      React.createElement("button", {
        onClick: clearDraft,
        style: {
          padding: "10px 16px",
          background: "#fff", color: "#ff4d4f", border: "1px solid #ff4d4f", borderRadius: 6,
          fontSize: 13, cursor: "pointer"
        }
      }, Icons.delete, "清除草稿")
    ),

    // Status log
    React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 500, color: "#888", marginBottom: 4 } }, "运行日志"),
      React.createElement("div", {
        style: {
          background: "#f6f8fa", border: "1px solid #e8e8e8", borderRadius: 6,
          padding: 8, height: 200, overflowY: "auto", fontSize: 11,
          fontFamily: "\"'Courier New'\", monospace", color: "#333", lineHeight: 1.6
        }
      },
        status.length === 0
          ? React.createElement("div", { style: { color: "#bbb" } }, "暂无日志")
          : status.map((s, i) => React.createElement("div", { key: i }, s))
      )
    ),

    React.createElement("div", { style: { fontSize: 11, color: "#bbb", textAlign: "center", borderTop: "1px solid #eee", paddingTop: 8 } },
      "v" + VERSION
    )
  );
}

export default SidePanel;
