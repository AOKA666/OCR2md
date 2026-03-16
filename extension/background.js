import { runOcr } from './ocr.js';
import { runAi } from './ai.js';

const popupPorts = new Set();
let latestJob = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-area',
    title: 'Capture region and generate Markdown',
    contexts: ['action', 'page']
  });
});

function startCaptureInTab(tabId) {
  if (!tabId) return;
  injectCapture(tabId);
}

chrome.action.onClicked.addListener(tab => {
  startCaptureInTab(tab?.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-area' && tab?.id) {
    startCaptureInTab(tab.id);
  }
});

chrome.commands.onCommand.addListener(command => {
  if (command === 'start_capture') {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(tabs => {
        const current = tabs[0];
        if (current?.id) {
          startCaptureInTab(current.id);
        }
      })
      .catch(() => {});
  }
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'popup') return;
  popupPorts.add(port);
  port.onDisconnect.addListener(() => popupPorts.delete(port));
  port.onMessage.addListener(message => {
    if (message?.type === 'requestCapture') {
      chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        const current = tabs[0];
        if (current?.id) {
          startCaptureInTab(current.id);
        } else {
          port.postMessage({ type: 'error', text: 'Unable to locate the active tab.' });
        }
      });
    }
  });
  if (latestJob) {
    port.postMessage({ type: 'job', job: latestJob });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'selectionComplete' && sender.tab?.id) {
    handleSelection(sender.tab, message.rect, message.viewport, message.pageUrl).catch(() => {});
  }
});

async function injectCapture(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['capture.js']
    });
    chrome.tabs.sendMessage(tabId, { type: 'startCapture' }).catch(() => {});
  } catch (error) {
    broadcast({ type: 'error', text: 'Failed to inject the capture tool. Please refresh and try again.' }, tabId);
  }
}

async function handleSelection(tab, rect, viewport, pageUrl) {
  const job = createJob(rect, viewport, pageUrl, tab.id);
  latestJob = job;
  broadcast({ type: 'job', job }, tab.id);
  try {
    const captureDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    job.captured = captureDataUrl;
    job.stage = 'captured';
    job.log.push('Screenshot captured. Cropping and OCR...');
    broadcast({ type: 'job', job }, tab.id);

    const cropped = await cropCapture(captureDataUrl, rect, viewport);
    job.croppedImage = cropped;
    job.log.push('OCR in progress...');
    broadcast({ type: 'job', job }, tab.id);

    const ocrText = await runOcr(cropped);
    job.ocrText = ocrText;
    job.stage = 'ocr';
    job.log.push('OCR completed. Sending to AI...');
    broadcast({ type: 'job', job }, tab.id);

    const markdown = await runAi(ocrText);
    job.markdown = markdown;
    job.stage = 'done';
    job.log.push('Markdown generated and ready.');
    broadcast({ type: 'job', job }, tab.id);
  } catch (error) {
    job.stage = 'error';
    job.error = error.message || 'Processing failed';
    job.log.push(job.error);
    broadcast({ type: 'job', job }, tab.id);
  }
}

function createJob(rect, viewport, pageUrl, tabId) {
  return {
    id: crypto.randomUUID?.() ?? Math.floor(Math.random() * 1e9).toString(),
    stage: 'pending',
    rect,
    viewport,
    pageUrl,
    tabId,
    log: ['Selection confirmed. Waiting for screenshot...'],
    captured: '',
    croppedImage: '',
    ocrText: '',
    markdown: '',
    error: ''
  };
}

async function cropCapture(dataUrl, rect, viewport) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Failed to convert screenshot data');
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const viewportWidth = viewport?.width || bitmap.width;
  const viewportHeight = viewport?.height || bitmap.height;
  const scaleX = bitmap.width / viewportWidth;
  const scaleY = bitmap.height / viewportHeight;

  const srcX = Math.max(0, Math.floor(rect.x * scaleX));
  const srcY = Math.max(0, Math.floor(rect.y * scaleY));
  const srcW = Math.max(1, Math.min(bitmap.width - srcX, Math.floor(rect.width * scaleX)));
  const srcH = Math.max(1, Math.min(bitmap.height - srcY, Math.floor(rect.height * scaleY)));

  const canvas = new OffscreenCanvas(srcW, srcH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(croppedBlob);
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function broadcast(payload, tabId) {
  popupPorts.forEach(port => port.postMessage(payload));
  if (tabId) {
    chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  }
}
