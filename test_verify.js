const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function runTests() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    
    // Get baseline counts
    const logsBefore = parseInt((await client.query("SELECT count(*) FROM verification_logs")).rows[0].count, 10);
    
    const targetCred = (await client.query("SELECT public_id, qr_reference FROM credentials LIMIT 1")).rows[0];
    
    const results = {};
    
    const getEndpoint = async (ref) => {
        const fetchRes = await fetch(`http://localhost:5000/api/v1/credentials/verify/${ref}`);
        return { status: fetchRes.status, body: await fetchRes.json() };
    };

    // Test 1 - QR Reference
    results.QR = await getEndpoint(targetCred.qr_reference);

    // Test 2 - Public ID
    results.Public_ID = await getEndpoint(targetCred.public_id);

    // Test 3 - Not Found
    results.NotFound = await getEndpoint('FAKE-REF-12345');

    // Get logs after
    const logsAfter = parseInt((await client.query("SELECT count(*) FROM verification_logs")).rows[0].count, 10);
    const newLogsCount = logsAfter - logsBefore;
    
    // Inspect new logs
    const newLogs = (await client.query("SELECT * FROM verification_logs ORDER BY verified_at DESC LIMIT 3")).rows;

    fs.writeFileSync('C:\\Credential-Verification-System\\test_verify_logs.json', JSON.stringify({
        HttpResults: results,
        LogValidation: {
            logsCreated: newLogsCount,
            latestLogs: newLogs
        }
    }, null, 2));

    client.release();
    await pool.end();
}

runTests().catch(console.error);
