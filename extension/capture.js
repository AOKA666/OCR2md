(() => {
  if (window.__smdCaptureBridge) return;

  const CSS_ID = 'smd-overlay-stylesheet';
  const CSS_URL = chrome.runtime.getURL('capture.css');
  const stageText = {
    pending: 'Waiting for capture...',
    captured: 'Screenshot captured. Cropping and OCR...',
    ocr: 'OCR completed. Sending to AI...',
    done: 'Markdown is ready.',
    error: 'Processing failed.'
  };

  const state = {
    overlay: null,
    selection: null,
    tip: null,
    cursor: null,
    actionBar: null,
    actionButtons: [],
    panel: null,
    panelStatus: null,
    panelImage: null,
    panelContent: null,
    panelLog: null,
    copyMdBtn: null,
    toast: null,
    toastTimeout: null,
    selecting: false,
    startX: 0,
    startY: 0,
    latestJob: null
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

    const tip = document.createElement('div');
    tip.className = 'smd-tip';
    tip.textContent = 'Drag to select area. Press Esc to cancel.';

    const cursor = document.createElement('div');
    cursor.className = 'smd-cursor';

    const actionBar = document.createElement('div');
    actionBar.className = 'smd-action-bar';

    const buttons = [
      { mode: 'markdown', label: 'To Markdown' },
      { mode: 'cancel', label: 'Cancel' }
    ];
    const actionButtons = buttons.map(info => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mode = info.mode;
      button.textContent = info.label;
      if (info.mode === 'markdown') button.classList.add('active');
      button.addEventListener('click', handleActionClick);
      actionBar.append(button);
      return button;
    });

    overlay.append(selection, tip, cursor, actionBar);
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', handlePointerDown);
    overlay.addEventListener('pointermove', handlePointerMove);
    overlay.addEventListener('pointerup', handlePointerUp);
    overlay.addEventListener('pointerleave', () => {
      if (state.selecting) {
        handlePointerUp({ clientX: state.startX, clientY: state.startY });
      }
    });
    actionBar.addEventListener('pointerdown', event => event.stopPropagation());

    state.overlay = overlay;
    state.selection = selection;
    state.tip = tip;
    state.cursor = cursor;
    state.actionBar = actionBar;
    state.actionButtons = actionButtons;
  }

  function ensurePanel() {
    if (state.panel) return;
    const panel = document.createElement('div');
    panel.className = 'smd-panel hidden';
    panel.innerHTML = `
      <div class="smd-panel__header">
        <div>
          <p class="smd-panel__title">Screenshot to Markdown</p>
          <p class="smd-panel__status">Waiting...</p>
        </div>
        <button class="smd-panel__close" type="button" aria-label="Close">×</button>
      </div>
      <div class="smd-panel__preview">
        <img alt="Screenshot preview" />
      </div>
      <pre class="smd-panel__content"></pre>
      <div class="smd-panel__actions">
        <button type="button" data-copy="markdown" disabled>Copy Markdown</button>
      </div>
      <div class="smd-panel__log"></div>
    `;
    document.body.append(panel);

    const headerStatus = panel.querySelector('.smd-panel__status');
    const img = panel.querySelector('.smd-panel__preview img');
    const content = panel.querySelector('.smd-panel__content');
    const log = panel.querySelector('.smd-panel__log');
    const copyMdBtn = panel.querySelector('[data-copy="markdown"]');
    const closeBtn = panel.querySelector('.smd-panel__close');

    log.textContent = '';
    content.textContent = '';

    copyMdBtn.addEventListener('click', () => {
      if (!state.latestJob?.markdown) return;
      navigator.clipboard.writeText(state.latestJob.markdown);
      showToast('Markdown copied');
    });

    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

    state.panel = panel;
    state.panelStatus = headerStatus;
    state.panelImage = img;
    state.panelContent = content;
    state.panelLog = log;
    state.copyMdBtn = copyMdBtn;
  }

  function handleActionClick(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === 'cancel') {
      cleanupSelection();
      return;
    }
    state.actionButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    state.selecting = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.selection.style.display = 'block';
    updateSelection(0, 0, 0, 0);
    state.tip.textContent = 'Selecting area. Release to capture.';
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (state.cursor) {
      state.cursor.style.left = `${event.clientX}px`;
      state.cursor.style.top = `${event.clientY}px`;
    }
    if (!state.selecting) return;
    const rect = normalizeRect(state.startX, state.startY, event.clientX, event.clientY);
    updateSelection(rect.left, rect.top, rect.width, rect.height);
  }

  function handlePointerUp(event) {
    if (!state.selecting) return;
    state.selecting = false;
    const rect = normalizeRect(state.startX, state.startY, event.clientX, event.clientY);
    cleanupSelection();
    if (rect.width < 20 || rect.height < 20) {
      showToast('Please select a larger area');
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

  function cleanupSelection() {
    if (!state.overlay) return;
    state.selecting = false;
    state.selection.style.display = 'none';
    state.overlay.classList.remove('smd-overlay--active');
    state.tip.textContent = 'Drag to select area. Press Esc to cancel.';
  }

  function startCapture() {
    ensureOverlay();
    state.actionButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.mode === 'markdown');
    });
    state.overlay.classList.add('smd-overlay--active');
    window.requestAnimationFrame(() => {
      state.selection.style.display = 'none';
    });
  }

  function renderJob(job) {
    ensurePanel();
    state.latestJob = job;
    state.panel.classList.remove('hidden');
    state.panel.classList.toggle('smd-panel--error', job.stage === 'error');
    state.panelStatus.textContent =
      job.stage === 'error' ? job.error || stageText.error : stageText[job.stage] || 'Processing...';
    const hasImage = Boolean(job.croppedImage);
    state.panelImage.src = hasImage ? `data:image/png;base64,${job.croppedImage}` : '';
    state.panelImage.parentElement.classList.toggle('smd-panel__preview--empty', !hasImage);
    updateLog(job.log);
    updatePanelContent();
    state.copyMdBtn.disabled = !job.markdown;
  }

  function updatePanelContent() {
    if (!state.panel || !state.panelContent) return;
    const job = state.latestJob;
    if (!job) {
      state.panelContent.textContent = 'Waiting for results...';
      return;
    }
    state.panelContent.textContent = job.markdown || 'Markdown is not ready yet...';
  }

  function updateLog(messages = []) {
    if (!state.panelLog) return;
    state.panelLog.innerHTML = '';
    messages.forEach(line => {
      const el = document.createElement('p');
      el.textContent = line;
      state.panelLog.append(el);
    });
  }

  function showToast(message) {
    if (!state.toast) {
      const toast = document.createElement('div');
      toast.className = 'smd-toast';
      document.body.append(toast);
      state.toast = toast;
    }
    state.toast.textContent = message;
    state.toast.classList.add('visible');
    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => {
      state.toast.classList.remove('visible');
    }, 2200);
  }

  function handleGlobalKey(event) {
    if (event.altKey && event.shiftKey && event.code === 'KeyX') {
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      startCapture();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      cleanupSelection();
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'startCapture') {
      startCapture();
    } else if (message?.type === 'job') {
      renderJob(message.job);
    } else if (message?.type === 'error') {
      showToast(message.text || 'Operation failed');
    }
  });

  window.addEventListener('keydown', handleGlobalKey, true);

  window.__smdCaptureBridge = { startCapture };
})();
