(() => {
  if (window.__smdCaptureBridge) return;

  const CSS_ID = 'smd-overlay-stylesheet';
  const CSS_URL = chrome.runtime.getURL('capture.css');

  const state = {
    overlay: null,
    selection: null,
    cursor: null,
    selecting: false,
    startX: 0,
    startY: 0,
    activePointerId: null
  };

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
  }

  function ensureOverlay() {
    if (state.overlay) return;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'smd-overlay';

    const selection = document.createElement('div');
    selection.className = 'smd-selection';

    const cursor = document.createElement('div');
    cursor.className = 'smd-cursor';

    overlay.append(selection, cursor);
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', handlePointerDown);
    overlay.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);

    state.overlay = overlay;
    state.selection = selection;
    state.cursor = cursor;
  }

  function normalizeRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return { left, top, width, height };
  }

  function updateSelection(x, y, width, height) {
    Object.assign(state.selection.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    if (!state.overlay.classList.contains('smd-overlay--active')) return;
    state.selecting = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.activePointerId = event.pointerId;
    state.overlay.setPointerCapture?.(event.pointerId);
    state.selection.style.display = 'block';
    updateSelection(state.startX, state.startY, 0, 0);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (state.cursor) {
      state.cursor.style.left = `${event.clientX}px`;
      state.cursor.style.top = `${event.clientY}px`;
    }
    if (!state.selecting) return;
    if (state.activePointerId !== null && event.pointerId !== state.activePointerId) return;
    const rect = normalizeRect(state.startX, state.startY, event.clientX, event.clientY);
    updateSelection(rect.left, rect.top, rect.width, rect.height);
  }

  function handlePointerUp(event) {
    if (!state.selecting) return;
    if (state.activePointerId !== null && event.pointerId !== state.activePointerId) return;
    state.selecting = false;
    state.activePointerId = null;

    const rect = normalizeRect(state.startX, state.startY, event.clientX, event.clientY);
    stopCapture();

    if (rect.width < 20 || rect.height < 20) {
      return;
    }

    chrome.runtime.sendMessage({
      type: 'selectionComplete',
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      pageUrl: window.location.href
    });
  }

  function handlePointerCancel(event) {
    if (state.activePointerId !== null && event.pointerId !== state.activePointerId) return;
    state.selecting = false;
    state.activePointerId = null;
    stopCapture();
  }

  function startCapture() {
    ensureOverlay();
    state.overlay.classList.add('smd-overlay--active');
    state.selection.style.display = 'none';
    if (state.cursor) {
      state.cursor.style.display = 'block';
    }
  }

  function stopCapture() {
    if (!state.overlay) return;
    state.overlay.classList.remove('smd-overlay--active');
    state.selection.style.display = 'none';
    if (state.cursor) {
      state.cursor.style.display = 'none';
    }
  }

  function handleGlobalKey(event) {
    const triggerByCtrlShiftX = event.ctrlKey && event.shiftKey && event.code === 'KeyX';
    const triggerByAltShiftX = event.altKey && event.shiftKey && event.code === 'KeyX';
    if (triggerByCtrlShiftX || triggerByAltShiftX) {
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      startCapture();
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      stopCapture();
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'startCapture') {
      startCapture();
    }
  });

  window.addEventListener('keydown', handleGlobalKey, true);
  window.__smdCaptureBridge = { startCapture };
})();
