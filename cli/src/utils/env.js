import fs from 'fs/promises';
import path from 'path';

/**
 * Updates or creates the local .env file in the current working directory.
 * It replaces or appends the MONGODB_URI variable with the new connection string.
 * @param {string} mongodbUri The connection string returned from the API server.
 * @returns {Promise<void>}
 */
export async function updateEnvFile(mongodbUri, visualizerUrl) {
  const envPath = path.join(process.cwd(), '.env');
  const envLine = `MONGODB_URI=${mongodbUri}`;
  const commentLine = visualizerUrl ? `# MongoDB Sandbox Visualizer: ${visualizerUrl}` : null;
  
  try {
    // Check if the .env file already exists
    await fs.access(envPath);
    
    // Read the current file content
    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    
    let keyFound = false;
    const updatedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip any old visualizer comment line so we do not duplicate it
      if (commentLine && line.trim().startsWith('# MongoDB Sandbox Visualizer:')) {
        continue;
      }
      
      if (line.trim().startsWith('MONGODB_URI=')) {
        keyFound = true;
        if (commentLine) {
          updatedLines.push(commentLine);
        }
        updatedLines.push(envLine);
      } else {
        updatedLines.push(line);
      }
    }
    
    // If the key wasn't in the file, append it to the end
    if (!keyFound) {
      // Add an empty line before if the last line isn't empty, to keep it clean
      if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
        updatedLines.push('');
      }
      if (commentLine) {
        updatedLines.push(commentLine);
      }
      updatedLines.push(envLine);
    }
    
    // Write back the updated file contents
    await fs.writeFile(envPath, updatedLines.join('\n'), 'utf8');
  } catch (error) {
    // The .env file doesn't exist, create it
    const newContent = commentLine ? `${commentLine}\nMONGODB_URI=${mongodbUri}\n` : `MONGODB_URI=${mongodbUri}\n`;
    await fs.writeFile(envPath, newContent, 'utf8');
  }
}
