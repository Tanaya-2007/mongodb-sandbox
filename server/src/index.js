require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const connectDB = require('./config/db');
const SandboxAssignment = require('./models/SandboxAssignment');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to management database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MongoDB Sandbox Provisioner API is running',
    version: '1.0.0'
  });
});

// Endpoint to request/retrieve a sandbox assignment
app.post('/api/sandbox', async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId in request body'
      });
    }

    // Check if device already has a database assignment
    let assignment = await SandboxAssignment.findOne({ deviceId });

    if (!assignment) {
      // Generate a unique 8-character hex suffix for the database name
      const suffix = crypto.randomBytes(4).toString('hex');
      const databaseName = `sandbox_dev_${suffix}`;

      // Create new assignment in the database
      assignment = await SandboxAssignment.create({
        deviceId,
        databaseName
      });
    }

    // Build the connection string using the base MONGODB_ATLAS_URI env var
    const mongodbUri = buildConnectionString(process.env.MONGODB_ATLAS_URI, assignment.databaseName);

    return res.json({
      success: true,
      deviceId: assignment.deviceId,
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

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
