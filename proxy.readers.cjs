// Development only. Production keeps its own same-origin API and WebSocket.
const target = process.env.LIBRETORIO_DEV_BACKEND || 'https://libretorio.rji-services.org';
const origin = new URL(target).origin;
if (!origin.startsWith('https://')) throw new Error('The readers backend must use HTTPS.');
const options = {
  target, secure: true, changeOrigin: true, cookieDomainRewrite: '',
  headers: {origin},
  configure(proxy) {
    proxy.on('proxyReqWs', request => request.setHeader('Origin', origin));
  }
};
module.exports = {
  '^/(api|books|cache|covers|temp_covers|home)(/|$)': {
    ...options,
    bypass(req, res) {
      const readingWrite =
        (req.method === 'POST' && /^\/api\/reading\/items\/[1-9]\d*\/visit$/.test(req.url)) ||
        (req.method === 'PUT' && /^\/api\/reading\/items\/[1-9]\d*\/progress\/(pdf|converted-pdf|epub|audio|comic)$/.test(req.url)) ||
        (req.method === 'PATCH' && req.url === '/api/reading/preferences');
      if (!['GET', 'HEAD'].includes(req.method) &&
        !readingWrite &&
        !(req.method === 'POST' && /^\/api\/(login|logout|session\/activity)$/.test(req.url))) {
        res.writeHead(403, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'This development proxy blocks HTTP writes.'}));
        return false;
      }
    }
  },
  '^/$': {
    ...options, ws: true,
    bypass(req) { if (req.headers.upgrade?.toLowerCase() !== 'websocket') return '/index.html'; }
  }
};
