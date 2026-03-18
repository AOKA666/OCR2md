const http = require('node:http');

const PORT = Number(process.env.PORT || 8787);
const ARK_API_KEY = (process.env.ARK_API_KEY || '').trim();
const BACKEND_TOKEN = (process.env.BACKEND_TOKEN || '').trim();
const MODEL = process.env.ARK_MODEL || 'doubao-seed-1-6-flash-250828';

const DOUBAO_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const PROMPT = `Convert the following OCR text into a clean, well-structured Markdown document.

Requirements:
- preserve headings
- detect ordered and unordered lists
- convert tables when obvious
- format code blocks if present
- clean up obvious OCR errors
- keep the original text flow when structure is unclear
- output only the final Markdown content
- do not add any explanation, introduction, conclusion, or notes
- do not wrap the output in code fences`;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 2 * 1024 * 1024) {
      throw new Error('Request body is too large');
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
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
          content: 'You convert OCR text to Markdown and must return only final Markdown content with no explanations.'
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url !== '/api/markdown' || req.method !== 'POST') {
      sendJson(res, 404, { error: 'Not Found' });
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

    const body = await readJsonBody(req);
    const ocrText = (body?.ocrText || '').trim();
    if (!ocrText) {
      sendJson(res, 400, { error: 'ocrText is required' });
      return;
    }

    const markdown = await callDoubao(ocrText);
    sendJson(res, 200, { markdown });
  } catch (error) {
    sendJson(res, 500, { error: error?.message || 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`[ocr2md-backend] listening on http://127.0.0.1:${PORT}`);
});
