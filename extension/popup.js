const API_ENDPOINT = 'https://api.snap2markdown.example/api/extract-markdown';

const previewImage = document.getElementById('previewImage');
const statusEl = document.getElementById('status');
const markdownOutput = document.getElementById('markdownOutput');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const errorMessage = document.getElementById('errorMessage');
const toast = document.getElementById('toast');
const closeBtn = document.getElementById('closeBtn');

const params = new URLSearchParams(window.location.search);
const imageUrl = params.get('imageUrl');

let currentMarkdown = '';

closeBtn.addEventListener('click', () => window.close());

if (!imageUrl) {
  setError('无法获取图片 URL，请重新从图片右键菜单打开。');
  setStatus('等待图片...');
} else {
  previewImage.src = imageUrl;
  fetchMarkdown(imageUrl);
}

copyBtn.addEventListener('click', async () => {
  if (!currentMarkdown) return;
  try {
    await navigator.clipboard.writeText(currentMarkdown);
    showToast('Markdown 已复制');
  } catch (error) {
    setError('复制失败，请手动复制。');
  }
});

downloadBtn.addEventListener('click', () => {
  if (!currentMarkdown) return;
  const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = snap2markdown-.md;
  a.click();
  URL.revokeObjectURL(url);
});

function setStatus(text, completed = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('completed', completed);
}

function setError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
}

async function fetchMarkdown(imageSrc) {
  setStatus('正在处理图片...', false);
  hideError();
  try {
    const base64 = await fetchImageAsBase64(imageSrc);
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        sourceUrl: imageSrc
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法识别');
      throw new Error(服务响应错误：);
    }

    const payload = await response.json();
    const markdown = payload.markdown || payload.result || '';

    if (!markdown.trim()) {
      throw new Error('AI 没有返回有效的 Markdown。');
    }

    currentMarkdown = markdown.trim();
    markdownOutput.value = currentMarkdown;
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
    setStatus('完成', true);
  } catch (error) {
    console.error(error);
    setStatus('失败', false);
    setError(error.message || '处理失败，请稍后重试。');
  }
}

async function fetchImageAsBase64(src) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error('读取图片失败，可能是跨域限制。');
  }
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('hidden');
  }, 2200);
}
