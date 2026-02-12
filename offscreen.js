chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'copy-data') {
    const textArea = document.createElement("textarea");
    textArea.value = request.text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    window.close(); // 役割が終わったら閉じる
  }
});
