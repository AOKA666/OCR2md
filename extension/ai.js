const DOUBAO_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MODEL = 'doubao-seed-1-6-flash-250828';
const PROMPT = `Convert the following OCR text into a clean, well-structured Markdown document.

Requirements:
- preserve headings
- detect ordered and unordered lists
- convert tables when obvious
- format code blocks if present
- clean up obvious OCR errors
- keep the original text flow when structure is unclear`;

async function getApiKey() {
  const { doubaoApiKey = '' } = await chrome.storage.local.get(['doubaoApiKey']);
  return doubaoApiKey.trim();
}

export async function runAi(ocrText) {
  const markdownContent = ocrText?.trim();
  if (!markdownContent) throw new Error('No OCR text was detected.');
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Please set your Volcengine Ark API Key in Settings first.');
  }

  const response = await fetch(DOUBAO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a Markdown formatter that converts OCR output into structured Markdown.' },
        { role: 'user', content: `${PROMPT}\n\nOCR TEXT:\n${markdownContent}` }
      ],
      thinking: { type: 'disabled' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Doubao API request failed');
    throw new Error(`AI generation failed: ${errorText}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('AI did not return valid Markdown content.');
  }
  return message;
}
