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

function getGrayValue(r, g, b) {
  // Luminance weighting tuned for OCR readability.
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function computeOtsuThreshold(histogram, totalPixels) {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const varianceBetween =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      threshold = t;
    }
  }

  return threshold;
}

async function buildEnhancedImageVariants(inputImage) {
  const response = await fetch(inputImage);
  if (!response.ok) {
    throw new Error('Failed to load image for OCR preprocessing');
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const longest = Math.max(bitmap.width, bitmap.height);
  const targetLongest = 2200;
  const scale = Math.max(1, Math.min(2.5, targetLongest / Math.max(1, longest)));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to initialize OCR preprocessing canvas');

  ctx.drawImage(bitmap, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const histogram = new Array(256).fill(0);

  let minGray = 255;
  let maxGray = 0;

  for (let i = 0; i < data.length; i += 4) {
    const gray = getGrayValue(data[i], data[i + 1], data[i + 2]);
    histogram[gray] += 1;
    if (gray < minGray) minGray = gray;
    if (gray > maxGray) maxGray = gray;
  }

  const span = Math.max(1, maxGray - minGray);
  const threshold = computeOtsuThreshold(histogram, width * height);

  const grayCanvas = new OffscreenCanvas(width, height);
  const grayCtx = grayCanvas.getContext('2d', { willReadFrequently: true });
  if (!grayCtx) throw new Error('Failed to initialize grayscale preprocessing canvas');

  const grayData = new ImageData(width, height);
  const binaryData = new ImageData(width, height);

  for (let i = 0; i < data.length; i += 4) {
    const rawGray = getGrayValue(data[i], data[i + 1], data[i + 2]);
    const stretched = Math.max(0, Math.min(255, Math.round(((rawGray - minGray) * 255) / span)));
    const bw = stretched >= threshold ? 255 : 0;

    grayData.data[i] = stretched;
    grayData.data[i + 1] = stretched;
    grayData.data[i + 2] = stretched;
    grayData.data[i + 3] = 255;

    binaryData.data[i] = bw;
    binaryData.data[i + 1] = bw;
    binaryData.data[i + 2] = bw;
    binaryData.data[i + 3] = 255;
  }

  grayCtx.putImageData(grayData, 0, 0);
  const grayBlob = await grayCanvas.convertToBlob({ type: 'image/png' });

  const binaryCanvas = new OffscreenCanvas(width, height);
  const binaryCtx = binaryCanvas.getContext('2d', { willReadFrequently: true });
  if (!binaryCtx) throw new Error('Failed to initialize binary preprocessing canvas');
  binaryCtx.putImageData(binaryData, 0, 0);
  const binaryBlob = await binaryCanvas.convertToBlob({ type: 'image/png' });

  return {
    grayImage: URL.createObjectURL(grayBlob),
    binaryImage: URL.createObjectURL(binaryBlob)
  };
}

function scoreOcrResult(resultText, confidence) {
  const text = (resultText || '').trim();
  const conf = Number.isFinite(confidence) ? confidence : 0;
  const textScore = Math.min(200, text.length) / 5;
  return conf + textScore;
}

async function recognizeBestText(worker, normalizedImage) {
  const attempts = [];

  const runAttempt = async (image, psm) => {
    await worker.setParameters({
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300'
    });
    const { data } = await worker.recognize(image);
    const text = data?.text?.trim() ?? '';
    const confidence = Number(data?.confidence ?? 0);
    attempts.push({
      text,
      confidence,
      score: scoreOcrResult(text, confidence)
    });
  };

  await runAttempt(normalizedImage, 6);

  const first = attempts[0];
  if (first && first.confidence >= 88 && first.text.length >= 24) {
    return first.text;
  }

  let variants = null;
  try {
    variants = await buildEnhancedImageVariants(normalizedImage);
    await runAttempt(variants.grayImage, 6);
    await runAttempt(variants.grayImage, 11);
    await runAttempt(variants.binaryImage, 6);
  } finally {
    if (variants?.grayImage) URL.revokeObjectURL(variants.grayImage);
    if (variants?.binaryImage) URL.revokeObjectURL(variants.binaryImage);
  }

  const best = attempts.sort((a, b) => b.score - a.score)[0];
  return best?.text ?? '';
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
      const text = await recognizeBestText(worker, normalizedImage);
      sendResponse({ id: message.id, text });
    })
    .catch(error => {
      sendResponse({
        id: message.id,
        error: `OCR execution failed: ${toErrorMessage(error)}`
      });
    });

  return true;
});
