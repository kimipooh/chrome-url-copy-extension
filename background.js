/**
 * グローバル変数・定数
 */
// Googleサポート用：英語版タイトル取得メニューID
const MENU_ID_EN = "copy-google-en";
// Googleサポート用：日本語版タイトル取得メニューID
const MENU_ID_JA = "copy-google-ja";
// 通常コピー（現在の表示内容を優先）メニューID
const MENU_ID_STD = "copy-standard";

// インストール時にコンテキストメニューを作成
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

// アイコンクリック時は「通常コピー」を実行
chrome.action.onClicked.addListener((tab) => {
  executeCopy(tab, null);
});

// メニュークリック時の処理分岐
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID_EN) {
    executeCopy(tab, "en");
  } else if (info.menuItemId === MENU_ID_JA) {
    executeCopy(tab, "ja");
  } else if (info.menuItemId === MENU_ID_STD) {
    executeCopy(tab, null);
  }
});

/**
 * ページ内スクリプトの実行
 * @param {chrome.tabs.Tab} tab - 対象のタブ
 * @param {string|null} targetLang - 強制取得する言語コード ('en', 'ja', または null)
 */
function executeCopy(tab, targetLang) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: mainProcessInPage,
    args: [targetLang]
  });
}

/**
 * ページ内で実行されるメイン処理
 * @param {string|null} targetLang - ターゲット言語
 */
async function mainProcessInPage(targetLang) {
  // --- 1. URLの取得とクリーンアップ ---
  const rawUrl = window.location.href;
  let cleanUrl = rawUrl;

  try {
    const urlObj = new URL(rawUrl);
    // 不要なパラメーターを削除
    urlObj.searchParams.delete("uule");
    // URL出力時は言語パラメーター(hl)も削除
    urlObj.searchParams.delete("hl");
    
    cleanUrl = urlObj.toString().replace(/\?$/, "");
  } catch (e) {
    cleanUrl = rawUrl;
  }

  // URLのデコード
  let decodeURL = "";
  try {
    decodeURL = decodeURIComponent(cleanUrl);
  } catch (e) {
    decodeURL = cleanUrl;
  }

  // --- 2. タイトルの取得 ---
  let title = "";
  const currentUrl = window.location.href;
  
  // Googleサポートページで言語が指定されている場合（英/日）
  if (targetLang && currentUrl.includes("support.google.com")) {
    try {
      const fetchUrl = new URL(currentUrl);
      fetchUrl.searchParams.set("hl", targetLang);
      
      const response = await fetch(fetchUrl.toString());
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      
      // Googleヘルプのタイトルは通常 h1
      const remoteTitle = doc.querySelector("h1")?.innerText || doc.title;
      if (remoteTitle) title = remoteTitle;
    } catch (e) {
      console.warn(`${targetLang} 版タイトルの取得に失敗しました。`);
    }
  }

  // 既存の個別サイト用タイトル取得ロジック（通常モード、または上記で取得できなかった場合）
  if (!title) {
    if (currentUrl.includes("faq2.epson.jp")) {
      const epsonTitle = document.querySelector(".faq_qstCont_ttl, #QuestionDescription, dt.question");
      if (epsonTitle) title = epsonTitle.innerText;
    } else if (/https:\/\/news\.yahoo\.co\.jp\/*/.test(currentUrl)) {
      title = document.querySelector("article > header > h1")?.innerText;
    } else if (/https:\/\/eset-support\.canon-its\.jp\/*/.test(currentUrl)) {
      title = document.querySelector("h2.faq_qstCont_ttl > span.icoQ")?.innerText;
    } else if (/(https:\/\/kitaney-google\.blogspot\.com\/*|https:\/\/kitaney-wordpress\.blogspot\.com\/*)/.test(currentUrl)) {
      title = document.querySelector("h3")?.innerText;
    }
  }

  // 標準のタイトル（フォールバック）
  if (!title || title.trim() === "よくある質問(FAQ)｜エプソン") {
    title = document.title;
  }

  // 改行と余計な空白を掃除
  title = title.replace(/\r?\n/g, "").replace(/\s+/g, " ").trim();
  const textToCopy = `${title}\n${decodeURL}`;

  // --- 3. コピー処理 ---
  try {
    await navigator.clipboard.writeText(textToCopy);
    console.log("Copied:", textToCopy);
  } catch (err) {
    const n = document.createElement("textarea");
    n.value = textToCopy;
    document.body.appendChild(n);
    n.select();
    document.execCommand("copy");
    document.body.removeChild(n);
  }
}