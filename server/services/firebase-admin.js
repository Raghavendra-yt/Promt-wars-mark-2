'use strict';

/**
 * SmartStadium AI — Firebase Admin Service
 * Wraps firebase-admin with type-safe, validated methods.
 * Uses Application Default Credentials (no hardcoded keys).
 */

const admin = require('firebase-admin');
const { ZONE_CAPACITY } = require('../utils/crowd');

// Initialise only once (idempotent)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    storageBucket: process.env.STORAGE_BUCKET,
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ── Collection references ──────────────────────────────────────────────────
const zonesCol = () => db.collection('zones');
const checkInsCol = () => db.collection('checkIns');
const gatesCol = () => db.collection('gates');
const logsCol = () => db.collection('auditLogs');

/**
 * Read crowd data for a specific zone.
 * @param {string} zoneId
 * @returns {Promise<Object|null>}
 */
async function getZoneData(zoneId) {
  const snap = await zonesCol().doc(zoneId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Update occupancy count for a zone (validates against known zones).
 * @param {string} zoneId
 * @param {number} count
 * @returns {Promise<void>}
 */
async function updateZoneCount(zoneId, count) {
  if (!ZONE_CAPACITY[zoneId]) throw new Error(`Unknown zone: ${zoneId}`);
  if (count < 0) throw new Error('Count cannot be negative');
  const density = Math.min(100, Math.round((count / ZONE_CAPACITY[zoneId]) * 100));
  await zonesCol().doc(zoneId).set(
    { count, density, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * Batch-update multiple zones atomically.
 * @param {Array<{zoneId: string, count: number}>} updates
 */
async function batchUpdateZones(updates) {
  if (!updates || updates.length === 0) throw new Error('Batch must contain at least one update');
  const batch = db.batch();
  for (const { zoneId, count } of updates) {
    if (!ZONE_CAPACITY[zoneId]) throw new Error(`Unknown zone: ${zoneId}`);
    const density = Math.min(100, Math.round((count / ZONE_CAPACITY[zoneId]) * 100));
    batch.set(
      zonesCol().doc(zoneId),
      { count, density, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  await batch.commit();
}

/**
 * Log a fan check-in event to Firestore.
 * @param {{userId: string, zoneId: string, seatNumber: string, timestamp: number}} data
 * @returns {Promise<{id: string}>}
 */
async function logCheckIn(data) {
  if (!data.userId) throw new Error('userId is required for check-in');
  if (!data.zoneId) throw new Error('zoneId is required for check-in');
  const ref = await checkInsCol().add({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

/**
 * Subscribe to real-time updates for a zone.
 * @param {string} zoneId
 * @param {(data: Object) => void} callback
 * @returns {() => void} Unsubscribe function
 */
function onZoneSnapshot(zoneId, callback) {
  return zonesCol().doc(zoneId).onSnapshot((snap) => {
    if (snap.exists) callback({ id: snap.id, ...snap.data() });
  });
}

/**
 * Verify a Firebase ID token and return the decoded claims.
 * @param {string} token
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
async function verifyToken(token) {
  return admin.auth().verifyIdToken(token);
}

/**
 * Get all zones in paginated batches.
 * @param {number} [pageSize=20]
 * @returns {Promise<Object[]>}
 */
async function getAllZones(pageSize = 20) {
  const snap = await zonesCol().limit(pageSize).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get all gate statuses.
 * @returns {Promise<Object[]>}
 */
async function getAllGates() {
  const snap = await gatesCol().get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  db,
  admin,
  getZoneData,
  updateZoneCount,
  batchUpdateZones,
  logCheckIn,
  onZoneSnapshot,
  verifyToken,
  getAllZones,
  getAllGates,
};
