const statusText = document.getElementById('optionsStatus');

if (statusText) {
  statusText.textContent = '如需调整接口地址或鉴权，请修改 extension/ai.js 中的 BACKEND_URL / BACKEND_TOKEN。';
}

