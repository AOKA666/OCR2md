(() => {
  const BRIDGE_KEY = '__smdCaptureBridge';
  const VERSION = '2026-03-31.1';

  function debug(...args) {
    console.debug('[smd-capture]', ...args);
  }

  // Remove stale overlays from older injected versions.
  document.querySelectorAll('.smd-overlay').forEach(node => node.remove());

  // Best-effort cleanup for previously injected bridge.
  try {
    window[BRIDGE_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    overlay: null,
    selection: null,
    cursor: null,
    resultPanel: null,
    resultBody: null,
    resultCopyBtn: null,
    selecting: false,
    active: false,
    startX: 0,
    startY: 0,
    bound: {
      mousedown: null,
      mousemove: null,
      mouseup: null,
      keydown: null
    }
  };

  function normalizeRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return { left, top, width, height };
  }

  function updateSelection(x, y, width, height) {
    if (!state.selection) return;
    Object.assign(state.selection.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  function stopCapture() {
    state.active = false;
    state.selecting = false;
    if (!state.overlay) return;
    state.overlay.classList.remove('smd-overlay--active');
    if (state.selection) {
      state.selection.style.display = 'none';
    }
    if (state.cursor) {
      state.cursor.style.display = 'none';
    }
  }

  function ensureResultPanel() {
    if (state.resultPanel && state.resultPanel.isConnected) return;
    const root = document.body || document.documentElement;
    if (!root) return;

    const panel = document.createElement('div');
    panel.className = 'smd-result-panel';
    panel.innerHTML = `
      <div class="smd-result-header">
        <span>Markdown</span>
        <button type="button" data-close>Close</button>
      </div>
      <pre class="smd-result-body"></pre>
      <div class="smd-result-actions">
        <button type="button" data-copy>Copy</button>
      </div>
    `;

    const body = panel.querySelector('.smd-result-body');
    const copyBtn = panel.querySelector('[data-copy]');
    const closeBtn = panel.querySelector('[data-close]');

    copyBtn.addEventListener('click', async () => {
      const text = state.resultBody?.textContent || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1000);
      } catch (_) {}
    });

    closeBtn.addEventListener('click', () => panel.classList.remove('visible'));

    root.appendChild(panel);
    state.resultPanel = panel;
    state.resultBody = body;
    state.resultCopyBtn = copyBtn;
  }

  function showResult(text, isError = false) {
    ensureResultPanel();
    if (!state.resultPanel || !state.resultBody) return;
    state.resultPanel.classList.add('visible');
    state.resultPanel.classList.remove('loading');
    state.resultPanel.classList.toggle('error', Boolean(isError));
    state.resultBody.textContent = text || '';
    if (state.resultCopyBtn) {
      state.resultCopyBtn.disabled = Boolean(isError) || !text;
      state.resultCopyBtn.textContent = 'Copy';
    }
  }

  function showProgress(stageText) {
    ensureResultPanel();
    if (!state.resultPanel || !state.resultBody) return;
    state.resultPanel.classList.add('visible');
    state.resultPanel.classList.remove('error');
    state.resultPanel.classList.add('loading');
    state.resultBody.textContent = stageText || 'Processing...';
    if (state.resultCopyBtn) {
      state.resultCopyBtn.disabled = true;
      state.resultCopyBtn.textContent = 'Copy';
    }
  }

  function handleMouseDown(event) {
    if (!state.active) return;
    if (event.button !== 0) return;

    state.selecting = true;
    state.startX = event.clientX;
    state.startY = event.clientY;

    if (state.selection) {
      state.selection.style.display = 'block';
    }
    updateSelection(state.startX, state.startY, 0, 0);

    event.preventDefault();
    event.stopPropagation();
  }

  function handleMouseMove(event) {
    if (state.cursor) {
      state.cursor.style.left = `${event.clientX}px`;
      state.cursor.style.top = `${event.clientY}px`;
      state.cursor.style.display = state.active ? 'block' : 'none';
    }
    if (!state.active || !state.selecting) return;
    const rect = normalizeRect(state.startX, state.startY, event.clientX, event.clientY);
    updateSelection(rect.left, rect.top, rect.width, rect.height);
    event.preventDefault();
  }

  function handleMouseUp(event) {
    if (!state.active || !state.selecting) return;

    state.selecting = false;
    const rect = normalizeRect(state.startX, state.startY, event.clientX, event.clientY);
    stopCapture();

    if (rect.width < 20 || rect.height < 20) {
      debug('selection too small, ignored', rect);
      return;
    }

    chrome.runtime
      .sendMessage({
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
      })
      .catch(error => {
        console.error('[smd-capture] failed to send selectionComplete', error);
        showResult(`Failed to send selection: ${error?.message || 'Unknown error'}`, true);
      });

    showProgress('Selection captured.\nTaking screenshot and generating Markdown...');

    event.preventDefault();
  }

  function handleKeyDown(event) {
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

  function ensureOverlay() {
    if (state.overlay && state.overlay.isConnected) return;

    const root = document.body || document.documentElement;
    if (!root) {
      throw new Error('No document root available for capture overlay');
    }

    const overlay = document.createElement('div');
    overlay.className = 'smd-overlay';
    overlay.setAttribute('data-smd-capture-version', VERSION);

    const selection = document.createElement('div');
    selection.className = 'smd-selection';
    const cursor = document.createElement('div');
    cursor.className = 'smd-cursor';
    cursor.style.display = 'none';

    overlay.appendChild(selection);
    overlay.appendChild(cursor);
    root.appendChild(overlay);

    state.bound.mousedown = handleMouseDown;
    state.bound.mousemove = handleMouseMove;
    state.bound.mouseup = handleMouseUp;
    state.bound.keydown = handleKeyDown;

    overlay.addEventListener('mousedown', state.bound.mousedown, true);
    window.addEventListener('mousemove', state.bound.mousemove, true);
    window.addEventListener('mouseup', state.bound.mouseup, true);
    window.addEventListener('keydown', state.bound.keydown, true);

    state.overlay = overlay;
    state.selection = selection;
    state.cursor = cursor;
  }

  function startCapture() {
    ensureOverlay();
    state.active = true;
    state.selecting = false;
    state.overlay.classList.add('smd-overlay--active');
    state.selection.style.display = 'none';
    if (state.cursor) {
      state.cursor.style.display = 'block';
    }
    debug('capture started', { version: VERSION, href: location.href });
    return true;
  }

  function destroy() {
    stopCapture();
    if (state.overlay && state.bound.mousedown) {
      state.overlay.removeEventListener('mousedown', state.bound.mousedown, true);
    }
    if (state.bound.mousemove) {
      window.removeEventListener('mousemove', state.bound.mousemove, true);
    }
    if (state.bound.mouseup) {
      window.removeEventListener('mouseup', state.bound.mouseup, true);
    }
    if (state.bound.keydown) {
      window.removeEventListener('keydown', state.bound.keydown, true);
    }
    if (state.overlay?.isConnected) {
      state.overlay.remove();
    }
    if (state.resultPanel?.isConnected) {
      state.resultPanel.remove();
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'job' || !message.job) return;
    const job = message.job;
    if (job.stage === 'pending') {
      showProgress('Selection captured.\nTaking screenshot...');
      return;
    }
    if (job.stage === 'captured') {
      showProgress('Screenshot captured.\nRunning OCR...');
      return;
    }
    if (job.stage === 'ocr') {
      showProgress('OCR completed.\nConverting to Markdown...');
      return;
    }
    if (job.stage === 'done' && job.markdown) {
      state.resultPanel?.classList.remove('loading');
      showResult(job.markdown, false);
      return;
    }
    if (job.stage === 'error') {
      state.resultPanel?.classList.remove('loading');
      showResult(job.error || 'Processing failed', true);
    }
  });

  window[BRIDGE_KEY] = {
    version: VERSION,
    startCapture,
    stopCapture,
    destroy
  };
})();
