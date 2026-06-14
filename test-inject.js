// 在抖音页面控制台运行这个脚本测试视频注入
// 步骤：
// 1. 打开抖音创作者平台 https://creator.douyin.com/creator-micro/content/upload
// 2. 按 F12 打开 DevTools
// 3. 切换到 Console 面板
// 4. 把这段代码粘贴进去运行
// 5. 观察输出结果

(async function testVideoInjection() {
  console.log("=== 视频注入测试开始 ===");
  
  // 测试1：检查是否有 file input
  var inputs = document.querySelectorAll('input[type="file"]');
  console.log("找到 file input 数量:", inputs.length);
  if (inputs.length > 0) {
    for (var i = 0; i < inputs.length; i++) {
      console.log("Input", i, ":", {
        accept: inputs[i].accept,
        style: window.getComputedStyle(inputs[i]).display,
        visible: inputs[i].getBoundingClientRect().width > 0
      });
    }
  }
  
  // 测试2：检查是否有上传区域
  var uploadAreas = document.querySelectorAll('[class*="upload"], [class*="Upload"], [class*="file"], [class*="File"]');
  console.log("找到上传区域数量:", uploadAreas.length);
  
  // 测试3：尝试创建 File 和 DataTransfer
  try {
    var blob = new Blob(["test"], { type: "video/mp4" });
    var file = new File([blob], "test.mp4", { type: "video/mp4" });
    var dt = new DataTransfer();
    dt.items.add(file);
    console.log("DataTransfer 创建成功, files:", dt.files.length);
    
    // 测试4：尝试设置 input.files
    if (inputs.length > 0) {
      var input = inputs[0];
      var originalFiles = input.files;
      console.log("原始 files:", originalFiles);
      
      try {
        input.files = dt.files;
        console.log("直接赋值结果:", input.files === dt.files ? "成功" : "失败");
      } catch(e) {
        console.log("直接赋值报错:", e.message);
      }
      
      try {
        Object.defineProperty(input, "files", {
          value: dt.files,
          configurable: true
        });
        console.log("defineProperty 结果:", input.files.length);
      } catch(e) {
        console.log("defineProperty 报错:", e.message);
      }
    }
  } catch(e) {
    console.log("创建 File 失败:", e.message);
  }
  
  // 测试5：尝试 drag-drop
  try {
    var dropTarget = document.querySelector('[class*="upload"]') || document.body;
    var dragDt = new DataTransfer();
    dragDt.items.add(new File([new Blob(["test"])], "test.mp4", { type: "video/mp4" }));
    
    dropTarget.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dragDt }));
    dropTarget.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dragDt }));
    dropTarget.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dragDt }));
    console.log("Drag-drop 事件已派发");
  } catch(e) {
    console.log("Drag-drop 失败:", e.message);
  }
  
  console.log("=== 测试结束 ===");
})();
