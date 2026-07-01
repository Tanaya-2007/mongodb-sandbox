/**
 * Manual test script for the MongoDB Sandbox Provisioner Server (Upgraded to Multi-DB)
 * Run this script after starting the server (e.g. npm run dev)
 */

async function runTests() {
  const baseUrl = 'http://localhost:5000';
  const testDeviceId = `test-device-${Math.random().toString(36).substring(2, 10)}`;
  
  console.log('--- STARTING MONGODB SANDBOX API TESTS (MULTI-DB) ---');
  console.log(`Using generated device ID: ${testDeviceId}\n`);

  // Test 1: Health check
  try {
    console.log('Test 1: Health check GET /');
    const res = await fetch(`${baseUrl}/`);
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    if (res.status === 200 && data.status === 'ok') {
      console.log('✅ Health check passed\n');
    } else {
      console.error('❌ Health check failed\n');
    }
  } catch (error) {
    console.error('❌ Health check error:', error.message, '\n');
  }

  // Test 2: Provision sandbox database for Project A
  let projectADbName = '';
  let projectAUri = '';
  try {
    console.log('Test 2: POST /api/sandbox (Device + Project A)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId, projectKey: 'project-A' }),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 200 && data.success) {
      projectADbName = data.databaseName;
      projectAUri = data.mongodbUri;
      console.log('✅ Project A sandbox provisioned successfully');
      console.log(`   Database: ${projectADbName}\n`);
    } else {
      console.error('❌ Project A sandbox provisioning failed\n');
    }
  } catch (error) {
    console.error('❌ Project A error:', error.message, '\n');
  }

  // Test 3: Provision sandbox database for Project B (Same Device)
  let projectBDbName = '';
  try {
    console.log('Test 3: POST /api/sandbox (Same Device + Project B)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId, projectKey: 'project-B' }),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 200 && data.success) {
      projectBDbName = data.databaseName;
      console.log('✅ Project B sandbox provisioned successfully');
      console.log(`   Database: ${projectBDbName}`);
      
      if (projectBDbName !== projectADbName) {
        console.log('✅ Multi-DB test passed (different database names returned for different projects!)\n');
      } else {
        console.error('❌ Multi-DB test failed (same database name returned!)\n');
      }
    } else {
      console.error('❌ Project B sandbox provisioning failed\n');
    }
  } catch (error) {
    console.error('❌ Project B error:', error.message, '\n');
  }

  // Test 4: Idempotency Check (Fetch sandbox database for Project A again)
  try {
    console.log('Test 4: POST /api/sandbox (Same Device + Project A - Idempotency Check)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId, projectKey: 'project-A' }),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 200 && data.success) {
      if (data.databaseName === projectADbName && data.mongodbUri === projectAUri) {
        console.log('✅ Idempotency test passed (returned same connection details for Project A)\n');
      } else {
        console.error('❌ Idempotency test failed (returned different connection details!)\n');
      }
    } else {
      console.error('❌ Request failed\n');
    }
  } catch (error) {
    console.error('❌ Idempotency error:', error.message, '\n');
  }

  // Test 5: Validation check (Missing projectKey)
  try {
    console.log('Test 5: POST /api/sandbox (Missing projectKey)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId }),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 400 && !data.success) {
      console.log('✅ Validation test passed (correctly returned 400 and validation error message)\n');
    } else {
      console.error('❌ Validation test failed\n');
    }
  } catch (error) {
    console.error('❌ Validation error:', error.message, '\n');
  }

  console.log('--- TESTS COMPLETE ---');
}

runTests();
