const http = require('http');
const htproxy = require('http-proxy');

const port = parseInt(process.env.PORT, 10);

const upstreamHost = process.env.UPSTREAM_HOST;
const upstreamPort = parseInt(process.env.UPSTREAM_PORT, 10);
const upstreamSize = parseInt(process.env.UPSTREAM_SIZE, 10);

const addresses = [];
for (let i = 0; i < upstreamSize; i++) {
  addresses.push({
    host: upstreamHost,
    port: upstreamPort + i,
    protocol: 'http',
  });
}

// Proxy
const proxy = htproxy.createProxyServer();

// Hanle Error
proxy.on('proxyError', (err, req, res) => {
  console.error('Proxy Error: ', err);
  res.writeHead(500);
  res.write('Upstream Proxy Error');
  res.end();
});

// Main HTTP Server
http.createServer((req, res) => {
  const target = addresses.shift();

  proxy.web(req, res, { target });
  proxy.on('error', () => {});

  addresses.push(target);
}).listen(port);
