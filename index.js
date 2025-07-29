
const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the current directory
app.use(express.static('./', {
  setHeaders: (res, path) => {
    // Set proper MIME types for PWA files
    if (path.endsWith('.webmanifest') || path.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Serve index.html for all routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚛 Trucker Expense Tracker PWA running on port ${PORT}`);
  console.log(`✅ Server ready at http://0.0.0.0:${PORT}`);
});
