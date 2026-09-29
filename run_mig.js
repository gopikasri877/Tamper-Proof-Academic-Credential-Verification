const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function run() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        const check = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='students' AND column_name='password_hash'`);
        if (check.rows.length === 0) {
            const sql = fs.readFileSync('database/migrations/002_student_auth_schema.sql', 'utf8');
            await client.query(sql);
            console.log("MIGRATION_EXECUTED");
        } else {
            console.log("ALREADY_EXECUTED");
        }
    } catch(e) {
        console.error("ERROR", e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}
run();
