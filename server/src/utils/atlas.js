const crypto = require('crypto');
const axios = require('axios');

/**
 * Helper to call the MongoDB Atlas Administration API using HTTP Digest Authentication.
 * Handles the 401 challenge and response generation.
 */
async function callAtlasAPI(method, urlPath, body = null) {
  const publicKey = process.env.ATLAS_PUBLIC_KEY;
  const privateKey = process.env.ATLAS_PRIVATE_KEY;
  const projectId = process.env.ATLAS_PROJECT_ID;

  if (!publicKey || !privateKey || !projectId) {
    throw new Error('Atlas API configuration missing. Make sure ATLAS_PUBLIC_KEY, ATLAS_PRIVATE_KEY, and ATLAS_PROJECT_ID are set.');
  }

  const url = `https://cloud.mongodb.com/api/atlas/v1.5/groups/${projectId}${urlPath}`;

  try {
    // 1. Send an unauthenticated request to trigger the Digest Auth challenge
    await axios({
      method,
      url,
      data: body,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // We expect a 401 Unauthorized with the WWW-Authenticate header
    if (error.response && error.response.status === 401) {
      const authHeader = error.response.headers['www-authenticate'];
      if (!authHeader) {
        throw new Error('Atlas API returned 401 but no WWW-Authenticate header was found.');
      }

      // Parse the digest authentication parameters from the header
      const params = {};
      const regex = /(\w+)="?([^",]+)"?/g;
      let match;
      while ((match = regex.exec(authHeader)) !== null) {
        params[match[1]] = match[2];
      }

      const { realm, nonce, qop, opaque } = params;
      if (!realm || !nonce) {
        throw new Error(`Invalid WWW-Authenticate header received: ${authHeader}`);
      }

      const cnonce = crypto.randomBytes(8).toString('hex');
      const nc = '00000001';
      const digestUri = `/api/atlas/v1.5/groups/${projectId}${urlPath}`;

      // Digest calculations:
      // HA1 = md5(username:realm:password)
      const ha1 = crypto.createHash('md5')
        .update(`${publicKey}:${realm}:${privateKey}`)
        .digest('hex');

      // HA2 = md5(method:uri)
      const ha2 = crypto.createHash('md5')
        .update(`${method}:${digestUri}`)
        .digest('hex');

      // response = md5(HA1:nonce:nc:cnonce:qop:HA2)
      const response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        .digest('hex');

      // Construct the Authorization header
      const digestHeader = `Digest username="${publicKey}", realm="${realm}", nonce="${nonce}", uri="${digestUri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}", opaque="${opaque}"`;

      // 2. Retry the request with the compiled Digest Authorization header
      const responsePayload = await axios({
        method,
        url,
        data: body,
        headers: {
          'Authorization': digestHeader,
          'Content-Type': 'application/json'
        }
      });

      return responsePayload.data;
    }

    throw error;
  }
}

/**
 * Creates a restricted database user inside the Atlas Project.
 * The user has readWrite access strictly limited to the specified sandbox database.
 */
async function createAtlasDatabaseUser(username, password, databaseName) {
  const urlPath = '/databaseUsers';
  const body = {
    databaseName: 'admin',
    username,
    password,
    roles: [
      {
        roleName: 'readWrite',
        databaseName: databaseName
      }
    ]
  };

  try {
    const data = await callAtlasAPI('POST', urlPath, body);
    return data;
  } catch (error) {
    // If the database user already exists, Atlas returns a 409 Conflict.
    // We can catch and ignore this to make the operation idempotent.
    if (error.response && error.response.status === 409) {
      console.log(`Database user ${username} already exists on Atlas. Skipping creation.`);
      return null;
    }
    console.error('Error creating database user on Atlas:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  createAtlasDatabaseUser
};
