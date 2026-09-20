const http = require('http');

const PORT = process.env.PORT || 5002;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'mock-ai' }));
    return;
  }

  // Mock Speech-to-Text
  if (url.pathname === '/v1/audio/transcriptions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        text: 'สวัสดีครับ ต้องการสอบถามเกี่ยวกับสถานะใบสั่งซื้อหมายเลข PO-12345 ครับ',
        language: 'th',
        duration: 12.5,
      }),
    );
    return;
  }

  // Mock Chat / LLM
  if (url.pathname === '/v1/chat/completions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'mock-chatcmpl-001',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                summary: 'ลูกค้าติดต่อสอบถามสถานะใบสั่งซื้อสินค้า',
                intent: 'order_inquiry',
                sentiment: 'positive',
                sentiment_score: 0.85,
                keywords: ['สถานะใบสั่งซื้อ', 'PO-12345'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    return;
  }

  // Mock Embeddings
  if (url.pathname === '/v1/embeddings') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        data: [{ embedding: Array(1536).fill(0.01), index: 0 }],
        model: 'mock-embedding-v1',
      }),
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'vCRM Mock AI Service', path: url.pathname }));
});

server.listen(PORT, () => {
  console.log(`[mock-ai] listening on port ${PORT}`);
});
