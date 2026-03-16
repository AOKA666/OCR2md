let tesseractWorkerPromise;
let queue = Promise.resolve();

async function ensureTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      try {
        importScripts('assets/vendor/tesseract.min.js');
      } catch (error) {
        throw new Error(`Failed to load OCR tool: ${error?.message || 'importScripts failed'}`);
      }
      if (!self.Tesseract) {
        throw new Error('Tesseract init failed');
      }
      const worker = await self.Tesseract.createWorker({
        logger: () => {}
      });
      await worker.load();
      await worker.loadLanguage('chi_sim+eng');
      await worker.initialize('chi_sim+eng');
      return worker;
    })();
  }
  return tesseractWorkerPromise;
}

self.onmessage = event => {
  const { id, image } = event.data || {};
  if (!id) return;
  queue = queue
    .then(async () => {
      if (!image) {
        self.postMessage({ id, text: '' });
        return;
      }
      const worker = await ensureTesseractWorker();
      const { data } = await worker.recognize(image);
      self.postMessage({ id, text: data?.text?.trim() ?? '' });
    })
    .catch(error => {
      self.postMessage({ id, error: error?.message || 'OCR execution failed' });
    });
};
