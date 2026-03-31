const startBtn = document.getElementById('startCapture');

startBtn.addEventListener('click', async () => {
  try {
    let tab = null;

    const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = currentWindowTabs[0] ?? null;

    if (!tab?.id) {
      const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = lastFocusedTabs[0] ?? null;
    }

    if (!tab?.id) {
      throw new Error('No active tab available for capture');
    }

    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['capture.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['capture.js']
    });

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const bridge = window.__smdCaptureBridge;
        if (!bridge?.startCapture) {
          return { ok: false, reason: 'bridge-missing' };
        }
        const started = bridge.startCapture();
        return {
          ok: Boolean(started),
          version: bridge.version || 'unknown'
        };
      }
    });

    if (!result?.result?.ok) {
      throw new Error(`Capture bridge failed to start: ${result?.result?.reason || 'unknown'}`);
    }

    window.close();
  } catch (error) {
    console.error('Popup capture start failed', error);
    alert('Select failed to start on this page. Refresh the page and try again on a regular website tab.');
  }
});
