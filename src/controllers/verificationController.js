const db = require('../config/db');
const { generateCredentialHash } = require('../utils/cryptoUtils');

const verifyCredential = async (req, res, next) => {
    const client = await db.pool.connect();
    try {
        const { reference } = req.params;
        const verifier_ip = req.ip || '0.0.0.0';
        const verifier_user_agent = req.headers['user-agent'] || 'Unknown';

        // 1. Initial Lookup
        const query = `
            SELECT 
                c.id AS credential_id, c.public_id, c.course_name, c.degree_name, 
                c.field_of_study, c.issue_date, c.expiry_date, c.status, c.sha256_hash,
                s.student_id_code, s.first_name, s.last_name,
                i.name AS institution_name, i.registration_code AS institution_code,
                ct.name AS credential_type
            FROM credentials c
            JOIN students s ON c.student_id = s.id
            JOIN institutions i ON c.institution_id = i.id
            JOIN credential_types ct ON c.credential_type_id = ct.id
            WHERE c.public_id = $1 OR c.qr_reference = $1
        `;
        const fetchRefs = await client.query(query, [reference]);

        // NOT_FOUND Handler
        if (fetchRefs.rows.length === 0) {
            await client.query(
                `INSERT INTO verification_logs (credential_id, scanned_reference, verifier_ip, verifier_user_agent, result) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [null, reference, verifier_ip, verifier_user_agent, 'NOT_FOUND']
            );
            return res.status(200).json({
                success: false,
                result: 'NOT_FOUND',
                message: 'Credential could not be found.'
            });
        }

        const cred = fetchRefs.rows[0];
        const credential_id = cred.credential_id;

        // 2. Hash Integrity Reconstruction
        const formatDbDate = (dbDate) => {
            if (!dbDate) return null;
            if (typeof dbDate === 'string') return dbDate.split('T')[0];
            
            const yyyy = dbDate.getFullYear();
            const mm = String(dbDate.getMonth() + 1).padStart(2, '0');
            const dd = String(dbDate.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        const integrityData = {
            credential_public_id: cred.public_id,
            credential_type: cred.credential_type,
            course_name: cred.course_name || null,
            degree_name: cred.degree_name,
            expiry_date: formatDbDate(cred.expiry_date),
            field_of_study: cred.field_of_study || null,
            institution_registration_code: cred.institution_code,
            issue_date: formatDbDate(cred.issue_date),
            student_id_code: cred.student_id_code,
            student_name: `${cred.first_name} ${cred.last_name}`
        };

        const recomputed_hash = generateCredentialHash(integrityData);

        const fetchVer = await client.query(
            `SELECT new_hash FROM credential_versions WHERE credential_id = $1 ORDER BY version_number DESC LIMIT 1`,
            [credential_id]
        );
        const latest_version_hash = fetchVer.rows.length > 0 ? fetchVer.rows[0].new_hash : null;

        // TAMPERED Handler
        if (recomputed_hash !== cred.sha256_hash || cred.sha256_hash !== latest_version_hash) {
            await client.query(
                `INSERT INTO verification_logs (credential_id, scanned_reference, verifier_ip, verifier_user_agent, result) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [credential_id, reference, verifier_ip, verifier_user_agent, 'TAMPERED']
            );
            return res.status(200).json({
                success: false,
                result: 'TAMPERED',
                message: 'Credential integrity verification failed.'
            });
        }

        // 3. REVOKED Handler
        if (cred.status === 'REVOKED') {
            const fetchRev = await client.query(
                `SELECT reason, revoked_at FROM revocations WHERE credential_id = $1`,
                [credential_id]
            );
            
            const revData = fetchRev.rows[0] || { reason: 'Unknown', revoked_at: new Date() };

            await client.query(
                `INSERT INTO verification_logs (credential_id, scanned_reference, verifier_ip, verifier_user_agent, result) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [credential_id, reference, verifier_ip, verifier_user_agent, 'REVOKED']
            );
            return res.status(200).json({
                success: false,
                result: 'REVOKED',
                message: 'Credential has been formally revoked by the issuing institution.',
                data: {
                    revocation_reason: revData.reason,
                    revocation_date: revData.revoked_at
                }
            });
        }

        // 4. EXPIRED Handler
        if (cred.expiry_date) {
            const expiryString = formatDbDate(cred.expiry_date);
            
            // Get local current calendar date natively
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const currentCalendarDate = `${yyyy}-${mm}-${dd}`;

            if (currentCalendarDate > expiryString) {
                await client.query(
                    `INSERT INTO verification_logs (credential_id, scanned_reference, verifier_ip, verifier_user_agent, result) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [credential_id, reference, verifier_ip, verifier_user_agent, 'EXPIRED']
                );
                return res.status(200).json({
                    success: false,
                    result: 'EXPIRED',
                    message: 'Credential has expired.'
                });
            }
        }

        // 5. VALID Handler
        if (cred.status === 'ACTIVE') {
            await client.query(
                `INSERT INTO verification_logs (credential_id, scanned_reference, verifier_ip, verifier_user_agent, result) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [credential_id, reference, verifier_ip, verifier_user_agent, 'VALID']
            );
            return res.status(200).json({
                success: true,
                result: 'VALID',
                data: {
                    public_id: cred.public_id,
                    student_name: `${cred.first_name} ${cred.last_name}`,
                    student_id: cred.student_id_code,
                    institution_name: cred.institution_name,
                    institution_code: cred.institution_code,
                    credential_type: cred.credential_type,
                    course_name: cred.course_name,
                    issue_date: formatDbDate(cred.issue_date),
                    expiry_date: cred.expiry_date ? formatDbDate(cred.expiry_date) : null,
                    sha256_hash: cred.sha256_hash
                }
            });
        }

        throw new Error('Unexpected credential status boundary mapped.');

    } catch (error) {
        next(error);
    } finally {
        client.release();
    }
};

module.exports = {
    verifyCredential
};
