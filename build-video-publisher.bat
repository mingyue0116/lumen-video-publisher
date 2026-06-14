@echo off
chcp 65001 >nul
echo ========================================
echo  视频多平台发布器 - v3.1.4 构建脚本
echo ========================================
cd /d "E:\脚本工具\video-publisher"
if %errorlevel% neq 0 (
  echo [错误] 无法进入项目目录
  pause
  exit /b 1
)
echo [OK] 已进入: %cd%
echo.

echo 正在清理所有缓存...
if exist ".plasmo" (
  rmdir /s /q ".plasmo"
  echo [OK] .plasmo 已删除
)
if exist "build" (
  rmdir /s /q "build"
  echo [OK] build 已删除
)
if exist ".parcel-cache" (
  rmdir /s /q ".parcel-cache"
  echo [OK] .parcel-cache 已删除
)
if exist "node_modules\.cache" (
  rmdir /s /q "node_modules\.cache"
  echo [OK] node_modules\.cache 已删除
)
echo [OK] 所有缓存已清理
echo.

echo 正在执行 npm run build ...
npm run build
if %errorlevel% neq 0 (
  echo.
  echo [错误] 构建失败！
  pause
  exit /b 1
)
echo.
echo [OK] 构建成功！

echo 正在修正 manifest 版本号...
powershell -Command "$mf = 'E:\脚本工具\video-publisher\build\chrome-mv3-prod\manifest.json'; $c = Get-Content $mf -Raw; $c = $c -replace '\""version\"":\""[0-9]+\.[0-9]+\.[0-9]+\""', '\""version\"":\""3.1.4\""'; Set-Content $mf -Value $c -NoNewline"
echo [OK] manifest 版本号 -> 3.1.4
echo.

echo ========================================
echo  构建完成! v3.1.4
echo  输出: build\chrome-mv3-prod
echo ========================================
echo.
echo  下一步: chrome://extensions -> 重新加载扩展
echo.
pause
