const BACKEND_URL = 'https://www.ocr2md.online/api/markdown';
const BACKEND_TOKEN = '';

export async function runAi(ocrText) {
  const markdownContent = ocrText?.trim();
  if (!markdownContent) throw new Error('No OCR text was detected.');

  const headers = {
    'Content-Type': 'application/json'
  };
  if (BACKEND_TOKEN) {
    headers.Authorization = `Bearer ${BACKEND_TOKEN}`;
  }

  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ocrText: markdownContent
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Backend API request failed');
    throw new Error(`AI generation failed: ${errorText}`);
  }

  const payload = await response.json();
  const message = (
    payload?.markdown
    || payload?.data?.markdown
    || payload?.choices?.[0]?.message?.content
    || ''
  ).trim();
  if (!message) {
    throw new Error('AI did not return valid Markdown content.');
  }
  return message;
}
