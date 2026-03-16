const OFFSCREEN_PATH = 'offscreen.html';
let requestSeq = 0;
let creatingOffscreenPromise;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length > 0) return;

  if (!creatingOffscreenPromise) {
    creatingOffscreenPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['BLOBS'],
        justification: 'Run OCR with Tesseract in an offscreen page context.'
      })
      .finally(() => {
        creatingOffscreenPromise = null;
      });
  }
  await creatingOffscreenPromise;
}

export async function runOcr(base64Image) {
  if (!base64Image) return '';
  await ensureOffscreenDocument();
  const id = `${Date.now()}-${requestSeq++}`;
  const response = await chrome.runtime.sendMessage({
    type: 'ocr:run',
    id,
    image: base64Image
  });
  if (!response) {
    throw new Error('OCR service did not respond');
  }
  if (response.error) {
    throw new Error(response.error);
  }
  return response.text ?? '';
}
