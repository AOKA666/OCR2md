let workerPromise;
let queue = Promise.resolve();

function isKnownTesseractNoise(text = '') {
  const s = String(text || '');
  return (
    s.includes('assets/vendor/tesseract.min.js') ||
    s.includes('assets/vendor/worker.min.js') ||
    s.includes('Aborted(') ||
    s.includes('wasm') ||
    s.includes("Failed to execute 'importScripts'")
  );
}

function noiseFromErrorEvent(event) {
  const message = event?.message || '';
  const filename = event?.filename || '';
  const stack = event?.error?.stack || '';
  return isKnownTesseractNoise(`${message}\n${filename}\n${stack}`);
}

function noiseFromRejection(reason) {
  if (!reason) return false;
  const message =
    typeof reason === 'string'
      ? reason
      : `${reason.message || ''}\n${reason.stack || ''}`;
  return isKnownTesseractNoise(message);
}

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  const merged = args
    .map(item => (typeof item === 'string' ? item : `${item?.message || ''}\n${item?.stack || ''}`))
    .join('\n');
  if (isKnownTesseractNoise(merged)) return;
  originalConsoleError(...args);
};

// Suppress known non-fatal bootstrap noise from tesseract internals in offscreen context.
self.addEventListener('error', event => {
  if (noiseFromErrorEvent(event)) {
    event.preventDefault();
  }
});

self.addEventListener('unhandledrejection', event => {
  if (noiseFromRejection(event.reason)) {
    event.preventDefault();
  }
});

function normalizeImageInput(image) {
  if (!image) return '';
  if (typeof image !== 'string') return image;
  if (image.startsWith('data:image/')) return image;
  return `data:image/png;base64,${image}`;
}

function toErrorMessage(error) {
  if (!error) return 'Unknown OCR error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name || 'OCR Error';
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!self.Tesseract) {
        throw new Error('Failed to load OCR tool');
      }
      const workerPath = chrome.runtime.getURL('assets/vendor/worker.min.js');
      const corePath = chrome.runtime.getURL('assets/vendor/tesseract-core.wasm.js');
      const langPath = chrome.runtime.getURL('assets/tessdata');
      const worker = await self.Tesseract.createWorker({
        workerPath,
        corePath,
        langPath,
        workerBlobURL: false,
        logger: () => {},
        errorHandler: err => {
          if (isKnownTesseractNoise(err?.message || err)) return;
          throw err;
        }
      });
      await worker.loadLanguage('chi_sim+eng');
      await worker.initialize('chi_sim+eng');
      return worker;
    })();
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ocr:run') return;

  queue = queue
    .then(async () => {
      const image = message.image;
      if (!image) {
        sendResponse({ id: message.id, text: '' });
        return;
      }
      const worker = await getWorker();
      const normalizedImage = normalizeImageInput(image);
      const { data } = await worker.recognize(normalizedImage);
      sendResponse({ id: message.id, text: data?.text?.trim() ?? '' });
    })
    .catch(error => {
      sendResponse({
        id: message.id,
        error: `OCR execution failed: ${toErrorMessage(error)}`
      });
    });

  return true;
});
