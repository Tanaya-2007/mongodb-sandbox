/**
 * Manual test script for the MongoDB Sandbox Provisioner Server
 * Run this script after starting the server (e.g. npm run dev)
 */

async function runTests() {
  const baseUrl = 'http://localhost:5000';
  const testDeviceId = `test-device-${Math.random().toString(36).substring(2, 10)}`;
  
  console.log('--- STARTING MONGODB SANDBOX API TESTS ---');
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

  // Test 2: Provision a new sandbox database
  let firstDbName = '';
  let firstUri = '';
  try {
    console.log('Test 2: POST /api/sandbox (New Device)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId }),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 200 && data.success) {
      firstDbName = data.databaseName;
      firstUri = data.mongodbUri;
      console.log('✅ New sandbox provisioned successfully');
      console.log(`   Database assigned: ${firstDbName}`);
      console.log(`   URI: ${firstUri}\n`);
    } else {
      console.error('❌ New sandbox provisioning failed\n');
    }
  } catch (error) {
    console.error('❌ Provisioning error:', error.message, '\n');
  }

  // Test 3: Idempotency (Fetch sandbox database for same device)
  try {
    console.log('Test 3: POST /api/sandbox (Same Device - Idempotency Check)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId }),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 200 && data.success) {
      if (data.databaseName === firstDbName && data.mongodbUri === firstUri) {
        console.log('✅ Idempotency test passed (returned same connection details)\n');
      } else {
        console.error('❌ Idempotency test failed (returned different connection details)\n');
      }
    } else {
      console.error('❌ Request failed\n');
    }
  } catch (error) {
    console.error('❌ Idempotency error:', error.message, '\n');
  }

  // Test 4: Validation check (No deviceId)
  try {
    console.log('Test 4: POST /api/sandbox (Missing deviceId)');
    const res = await fetch(`${baseUrl}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (res.status === 400 && !data.success) {
      console.log('✅ Validation test passed (correctly returned 400 and error message)\n');
    } else {
      console.error('❌ Validation test failed\n');
    }
  } catch (error) {
    console.error('❌ Validation error:', error.message, '\n');
  }

  console.log('--- TESTS COMPLETE ---');
}

runTests();
