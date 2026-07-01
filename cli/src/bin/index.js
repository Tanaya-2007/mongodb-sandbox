#!/usr/bin/env node

import { program } from 'commander';
import axios from 'axios';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getOrCreateDeviceId } from '../utils/config.js';
import { updateEnvFile } from '../utils/env.js';

// Default Provisioner Server URL (can be overridden via environment variable)
const DEFAULT_SERVER_URL = process.env.MONGO_SANDBOX_SERVER || 'http://localhost:5000';

/**
 * Attempts to retrieve a friendly project name from package.json in the current working directory.
 * Falls back to the name of the current directory if package.json is missing or unnamed.
 * @returns {Promise<string>} The project name.
 */
async function getProjectName() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content);
    if (pkg.name) {
      return pkg.name;
    }
  } catch (error) {
    // package.json doesn't exist, has no name, or is invalid JSON
  }
  return path.basename(process.cwd());
}

program
  .name('mongo-sandbox')
  .description('A production-level developer utility to provision multiple unique MongoDB sandboxes per machine.')
  .version('1.2.0')
  .option('-s, --server <url>', 'Override the provisioner server URL', DEFAULT_SERVER_URL)
  .action(async (options) => {
    console.log(chalk.bold.blue('--- MongoDB Sandbox Provisioner CLI (Production Mode) ---'));
    
    const spinner = ora('Initializing connection...').start();
    
    try {
      // 1. Fetch or generate the unique device UUID
      spinner.text = 'Retrieving device credentials...';
      const deviceId = await getOrCreateDeviceId();

      // 2. Compute projectKey (SHA-256 hash of the absolute directory path) and get friendly name
      spinner.text = 'Detecting project environment...';
      const projectPath = process.cwd();
      const projectKey = crypto.createHash('sha256').update(projectPath).digest('hex').substring(0, 16);
      const projectName = await getProjectName();

      // 3. Contact the Provisioner Server API
      const serverUrl = `${options.server.replace(/\/$/, '')}/api/sandbox`;
      spinner.text = `Contacting provisioner server for project [${projectName}]...`;
      
      const response = await axios.post(serverUrl, { 
        deviceId, 
        projectKey 
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000 // 8 second timeout
      });

      const { success, databaseName, mongodbUri, error } = response.data;

      if (!success || !mongodbUri) {
        throw new Error(error || 'Failed to retrieve connection string from server');
      }

      // 4. Inject connection string into local .env file
      spinner.text = 'Writing connection string to .env...';
      await updateEnvFile(mongodbUri);

      // 5. Complete successfully
      spinner.succeed(chalk.green('Sandbox database provisioned successfully!'));

      // Construct live visualizer URL
      const baseUrl = options.server.replace(/\/$/, '');
      const visualizerUrl = `${baseUrl}/sandbox/${databaseName}`;

      const successBox = boxen(
        [
          chalk.bold.green('MongoDB Sandbox Active!'),
          '',
          `${chalk.bold('Project Name:')}   ${chalk.cyan(projectName)}`,
          `${chalk.bold('Project Key:')}    ${chalk.gray(projectKey)}`,
          `${chalk.bold('Database Name:')}  ${chalk.cyan(databaseName)}`,
          `${chalk.bold('Connection URI:')} ${chalk.gray(mongodbUri)}`,
          `${chalk.bold('Visualizer URL:')} ${chalk.underline.blue(visualizerUrl)}`,
          '',
          chalk.yellow('MONGODB_URI has been successfully updated in your local .env file.'),
          '',
          `${chalk.bold.red('⚠️  NOTICE:')} This is a shared development sandbox. Inactive databases`,
          `           (30 days) may be deleted automatically. For production launch,`,
          `           replace this URI with a dedicated MongoDB Atlas instance.`
        ].join('\n'),
        {
          padding: 1,
          margin: { top: 1, bottom: 1 },
          borderStyle: 'round',
          borderColor: 'green',
          title: 'Success',
          titleAlignment: 'center'
        }
      );

      console.log(successBox);
    } catch (err) {
      spinner.fail(chalk.red('Provisioning failed!'));
      
      console.log('\n' + chalk.bold.red('Error Details:'));
      if (err.code === 'ECONNREFUSED') {
        console.log(
          chalk.red(`Could not connect to the provisioner server at ${options.server}.\n` +
          'Please verify that the provisioner server is running (npm run dev) and reachable.')
        );
      } else {
        console.log(chalk.red(err.message || 'An unknown error occurred during setup.'));
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
