const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
require('dotenv').config();

async function runTests() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    
    // Inject password for testing logic 
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('StudentPass!123', salt);
    
    // Grab the existing test student's email to ensure accurate targeting
    const fetchStu = (await client.query("SELECT email FROM students LIMIT 1")).rows[0];
    const targetEmail = fetchStu ? fetchStu.email : 'test@example.com';
    
    await client.query("UPDATE students SET password_hash = $1 WHERE email = $2", [hash, targetEmail]);

    // Give server moment in case it isn't completely bound if booted simultaneously
    await new Promise(r => setTimeout(r, 2000));
    const results = {};
    
    const postLogin = async (email, password) => {
        const fetchRes = await fetch('http://localhost:5000/api/v1/student/auth/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        return { status: fetchRes.status, body: await fetchRes.json() };
    };

    // A. Valid student login
    results.Valid = await postLogin(targetEmail, 'StudentPass!123');
    
    // B. Wrong password
    results.WrongPassword = await postLogin(targetEmail, 'WrongPassword!123');
    
    // C. Nonexistent email
    results.NonExistent = await postLogin('fake@example.com', 'StudentPass!123');
    
    // D. Inactive student
    await client.query("UPDATE students SET is_active = false WHERE email = $1", [targetEmail]);
    results.Inactive = await postLogin(targetEmail, 'StudentPass!123');
    await client.query("UPDATE students SET is_active = true WHERE email = $1", [targetEmail]); // Revert safety
    
    // Row counts mapping
    const counts = {};
    for (const t of ['credentials', 'credential_versions', 'audit_logs', 'refresh_tokens', 'student_refresh_tokens']) {
        counts[t] = parseInt((await client.query(`SELECT count(*) FROM ${t}`)).rows[0].count, 10);
    }
    
    // Raw token missing check 
    let dbTokenObj = null;
    if (results.Valid.body.data && results.Valid.body.data.refreshToken) {
        dbTokenObj = (await client.query(`SELECT * FROM student_refresh_tokens WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`, [results.Valid.body.data.user.id])).rows[0];
    }
    
    fs.writeFileSync('C:\\Credential-Verification-System\\test_stu_logs.json', JSON.stringify({
        HttpResults: results,
        DbCounts: counts,
        TokenSafelyHashed: dbTokenObj ? (dbTokenObj.token_hash !== results.Valid.body.data.refreshToken) : false,
        HashLength: dbTokenObj ? dbTokenObj.token_hash.length : 0
    }, null, 2));
    
    client.release();
    await pool.end();
}

runTests().catch(console.error);
