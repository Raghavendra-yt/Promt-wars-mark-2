'use strict';

const express = require('express');
const router = express.Router();

/**
 * GET /api/health
 * Returns status of the server and all connected Google services.
 */
router.get('/', async (req, res) => {
  const services = {};

  // Firebase
  try {
    const { db } = require('../services/firebase-admin');
    await db.collection('_health').limit(1).get();
    services.firebase = 'ok';
  } catch {
    services.firebase = 'degraded';
  }

  // Gemini
  services.gemini = process.env.GEMINI_API_KEY ? 'configured' : 'not-configured';

  // BigQuery
  services.bigquery = process.env.GOOGLE_CLOUD_PROJECT ? 'configured' : 'not-configured';

  // Pub/Sub
  services.pubsub = process.env.GOOGLE_CLOUD_PROJECT ? 'configured' : 'not-configured';

  // Maps
  services.maps = process.env.GOOGLE_MAPS_API_KEY ? 'configured' : 'not-configured';

  const allOk = Object.values(services).every((s) => s === 'ok' || s === 'configured');

  res.status(allOk ? 200 : 207).json({
    status: allOk ? 'healthy' : 'degraded',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services,
    uptime: Math.floor(process.uptime()),
  });
});

module.exports = router;
