const db = require('../config/db');
const { generateCredentialHash } = require('../utils/cryptoUtils');

const addCredentialType = async (req, res, next) => {
    try {
        const institutionId = req.user.institutionId;
        const { name, description } = req.body;
        
        const result = await db.query(
            'INSERT INTO credential_types (institution_id, name, description) VALUES ($1, $2, $3) RETURNING *',
            [institutionId, name, description]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const issueCredential = async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        const institutionId = req.user.institutionId;
        const issuedBy = req.user.userId;
        const { student_id, credential_type_id, degree_name, course_name, field_of_study, issue_date, expiry_date } = req.body;

        // 1 & 2. Verify Student and Credential Type belong to institution
        const fetchRefs = await client.query(`
            SELECT 
                s.student_id_code, s.first_name, s.last_name, 
                i.registration_code,
                ct.name AS type_name
            FROM students s 
            JOIN institutions i ON s.institution_id = i.id
            CROSS JOIN credential_types ct
            WHERE s.id = $1 AND s.institution_id = $2
            AND ct.id = $3 AND ct.institution_id = $2
            AND i.status = 'APPROVED'
        `, [student_id, institutionId, credential_type_id]);

        if (fetchRefs.rows.length === 0) {
            throw new Error('Student or Credential Type not found for this institution');
        }
        
        const ref = fetchRefs.rows[0];

        // 3. Generate public_id
        const crypto = require('crypto');
        const currentYear = new Date().getFullYear();
        const shortHash = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 alphanumeric chars
        const public_id = `DAC-${currentYear}-${shortHash}`;

        // 4. Build 10-field authoritative payload
        const integrityData = {
            credential_public_id: public_id,
            credential_type: ref.type_name,
            course_name: course_name || null,
            degree_name,
            expiry_date: expiry_date || null,
            field_of_study: field_of_study || null,
            institution_registration_code: ref.registration_code,
            issue_date,
            student_id_code: ref.student_id_code,
            student_name: `${ref.first_name} ${ref.last_name}`
        };

        // 5. Generate SHA-256
        const sha256_hash = generateCredentialHash(integrityData);

        // 6. Generate QR reference
        const qr_reference = crypto.randomUUID(); 

        await client.query('BEGIN'); // Start Transaction

        // 7. Create credential
        const insertRes = await client.query(
            `INSERT INTO credentials 
             (public_id, student_id, institution_id, credential_type_id, course_name, degree_name, field_of_study, issue_date, expiry_date, sha256_hash, qr_reference, issued_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, status, public_id, qr_reference, sha256_hash`,
            [public_id, student_id, institutionId, credential_type_id, course_name, degree_name, field_of_study, issue_date, expiry_date, sha256_hash, qr_reference, issuedBy]
        );
        
        const credentialId = insertRes.rows[0].id;

        // 8. Create Version 1
        await client.query(
            `INSERT INTO credential_versions
             (credential_id, institution_id, version_number, previous_hash, new_hash, snapshot, changes, modified_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [credentialId, institutionId, 1, 'GENESIS', sha256_hash, integrityData, null, issuedBy]
        );

        // 9. Create audit log
        await client.query(
            `INSERT INTO audit_logs (user_id, institution_id, action, entity_type, entity_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [issuedBy, institutionId, 'ISSUE', 'CREDENTIAL', credentialId, { public_id, qr_reference }, req.ip || '0.0.0.0']
        );

        await client.query('COMMIT');
        res.status(201).json({ 
            success: true, 
            data: {
                ...insertRes.rows[0],
                version_number: 1
            } 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

module.exports = {
    addCredentialType,
    issueCredential
};
