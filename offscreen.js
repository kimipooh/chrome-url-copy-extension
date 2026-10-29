// 確認応答の遅延で書き込み順が逆転しないよう、要求を直列処理する。
let copyQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.target !== "offscreen" || request.type !== "copy-data") return;

  // 配送待ちの間に新しい操作が始まっていないか、書き込み直前にSWへ確認する。
  const copy = copyQueue.then(async () => {
    let ta;
    let response;
    try {
      if (typeof request.text !== "string") throw new Error("コピー文字列が不正です");
      const status = await chrome.runtime.sendMessage({
        target: "background", type: "is-current-copy", requestId: request.requestId
      });
      if (!status || typeof status.current !== "boolean") throw new Error("コピー要求を確認できませんでした");
      if (!status.current) {
        response = { discarded: true };
      } else {
        ta = document.createElement("textarea");
        ta.value = request.text;
        document.body.appendChild(ta);
        ta.select();
        if (!document.execCommand("copy")) throw new Error("クリップボードへの書き込みが拒否されました");
        response = { success: true };
      }
    } catch (error) {
      response = { success: false, error: error.message || String(error) };
    } finally {
      if (ta) ta.remove();
    }
    sendResponse(response);
  });
  copyQueue = copy.catch(error => sendResponse({ success: false, error: error.message || String(error) }));
  return true;
});
