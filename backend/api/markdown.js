const DOUBAO_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MODEL = process.env.ARK_MODEL || 'doubao-seed-1-6-flash-250828';
const ARK_API_KEY = (process.env.ARK_API_KEY || '').trim();
const BACKEND_TOKEN = (process.env.BACKEND_TOKEN || '').trim();

const PROMPT = `Convert the following OCR text into a clean, well-structured Markdown document.

Requirements:
- preserve headings
- detect ordered and unordered lists
- convert tables when obvious
- format code blocks if present
- clean up obvious OCR errors
- keep the original text flow when structure is unclear`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.status(statusCode).json(payload);
}

function checkAuth(req) {
  if (!BACKEND_TOKEN) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${BACKEND_TOKEN}`;
}

async function callDoubao(ocrText) {
  const response = await fetch(DOUBAO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You are a Markdown formatter that converts OCR output into structured Markdown.'
        },
        {
          role: 'user',
          content: `${PROMPT}\n\nOCR TEXT:\n${ocrText}`
        }
      ],
      thinking: { type: 'disabled' }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Doubao API request failed');
    throw new Error(text);
  }

  const payload = await response.json();
  const markdown = payload?.choices?.[0]?.message?.content?.trim() || '';
  if (!markdown) {
    throw new Error('Doubao returned empty markdown content');
  }
  return markdown;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  if (!ARK_API_KEY) {
    sendJson(res, 500, { error: 'Server ARK_API_KEY is not configured' });
    return;
  }

  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const ocrText = (req.body?.ocrText || '').trim();
    if (!ocrText) {
      sendJson(res, 400, { error: 'ocrText is required' });
      return;
    }

    const markdown = await callDoubao(ocrText);
    sendJson(res, 200, { markdown });
  } catch (error) {
    sendJson(res, 500, { error: error?.message || 'Internal Server Error' });
  }
};

