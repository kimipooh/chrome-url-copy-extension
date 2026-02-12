/* メニューアイテムを識別するためのID */
const MENU_ID = "decode-url-copy";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "タイトルとデコード済みURLをコピー",
    contexts: ["all"]
  });
  chrome.action.setBadgeText({ text: "C" });
  chrome.action.setBadgeBackgroundColor({ color: "#111111" });
});

chrome.action.onClicked.addListener((tab) => { executeCopy(tab); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) { executeCopy(tab); }
});

function executeCopy(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: mainProcessInPage
  });
}

/**
 * ページ内で実行されるメイン処理
 */
async function mainProcessInPage() {
  // --- 1. URLの取得とクリーンアップ ---
  let rawUrl = window.location.href;
  let cleanUrl = rawUrl;

  try {
    const urlObj = new URL(rawUrl);
    
    // 不要なパラメーター（uule）を削除
    if (urlObj.searchParams.has("uule")) {
      urlObj.searchParams.delete("uule");
    }
    
    // Googleサポート系で付与されがちな他の不要パラメーターも処理（任意で追加可能）
    // 例: urlObj.searchParams.delete("visit_id");
    
    cleanUrl = urlObj.toString();
  } catch (e) {
    // URL解析に失敗した場合は元のURLを使用
    cleanUrl = rawUrl;
  }

  // URLのデコード
  let decodeURL = "";
  try {
    decodeURL = decodeURIComponent(cleanUrl);
  } catch (e) {
    decodeURL = cleanUrl;
  }

  // --- 2. タイトルの取得（各サイト個別ロジック維持） ---
  let title = "";
  const currentUrl = window.location.href; // 判定には元のURLを使用
  
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

  // 特定サイト以外、または上記で取得できなかった場合は標準のタイトル
  if (!title || title.trim() === "よくある質問(FAQ)｜エプソン") {
    title = document.title;
  }

  // 改行と余計な空白を掃除
  title = title.replace(/\r?\n/g, "").replace(/\s+/g, " ").trim();
  const textToCopy = `${title}\n${decodeURL}`;

  // --- 3. コピー処理 ---
  try {
    await navigator.clipboard.writeText(textToCopy);
    console.log("Copied (Cleaned):", textToCopy);
  } catch (err) {
    const n = document.createElement("textarea");
    n.value = textToCopy;
    document.body.appendChild(n);
    n.select();
    document.execCommand("copy");
    document.body.removeChild(n);
    console.log("Fallback Copied (Cleaned):", textToCopy);
  }
}