
const express = require('express');
const path = require('path');
const app = express();

// Parse JSON bodies
app.use(express.json());

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

// API routes - handle these BEFORE the catch-all
app.use('/api', async (req, res, next) => {
  const apiPath = req.path.slice(1); // Remove leading slash
  const apiFile = path.join(__dirname, 'api', `${apiPath}.js`);
  
  try {
    // Dynamically import the API handler
    const handler = await import(apiFile);
    if (handler.default) {
      await handler.default(req, res);
    } else {
      res.status(404).json({ success: false, message: 'API endpoint not found' });
    }
  } catch (error) {
    console.error(`API Error for ${apiPath}:`, error);
    res.status(404).json({ success: false, message: 'API endpoint not found' });
  }
});

// Serve index.html for all non-API routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚛 Trucker Expense Tracker PWA running on port ${PORT}`);
  console.log(`✅ Server ready at http://0.0.0.0:${PORT}`);
});
