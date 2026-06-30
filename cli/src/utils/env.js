import fs from 'fs/promises';
import path from 'path';

/**
 * Updates or creates the local .env file in the current working directory.
 * It replaces or appends the MONGODB_URI variable with the new connection string.
 * @param {string} mongodbUri The connection string returned from the API server.
 * @returns {Promise<void>}
 */
export async function updateEnvFile(mongodbUri) {
  const envPath = path.join(process.cwd(), '.env');
  const envLine = `MONGODB_URI=${mongodbUri}`;
  
  try {
    // Check if the .env file already exists
    await fs.access(envPath);
    
    // Read the current file content
    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    
    let keyFound = false;
    const updatedLines = lines.map(line => {
      // Look for a line that starts with MONGODB_URI= (ignoring whitespace before/after MONGODB_URI)
      if (line.trim().startsWith('MONGODB_URI=')) {
        keyFound = true;
        return envLine;
      }
      return line;
    });
    
    // If the key wasn't in the file, append it to the end
    if (!keyFound) {
      // Add an empty line before if the last line isn't empty, to keep it clean
      if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
        updatedLines.push('');
      }
      updatedLines.push(envLine);
    }
    
    // Write back the updated file contents
    await fs.writeFile(envPath, updatedLines.join('\n'), 'utf8');
  } catch (error) {
    // The .env file doesn't exist, create it with our connection string
    await fs.writeFile(envPath, `${envLine}\n`, 'utf8');
  }
}
