#!/usr/bin/env node

import { program } from 'commander';
import axios from 'axios';
import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import { getOrCreateDeviceId } from '../utils/config.js';
import { updateEnvFile } from '../utils/env.js';

// Default Provisioner Server URL (can be overridden via environment variable)
const DEFAULT_SERVER_URL = process.env.MONGO_SANDBOX_SERVER || 'http://localhost:5000';

program
  .name('mongo-sandbox')
  .description('A developer utility to provision a unique MongoDB sandbox and inject it into local .env files.')
  .version('1.0.0')
  .option('-s, --server <url>', 'Override the provisioner server URL', DEFAULT_SERVER_URL)
  .action(async (options) => {
    console.log(chalk.bold.blue('--- MongoDB Sandbox Provisioner CLI ---'));
    
    const spinner = ora('Initializing connection...').start();
    
    try {
      // 1. Fetch or generate the unique device UUID
      spinner.text = 'Retrieving device credentials...';
      const deviceId = await getOrCreateDeviceId();

      // 2. Contact the Provisioner Server API
      const serverUrl = `${options.server.replace(/\/$/, '')}/api/sandbox`;
      spinner.text = `Contacting provisioner server at ${options.server}...`;
      
      const response = await axios.post(serverUrl, { deviceId }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000 // 8 second timeout
      });

      const { success, databaseName, mongodbUri, error } = response.data;

      if (!success || !mongodbUri) {
        throw new Error(error || 'Failed to retrieve connection string from server');
      }

      // 3. Inject connection string into local .env file
      spinner.text = 'Writing connection string to .env...';
      await updateEnvFile(mongodbUri);

      // 4. Complete successfully
      spinner.succeed(chalk.green('Sandbox database provisioned successfully!'));

      const successBox = boxen(
        [
          chalk.bold.green('MongoDB Sandbox Active!'),
          '',
          `${chalk.bold('Database Name:')}  ${chalk.cyan(databaseName)}`,
          `${chalk.bold('Connection URI:')} ${chalk.gray(mongodbUri)}`,
          '',
          chalk.yellow('MONGODB_URI has been successfully updated in your local .env file.')
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
