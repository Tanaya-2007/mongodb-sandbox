import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const CONFIG_FILENAME = '.mongo-sandbox-config.json';
const configPath = path.join(os.homedir(), CONFIG_FILENAME);

/**
 * Reads or generates a persistent device UUID stored in the user's home directory.
 * @returns {Promise<string>} The persistent deviceId.
 */
export async function getOrCreateDeviceId() {
  try {
    // Check if the config file already exists
    await fs.access(configPath);
    
    // Read and parse the config file
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    
    if (config.deviceId) {
      return config.deviceId;
    }
  } catch (error) {
    // File doesn't exist or is invalid JSON; we will generate a new one below
  }

  // Generate a new unique UUID for this device
  const deviceId = crypto.randomUUID();
  
  // Save it to the user's home directory config file
  const configData = { deviceId };
  await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
  
  return deviceId;
}
