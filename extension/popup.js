const startBtn = document.getElementById('startCapture');

startBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'requestCapture' }).catch(() => {});
  window.close();
});
