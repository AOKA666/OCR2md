
const MENU_ID = 'snap2md_extract';

function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Extract Structured Markdown',
      contexts: ['image'],
      documentUrlPatterns: ['<all_urls>']
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const imageUrl = info.srcUrl;
  if (!imageUrl) return;
  const popupUrl = chrome.runtime.getURL(
    `popup.html?imageUrl=${encodeURIComponent(imageUrl)}`
  );
  chrome.windows.create({
    url: popupUrl,
    type: 'popup',
    width: 460,
    height: 660
  });
});
