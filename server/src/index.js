require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const SandboxAssignment = require('./models/SandboxAssignment');
const { createAtlasDatabaseUser } = require('./utils/atlas');

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

      let dbUsername = 'local_dev';
      let dbPassword = 'local_password';

      const hasSandboxCreds = process.env.SANDBOX_DB_USER && process.env.SANDBOX_DB_PASSWORD;
      const hasAtlasKeys = process.env.ATLAS_PUBLIC_KEY && process.env.ATLAS_PRIVATE_KEY && process.env.ATLAS_PROJECT_ID;

      if (hasSandboxCreds) {
        // Option A: Use the pre-created static sandbox developer user (No Atlas API calls needed)
        dbUsername = process.env.SANDBOX_DB_USER;
        dbPassword = process.env.SANDBOX_DB_PASSWORD;
      } else if (hasAtlasKeys) {
        // Mode B: Create a dynamic user per database using Atlas Admin API
        dbUsername = `user_${suffix}`;
        dbPassword = crypto.randomBytes(8).toString('hex');
        await createAtlasDatabaseUser(dbUsername, dbPassword, databaseName);
      } else {
        console.warn('⚠️ WARNING: Static Sandbox Credentials or Atlas API keys are not configured. Running in Local Development Fallback mode.');
        
        // In production, we must have either static credentials or Atlas API keys
        if (process.env.NODE_ENV === 'production') {
          return res.status(500).json({
            success: false,
            error: 'Database credentials (SANDBOX_DB_USER/PASSWORD) or Atlas API keys must be configured in production mode'
          });
        }

        // For local development, fallback to the credentials already in MONGODB_ATLAS_URI if present
        try {
          if (process.env.MONGODB_ATLAS_URI.includes('@')) {
            const authPart = process.env.MONGODB_ATLAS_URI.split('://')[1].split('@')[0];
            if (authPart.includes(':')) {
              dbUsername = authPart.split(':')[0];
              dbPassword = authPart.split(':')[1];
            } else {
              dbUsername = authPart;
              dbPassword = '';
            }
          }
        } catch (e) {
          // Fallback stays as local_dev
        }
      }

      // Create new assignment in the database
      assignment = await SandboxAssignment.create({
        deviceId,
        projectKey,
        databaseName,
        dbUsername,
        dbPassword
      });
    }

    // Build the connection string using the assignment credentials
    let mongodbUri;
    const baseUri = process.env.MONGODB_ATLAS_URI;
    if (baseUri.includes('@')) {
      const hostAndDb = baseUri.split('@')[1];
      const cleanHost = hostAndDb.split('/')[0];
      const isSrv = baseUri.startsWith('mongodb+srv://');
      const scheme = isSrv ? 'mongodb+srv' : 'mongodb';
      mongodbUri = `${scheme}://${assignment.dbUsername}:${assignment.dbPassword}@${cleanHost}/${assignment.databaseName}?retryWrites=true&w=majority`;
    } else {
      // Local fallback without auth
      const isSrv = baseUri.startsWith('mongodb+srv://');
      const scheme = isSrv ? 'mongodb+srv' : 'mongodb';
      const cleanHost = baseUri.replace('mongodb://', '').replace('mongodb+srv://', '').split('/')[0];
      mongodbUri = `${scheme}://${cleanHost}/${assignment.databaseName}`;
    }

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

/**
 * Middleware to validate the database name parameter.
 * Prevents calling MongoDB with invalid namespaces (like literal ':databaseName').
 */
function validateDatabaseName(req, res, next) {
  const { databaseName } = req.params;
  if (!databaseName || !databaseName.startsWith('sandbox_dev_')) {
    // If the browser requested an HTML page, serve a beautiful help page
    if (req.accepts('html')) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Sandbox Namespace</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Outfit', sans-serif;
              background-color: #0b0f19;
              color: #f3f4f6;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              background-color: #151c2c;
              border: 1px solid #24324f;
              padding: 40px;
              border-radius: 16px;
              max-width: 500px;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            h1 {
              color: #f28b82;
              font-size: 1.8rem;
              margin-bottom: 16px;
            }
            p {
              color: #9ca3af;
              line-height: 1.6;
              margin-bottom: 24px;
            }
            .code-block {
              background-color: #0f1422;
              border: 1px solid #24324f;
              padding: 12px;
              border-radius: 8px;
              font-family: monospace;
              color: #60a5fa;
              font-size: 0.95rem;
              margin-bottom: 24px;
            }
            .footer {
              font-size: 0.85rem;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Oops! Invalid Sandbox Link</h1>
            <p>You accessed a template or malformed link. To view your database visualizer, you must run <code>mongo-sandbox</code> in your project terminal and use the specific URL generated for your directory.</p>
            <div class="code-block">http://localhost:5000/sandbox/sandbox_dev_xxxxxx</div>
            <div class="footer">MongoDB Sandbox Provisioner Utility</div>
          </div>
        </body>
        </html>
      `);
    }

    // Fallback for API/JSON calls
    return res.status(400).json({
      success: false,
      error: 'Invalid sandbox database name format. Must start with sandbox_dev_'
    });
  }
  next();
}

// Route: Web Database Visualizer UI Page
app.get('/sandbox/:databaseName', validateDatabaseName, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/visualizer.html'));
});

// API: List all collections in a sandbox database
app.get('/api/sandbox/:databaseName/collections', validateDatabaseName, async (req, res) => {
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
app.get('/api/sandbox/:databaseName/collections/:collectionName', validateDatabaseName, async (req, res) => {
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

// API: Delete a specific document from a selected collection
app.delete('/api/sandbox/:databaseName/collections/:collectionName/:id', validateDatabaseName, async (req, res) => {
  try {
    const { databaseName, collectionName, id } = req.params;
    const conn = getDatabaseConnection(databaseName);

    await new Promise((resolve, reject) => {
      if (conn.readyState === 1) resolve();
      else {
        conn.once('open', resolve);
        conn.once('error', reject);
      }
    });

    // Parse the id: use Mongoose ObjectId if valid 24-character hex string, otherwise fallback to standard string
    let queryId = id;
    if (mongoose.Types.ObjectId.isValid(id)) {
      queryId = new mongoose.Types.ObjectId(id);
    }

    const result = await conn.db
      .collection(collectionName)
      .deleteOne({ _id: queryId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error(`Error deleting document ${id} from ${databaseName}/${collectionName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document'
    });
  }
});

// API: Delete all documents (clear) in a selected collection
app.delete('/api/sandbox/:databaseName/collections/:collectionName', validateDatabaseName, async (req, res) => {
  try {
    const { databaseName, collectionName } = req.params;
    const conn = getDatabaseConnection(databaseName);

    await new Promise((resolve, reject) => {
      if (conn.readyState === 1) resolve();
      else {
        conn.once('open', resolve);
        conn.once('error', reject);
      }
    });

    const result = await conn.db
      .collection(collectionName)
      .deleteMany({});

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} documents successfully`
    });
  } catch (error) {
    console.error(`Error clearing collection ${collectionName} in ${databaseName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear collection'
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Sandbox Visualizer active at http://localhost:${PORT}/sandbox/:databaseName`);
});
