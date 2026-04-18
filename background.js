const MENU_ID_EN = "copy-google-en";
const MENU_ID_JA = "copy-google-ja";
const MENU_ID_STD = "copy-standard";

chrome.runtime.onInstalled.addListener(() => {
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

async function executeCopy(tab, targetLang) {
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("https://chrome.google.com/webstore")) {
    console.warn("Cannot access restricted URL:", tab.url);
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: mainProcessInPage,
    args: [targetLang]
  });
}

/**
 * ページ内で実行される関数。URL取得・タイトル取得・クリップボードコピーをすべてページコンテキストで行う。
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

  if (targetLang && currentUrl.includes("support.google.com")) {
    try {
      const fetchUrl = new URL(currentUrl);
      fetchUrl.searchParams.set("hl", targetLang);
      const response = await fetch(fetchUrl.toString());
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const remoteTitle = doc.querySelector("h1")?.innerText || doc.title;
      if (remoteTitle) title = remoteTitle;
    } catch (e) {
      console.warn(`${targetLang} 版タイトルの取得に失敗しました。`);
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

  // --- 3. クリップボードへコピー ---
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
