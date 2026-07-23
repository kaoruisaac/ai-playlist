# 選曲室

一個以 Pedelec 為核心的 Vite React 純前端單頁音樂陪伴網站。使用者說出此刻的心情或場景後，Agent 會透過結構化工具建立及調整 YouTube 歌單；播放時，網站會逐首送上準備好的介紹。

## 本機開發

```bash
npm run dev
```

需在 Chrome 中安裝並啟動 Pedelec；網站會先檢查 Extension、可用 Provider 與設定。未連線時，聊天與 AI 選曲會停用，但已儲存在本機的歌單仍能播放及手動調整。Provider 預設沿用 Pedelec Desktop 設定，也可從網站設定面板覆寫 Provider / Model。

## 建置與部署

```bash
npm run build
npm run preview
```

`dist/` 是可直接由 Cloudflare Pages 靜態託管的網站根目錄。直接上傳方式：

```bash
npm run build
wrangler pages deploy dist
```

本網站不包含 API key、後端服務或資料庫；Agent 能力完全來自使用者本機可用的 Pedelec。

## 驗證

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 已知限制

- YouTube IFrame API 只會在使用者開始播放時載入；首次有聲播放需要點擊。
- 真正的歌曲研究與歌單生成依賴已在本機可用的 Pedelec Provider，沒有將搜尋金鑰或秘密資訊打包到前端。
- Pedelec Extension 與 YouTube iframe 的實際跨環境連線，需在具備 Pedelec 的 Chrome 環境再確認。
