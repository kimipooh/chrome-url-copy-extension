const MENU_ID_EN = "copy-google-en";
const MENU_ID_JA = "copy-google-ja";
const MENU_ID_STD = "copy-standard";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID_EN,
      title: "タイトル(英)とURLをコピー",
      contexts: ["all"]
    });

    chrome.contextMenus.create({
      id: MENU_ID_JA,
      title: "タイトル(日)とURLをコピー",
      contexts: ["all"]
    });

    chrome.contextMenus.create({
      id: MENU_ID_STD,
      title: "タイトルとURLをコピー (通常)",
      contexts: ["all"]
    });

    chrome.action.setBadgeText({ text: "C" });
    chrome.action.setBadgeBackgroundColor({ color: "#111111" });
  });
});

chrome.action.onClicked.addListener((tab) => {
  executeCopy(tab, null);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID_EN) {
    executeCopy(tab, "en");
  } else if (info.menuItemId === MENU_ID_JA) {
    executeCopy(tab, "ja");
  } else if (info.menuItemId === MENU_ID_STD) {
    executeCopy(tab, null);
  }
});

// クリップボードと表示は拡張全体で共有し、最後に開始した要求だけを採用する。
let latestRequestId;
let creatingOffscreen;
let feedbackTimer;
let feedbackQueue = Promise.resolve();
const DEFAULT_TITLE = chrome.runtime.getManifest().action.default_title;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.target === "background" && request.type === "is-current-copy") {
    sendResponse({ current: request.requestId === latestRequestId });
  }
});

function updateFeedback(requestId, text = "C", color = "#111111", title = DEFAULT_TITLE) {
  // 非同期APIの完了順も直列化し、古い表示が新しい表示を上書きしないようにする。
  const update = feedbackQueue.then(async () => {
    if (requestId !== latestRequestId) return;
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setTitle({ title });
  });
  feedbackQueue = update.catch(() => {});
  return update;
}

async function ensureOffscreenDocument() {
  if (!creatingOffscreen) {
    creatingOffscreen = (async () => {
      const filter = {
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL("offscreen.html")]
      };
      if ((await chrome.runtime.getContexts(filter)).length) return;
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: [chrome.offscreen.Reason.CLIPBOARD],
          justification: "タイトルとURLをクリップボードにコピーするため"
        });
      } catch (error) {
        // 他の作成処理と競合した場合も、実際の存在を再確認する。
        if (!(await chrome.runtime.getContexts(filter)).length) throw error;
      }
    })();
  }
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = undefined;
  }
}

function restrictedReason(tab) {
  if (!tab || !Number.isInteger(tab.id) || !tab.url) return "タブのURLが不明です";
  try {
    const url = new URL(tab.url);
    if (!["https:", "http:", "file:"].includes(url.protocol) ||
        url.hostname === "chromewebstore.google.com" ||
        (url.hostname === "chrome.google.com" && /^\/webstore(?:\/|$)/.test(url.pathname))) {
      return "このページでは拡張機能によるコピーを実行できません";
    }
  } catch {
    return "タブのURLが不正です";
  }
}

async function executeCopy(tab, targetLang) {
  const requestId = crypto.randomUUID();
  latestRequestId = requestId;
  clearTimeout(feedbackTimer);
  try {
    // SW停止で復元タイマーが失われた場合も、次回開始時には既定表示に戻す。
    await updateFeedback(requestId);
    const reason = restrictedReason(tab);
    if (reason) throw new Error(reason);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: mainProcessInPage,
      args: [targetLang]
    });
    if (requestId !== latestRequestId) return;
    const text = results?.[0]?.result?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("ページからコピー文字列を取得できませんでした");
    await ensureOffscreenDocument();
    if (requestId !== latestRequestId) return;
    const response = await chrome.runtime.sendMessage({
      target: "offscreen", type: "copy-data", text, requestId
    });
    if (requestId !== latestRequestId) return;
    if (response?.discarded) return;
    if (response?.success !== true) throw new Error(response?.error || "コピーの成功応答がありません");
    await updateFeedback(requestId, "OK", "#137333", "コピーしました");
  } catch (error) {
    if (requestId !== latestRequestId) return;
    const detail = error instanceof Error ? error.message : String(error);
    console.error("コピーに失敗しました:", detail);
    try {
      await updateFeedback(requestId, "!", "#B3261E", `コピー失敗: ${detail}`);
    } catch (displayError) {
      console.error("コピー結果の表示に失敗しました:", displayError);
    }
  } finally {
    if (requestId === latestRequestId) {
      feedbackTimer = setTimeout(() => {
        updateFeedback(requestId).catch(error => console.error("表示の復元に失敗しました:", error));
      }, 4000);
    }
  }
}

/**
 * ページ内で実行される関数。URL取得・タイトル取得と文字列生成をページコンテキストで行う。
 * chrome.* APIは使用不可。
 * @param {string|null} targetLang
 */
async function mainProcessInPage(targetLang) {
  // --- 1. URLの取得とクリーンアップ ---
  const rawUrl = window.location.href;
  let cleanUrl = rawUrl;

  try {
    const urlObj = new URL(rawUrl);
    if (urlObj.hostname === "support.google.com" && !urlObj.pathname.startsWith("/s/community/")) {
      // support.google.com（コミュニティ以外）: ? 以降を全削除
      cleanUrl = urlObj.origin + urlObj.pathname;
    } else {
      // その他: uule と hl のみ削除
      urlObj.searchParams.delete("uule");
      urlObj.searchParams.delete("hl");
      cleanUrl = urlObj.toString().replace(/\?$/, "");
    }
  } catch (e) {
    cleanUrl = rawUrl;
  }

  let decodeURL = "";
  try {
    decodeURL = decodeURIComponent(cleanUrl);
  } catch (e) {
    decodeURL = cleanUrl;
  }

  // --- 2. タイトルの取得 ---
  let title = "";
  const currentUrl = window.location.href;

  if (targetLang && new URL(currentUrl).hostname === "support.google.com") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const fetchUrl = new URL(currentUrl);
      fetchUrl.searchParams.set("hl", targetLang);
      const response = await fetch(fetchUrl.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const remoteTitle = doc.querySelector("h1")?.textContent || doc.title;
      if (remoteTitle) title = remoteTitle;
    } catch (e) {
      console.warn(`${targetLang} 版タイトルの取得に失敗しました。`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!title) {
    if (currentUrl.includes("faq2.epson.jp")) {
      const epsonTitle = document.querySelector(".faq_qstCont_ttl, #QuestionDescription, dt.question");
      if (epsonTitle) title = epsonTitle.innerText;
    } else if (/https:\/\/news\.yahoo\.co\.jp\//.test(currentUrl)) {
      title = document.querySelector("article > header > h1")?.innerText;
    } else if (/https:\/\/eset-support\.canon-its\.jp\//.test(currentUrl)) {
      title = document.querySelector("h2.faq_qstCont_ttl > span.icoQ")?.innerText;
    } else if (/(https:\/\/kitaney-google\.blogspot\.com\/|https:\/\/kitaney-wordpress\.blogspot\.com\/)/.test(currentUrl)) {
      title = document.querySelector("h3")?.innerText;
    }
  }

  if (!title || title.trim() === "よくある質問(FAQ)｜エプソン") {
    title = document.title;
  }

  title = title.replace(/\r?\n/g, "").replace(/\s+/g, " ").trim();
  const text = `${title}\n${decodeURL}`;

  return { text };
}
