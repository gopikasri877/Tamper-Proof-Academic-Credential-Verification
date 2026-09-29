const db = require('../config/db');
const { hashPassword } = require('../utils/authUtil');

// Super admin endpoint to create institutions
const registerInstitution = async (req, res, next) => {
    try {
        const { name, registration_code, contact_email, website } = req.body;
        
        const result = await db.query(
            'INSERT INTO institutions (name, registration_code, contact_email, website) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, registration_code, contact_email, website]
        );
        
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

// Create an institution user (Admin or Officer)
const createInstitutionUser = async (req, res, next) => {
    try {
        const { institution_id, first_name, last_name, email, password, role } = req.body;
        const hashedPw = await hashPassword(password);
        
        const result = await db.query(
            `INSERT INTO institution_users (institution_id, first_name, last_name, email, password_hash, role)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role`,
            [institution_id, first_name, last_name, email, hashedPw, role]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerInstitution,
    createInstitutionUser
};
