const form = document.getElementById('optionsForm');
const apiKeyInput = document.getElementById('apiKey');
const statusText = document.getElementById('optionsStatus');

chrome.storage.local.get(['doubaoApiKey', 'openaiApiKey'], ({ doubaoApiKey, openaiApiKey }) => {
  const value = doubaoApiKey ?? openaiApiKey ?? '';
  if (value) {
    apiKeyInput.value = value;
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const value = apiKeyInput.value.trim();
  chrome.storage.local.set({ doubaoApiKey: value }, () => {
    statusText.textContent = 'Saved.';
    setTimeout(() => {
      statusText.textContent = '';
    }, 2000);
  });
});

