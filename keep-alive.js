// Keep-alive system for free hosting platforms
const http = require('http');
const fs = require('fs');

// Create a simple web server to prevent the bot from sleeping
function createKeepAliveServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    const stats = {
      status: 'Bot is running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      version: process.version
    };
    
    res.end(JSON.stringify(stats, null, 2));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`🌐 Keep-alive server running on port ${port}`);
  });
  
  return server;
}

// Ping function for external monitoring services
function setupExternalPing() {
  const pingUrl = process.env.PING_URL;
  
  if (pingUrl) {
    setInterval(() => {
      http.get(pingUrl, (res) => {
        console.log(`📡 Pinged: ${res.statusCode}`);
      }).on('error', (err) => {
        console.log(`❌ Ping failed: ${err.message}`);
      });
    }, 5 * 60 * 1000); // Ping every 5 minutes
  }
}

module.exports = {
  createKeepAliveServer,
  setupExternalPing
};