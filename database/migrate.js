require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
    console.log('[DB] Starting migrations...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const sqlPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('[DB] Executing 001_initial_schema.sql...');
        await client.query(sqlContent);
        
        await client.query('COMMIT');
        console.log('[DB] Migrations executed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
