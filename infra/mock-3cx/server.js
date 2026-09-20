const http = require('http');

const PORT = process.env.PORT || 5001;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'mock-3cx' }));
    return;
  }

  if (url.pathname.startsWith('/api/v1/telephony/3cx/lookup')) {
    const number = url.searchParams.get('number');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        contactId: 'mock-contact-001',
        name: 'สมชาย ใจดี',
        phone: number,
        url: `http://localhost:3000/contacts/mock-contact-001`,
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/api/v1/telephony/3cx/journal')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, callId: 'mock-call-123' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'vCRM Mock 3CX Service', path: url.pathname }));
});

server.listen(PORT, () => {
  console.log(`[mock-3cx] listening on port ${PORT}`);
});
