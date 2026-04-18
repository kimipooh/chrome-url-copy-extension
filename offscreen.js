chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "copy-data") {
    const ta = document.createElement("textarea");
    ta.value = request.text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    sendResponse({ success: true });
  }
});
