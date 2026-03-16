const startBtn = document.getElementById('startCapture');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const previewImage = document.getElementById('previewImage');
const statusLabel = document.getElementById('statusLabel');
const statusLog = document.getElementById('statusLog');
const markdownOutput = document.getElementById('markdownOutput');
const errorMessage = document.getElementById('errorMessage');
const toast = document.getElementById('toast');
const closeBtn = document.getElementById('closeBtn');
const steps = document.querySelectorAll('.step');

let currentMarkdown = '';
const port = chrome.runtime.connect({ name: 'popup' });

startBtn.addEventListener('click', () => {
  resetState();
  statusLabel.textContent = 'Injecting capture tool...';
  port.postMessage({ type: 'requestCapture' });
});

copyBtn.addEventListener('click', async () => {
  if (!currentMarkdown) return;
  await navigator.clipboard.writeText(currentMarkdown);
  showToast('Markdown copied');
});

downloadBtn.addEventListener('click', () => {
  if (!currentMarkdown) return;
  const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'screenshot.md';
  a.click();
  URL.revokeObjectURL(url);
});

closeBtn.addEventListener('click', () => window.close());

port.onMessage.addListener(message => {
  if (message?.type === 'job') {
    renderJob(message.job);
  } else if (message?.type === 'error') {
    showError(message.text || 'Operation failed');
  }
});

function renderJob(job) {
  errorMessage.hidden = true;
  previewImage.src = job.croppedImage ? `data:image/png;base64,${job.croppedImage}` : '';
  updateLog(job.log);
  updateStatus(job.stage);
  markStep(job.stage);
  if (job.markdown) {
    currentMarkdown = job.markdown;
    markdownOutput.value = currentMarkdown;
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
  }
  if (job.stage === 'error') {
    showError(job.error || 'Processing failed. Please try again.');
  }
}

function updateLog(messages = []) {
  statusLog.innerHTML = messages.map(line => `<div>${line}</div>`).join('');
}

function updateStatus(stage) {
  const map = {
    pending: 'Waiting for screenshot...',
    captured: 'Screenshot captured. OCR in progress...',
    ocr: 'OCR completed. Sending to AI...',
    done: 'Markdown is ready',
    error: 'Processing failed'
  };
  statusLabel.textContent = map[stage] || 'Waiting for screenshot...';
}

function markStep(stage) {
  steps.forEach(step => {
    const name = step.dataset.step;
    step.classList.toggle('active', name === stage || (stage === 'done' && name === 'done') || (stage === 'ocr' && name === 'ai'));
  });
}

function resetState() {
  currentMarkdown = '';
  markdownOutput.value = '';
  copyBtn.disabled = true;
  downloadBtn.disabled = true;
  statusLog.textContent = '';
  previewImage.src = '';
  errorMessage.hidden = true;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2200);
}

resetState();
