'use strict';

/**
 * SmartStadium AI — Main Express Server
 * Configures all middleware, routes, WebSocket, and starts the HTTP server.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { createApiLimiter } = require('./middleware/rateLimit');
const { logger } = require('./utils/logger');
const crowdRoutes = require('./routes/crowd');
const geminiRoutes = require('./routes/gemini');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const { startSimulator } = require('./simulator');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ── WebSocket broadcast ────────────────────────────────────────────────────
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => logger.warn('WS error', { error: err.message }));
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch {}
    }
  });
}
app.locals.broadcast = broadcast;

// ── Trust Cloud Run proxy ──────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Security: Helmet + CSP ────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", "'unsafe-inline'",
          'https://maps.googleapis.com',
          'https://www.gstatic.com',
          'https://www.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://*.firebaseio.com',
          'https://www.googletagmanager.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: [
          "'self'", 'wss:', 'ws:',
          'https://generativelanguage.googleapis.com',
          'https://*.firebaseio.com',
          'https://*.googleapis.com',
          'https://maps.googleapis.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  })
);

// ── General middleware ─────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(morgan('combined'));

// ── Rate limiting ─────────────────────────────────────────────────────────
app.use('/api/', createApiLimiter());

// ── Static files ──────────────────────────────────────────────────────────
app.use('/app', express.static(path.join(__dirname, '../public/app')));
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// Root redirect
app.get('/', (req, res) => res.redirect('/app'));

// ── API routes ────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/crowd', crowdRoutes);
app.use('/api/gemini', geminiRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ──────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
if (require.main === module) {
  server.listen(PORT, () => {
    logger.info(`SmartStadium AI v2.0 running on port ${PORT}`);
    startSimulator(broadcast);
  });
}

module.exports = { app, server };
