require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const SandboxAssignment = require('./models/SandboxAssignment');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to management database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Connection cache map: dbName -> Mongoose Connection Object
const connectionCache = {};

/**
 * Robust helper to inject the database name into the MongoDB URI.
 * Handles both URL class parsing and manual string manipulation fallback.
 */
function buildConnectionString(baseUri, dbName) {
  if (!baseUri) {
    throw new Error('MONGODB_ATLAS_URI is not defined');
  }
  try {
    const url = new URL(baseUri);
    url.pathname = '/' + dbName;
    return url.toString();
  } catch (err) {
    // Fallback if URL parsing fails (e.g. invalid scheme format)
    const queryIndex = baseUri.indexOf('?');
    if (queryIndex !== -1) {
      const beforeQuery = baseUri.substring(0, queryIndex);
      const afterQuery = baseUri.substring(queryIndex);
      const separator = beforeQuery.endsWith('/') ? '' : '/';
      return `${beforeQuery}${separator}${dbName}${afterQuery}`;
    } else {
      const separator = baseUri.endsWith('/') ? '' : '/';
      return `${baseUri}${separator}${dbName}`;
    }
  }
}

/**
 * Returns a cached Mongoose connection for a specific database sandbox,
 * creating it if it doesn't already exist or has closed.
 */
function getDatabaseConnection(dbName) {
  if (connectionCache[dbName] && connectionCache[dbName].readyState === 1) {
    return connectionCache[dbName];
  }
  
  const baseUri = process.env.MONGODB_ATLAS_URI;
  const connectionString = buildConnectionString(baseUri, dbName);
  
  // Establish an isolated connection to the specific sandbox database
  const conn = mongoose.createConnection(connectionString);
  connectionCache[dbName] = conn;
  return conn;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MongoDB Sandbox Provisioner API is running',
    version: '1.1.0'
  });
});

// Endpoint to request/retrieve a sandbox assignment
app.post('/api/sandbox', async (req, res) => {
  try {
    const { deviceId, projectKey } = req.body;

    if (!deviceId || !projectKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId or projectKey in request body'
      });
    }

    // Check if device already has a database assignment for this specific project
    let assignment = await SandboxAssignment.findOne({ deviceId, projectKey });

    if (!assignment) {
      // Generate a unique 8-character hex suffix for the database name
      const suffix = crypto.randomBytes(4).toString('hex');
      const databaseName = `sandbox_dev_${suffix}`;

      // Create new assignment in the database
      assignment = await SandboxAssignment.create({
        deviceId,
        projectKey,
        databaseName
      });
    }

    // Build the connection string using the base MONGODB_ATLAS_URI env var
    const mongodbUri = buildConnectionString(process.env.MONGODB_ATLAS_URI, assignment.databaseName);

    return res.json({
      success: true,
      deviceId: assignment.deviceId,
      projectKey: assignment.projectKey,
      databaseName: assignment.databaseName,
      mongodbUri
    });
  } catch (error) {
    console.error('Error provisioning sandbox:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error occurred while provisioning sandbox database'
    });
  }
});

// Route: Web Database Visualizer UI Page
app.get('/sandbox/:databaseName', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/visualizer.html'));
});

// API: List all collections in a sandbox database
app.get('/api/sandbox/:databaseName/collections', async (req, res) => {
  try {
    const { databaseName } = req.params;
    const conn = getDatabaseConnection(databaseName);

    // Wait for Mongoose to establish the connection
    await new Promise((resolve, reject) => {
      if (conn.readyState === 1) resolve();
      else {
        conn.once('open', resolve);
        conn.once('error', reject);
      }
    });

    const collections = await conn.db.listCollections().toArray();
    const names = collections
      .map(col => col.name)
      .filter(name => !name.startsWith('system.')); // Filter out system collections

    res.json({
      success: true,
      collections: names
    });
  } catch (error) {
    console.error(`Error listing collections for ${req.params.databaseName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve collections'
    });
  }
});

// API: List all documents in a selected collection
app.get('/api/sandbox/:databaseName/collections/:collectionName', async (req, res) => {
  try {
    const { databaseName, collectionName } = req.params;
    const conn = getDatabaseConnection(databaseName);

    // Wait for connection readiness
    await new Promise((resolve, reject) => {
      if (conn.readyState === 1) resolve();
      else {
        conn.once('open', resolve);
        conn.once('error', reject);
      }
    });

    const documents = await conn.db
      .collection(collectionName)
      .find({})
      .limit(50) // Limit to top 50 documents to prevent payload bloat
      .toArray();

    res.json({
      success: true,
      documents
    });
  } catch (error) {
    console.error(`Error fetching documents for ${databaseName}/${collectionName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve documents'
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
