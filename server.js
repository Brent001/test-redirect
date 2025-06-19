const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DENO_BACKEND_URL = process.env.DENO_BACKEND_URL || 'https://your-deno-app.deno.dev';

// CORS configuration - allow all origins for M3U8 requests
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    denoBackend: DENO_BACKEND_URL 
  });
});

// Proxy endpoint for M3U8 playlist parsing (matches your Deno backend)
app.get('/m3u8-proxy', async (req, res) => {
  try {
    const { url, headers } = req.query;
    
    if (!url) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'URL parameter is required'
      });
    }
    
    console.log(`Requesting M3U8 proxy from Deno backend for URL: ${url}`);
    
    // Forward request to your existing Deno m3u8-proxy endpoint
    const response = await axios.get(`${DENO_BACKEND_URL}/m3u8-proxy`, {
      params: {
        url: url,
        headers: headers || '{}' // Default to empty headers if not provided
      },
      headers: {
        'User-Agent': req.get('User-Agent') || 'Railway-Proxy/1.0',
        'Accept': req.get('Accept') || 'application/vnd.apple.mpegurl',
        'Accept-Language': req.get('Accept-Language') || 'en-US,en;q=0.9',
        'X-Forwarded-For': req.ip,
        'X-Real-IP': req.ip,
        'X-Railway-Proxy': 'true'
      },
      timeout: 45000,
      maxRedirects: 5
    });

    // Set appropriate headers for M3U8 content
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Return the parsed M3U8 playlist from Deno
    res.send(response.data);
    
  } catch (error) {
    console.error('M3U8 proxy error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'M3U8 proxy failed',
        status: error.response.status,
        message: error.response.statusText || 'Failed to proxy M3U8 request',
        url: req.query.url
      });
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({
        error: 'Request timeout',
        message: 'M3U8 proxy request timed out'
      });
    } else {
      res.status(500).json({
        error: 'M3U8 proxy error',
        message: error.message
      });
    }
  }
});

// Proxy endpoint for TS segments and media files
app.get('/segment', async (req, res) => {
  try {
    const { url, headers } = req.query;
    
    if (!url) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'URL parameter is required'
      });
    }
    
    console.log(`Requesting TS segment from Deno backend: ${url}`);
    
    // Forward segment request to Deno backend (assume it has a segment endpoint)
    const response = await axios.get(`${DENO_BACKEND_URL}/segment`, {
      params: {
        url: url,
        headers: headers || '{}'
      },
      headers: {
        'User-Agent': req.get('User-Agent') || 'Railway-Proxy/1.0',
        'Accept': req.get('Accept') || '*/*',
        'Accept-Encoding': req.get('Accept-Encoding') || 'identity',
        'Range': req.get('Range'),
        'X-Forwarded-For': req.ip,
        'X-Real-IP': req.ip,
        'X-Railway-Proxy': 'true'
      },
      timeout: 60000,
      responseType: 'stream',
      maxRedirects: 5
    });

    // Forward response headers
    const contentType = response.headers['content-type'] || 'video/mp2t';
    const contentLength = response.headers['content-length'];
    const acceptRanges = response.headers['accept-ranges'];
    const contentRange = response.headers['content-range'];
    
    const responseHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Cache-Control': 'public, max-age=3600'
    };

    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    res.set(responseHeaders);
    res.status(response.status);

    // Stream the TS segment
    response.data.pipe(res);
    
  } catch (error) {
    console.error('Segment proxy error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Segment request failed',
        status: error.response.status,
        message: error.response.statusText || 'Failed to fetch segment',
        url: req.query.url
      });
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({
        error: 'Segment timeout',
        message: 'Segment request timed out'
      });
    } else {
      res.status(500).json({
        error: 'Segment proxy error',
        message: error.message
      });
    }
  }
});

// Generic proxy endpoint for other media requests
app.get('/proxy/*', async (req, res) => {
  try {
    const targetUrl = req.params[0];
    const queryParams = req.query;
    
    console.log(`Generic proxy request to Deno backend: ${targetUrl}`);
    
    // Forward request to Deno backend
    const response = await axios.get(`${DENO_BACKEND_URL}/proxy`, {
      params: {
        url: targetUrl,
        ...queryParams
      },
      headers: {
        'User-Agent': req.get('User-Agent') || 'Railway-Proxy/1.0',
        'Accept': req.get('Accept') || '*/*',
        'Accept-Language': req.get('Accept-Language') || 'en-US,en;q=0.9',
        'X-Forwarded-For': req.ip,
        'X-Real-IP': req.ip,
        'X-Railway-Proxy': 'true'
      },
      timeout: 30000,
      responseType: 'stream'
    });

    // Set appropriate headers
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    
    res.set({
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': response.headers['cache-control'] || 'no-cache',
      'Content-Length': response.headers['content-length']
    });

    // Stream the response
    response.data.pipe(res);
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Proxy request failed',
        status: error.response.status,
        message: error.response.statusText
      });
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({
        error: 'Request timeout',
        message: 'The request to the backend server timed out'
      });
    } else {
      res.status(500).json({
        error: 'Internal proxy error',
        message: error.message
      });
    }
  }
});

// General proxy endpoint for any path
app.all('/api/*', async (req, res) => {
  try {
    const targetPath = req.params[0];
    const method = req.method.toLowerCase();
    
    console.log(`Proxying ${method.toUpperCase()} request to: ${targetPath}`);
    
    const config = {
      method: method,
      url: `${DENO_BACKEND_URL}/api/${targetPath}`,
      headers: {
        'Content-Type': req.get('Content-Type') || 'application/json',
        'User-Agent': req.get('User-Agent') || 'Railway-Proxy/1.0',
        'Accept': req.get('Accept') || 'application/json',
        'X-Forwarded-For': req.ip,
        'X-Real-IP': req.ip
      },
      timeout: 30000
    };

    // Add request body for POST, PUT, PATCH requests
    if (['post', 'put', 'patch'].includes(method)) {
      config.data = req.body;
    }

    // Add query parameters
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    const response = await axios(config);
    
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error('API proxy error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({
        error: 'Internal proxy error',
        message: error.message
      });
    }
  }
});

// Catch-all proxy for root-level requests
app.all('/*', async (req, res) => {
  try {
    const targetPath = req.params[0] || '';
    const method = req.method.toLowerCase();
    
    // Skip favicon requests
    if (targetPath === 'favicon.ico') {
      return res.status(404).end();
    }
    
    console.log(`Proxying ${method.toUpperCase()} request to root: ${targetPath}`);
    
    const config = {
      method: method,
      url: `${DENO_BACKEND_URL}/${targetPath}`,
      headers: {
        'Content-Type': req.get('Content-Type') || 'application/json',
        'User-Agent': req.get('User-Agent') || 'Railway-Proxy/1.0',
        'Accept': req.get('Accept') || '*/*',
        'X-Forwarded-For': req.ip,
        'X-Real-IP': req.ip
      },
      timeout: 30000
    };

    // Add request body for POST, PUT, PATCH requests
    if (['post', 'put', 'patch'].includes(method)) {
      config.data = req.body;
    }

    // Add query parameters
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    const response = await axios(config);
    
    // Set content type from response
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }
    
    res.status(response.status).send(response.data);
    
  } catch (error) {
    console.error('Root proxy error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res.status(500).json({
        error: 'Internal proxy error',
        message: error.message
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Railway proxy server running on port ${PORT}`);
  console.log(`Proxying requests to: ${DENO_BACKEND_URL}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
});
