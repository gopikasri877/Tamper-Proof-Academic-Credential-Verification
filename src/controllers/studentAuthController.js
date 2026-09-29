const db = require('../config/db');
const { comparePassword, generateStudentTokens } = require('../utils/authUtil');
const crypto = require('crypto');

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const result = await db.query('SELECT * FROM students WHERE email = $1', [email]);
        const student = result.rows[0];

        if (!student || !student.is_active) {
            return res.status(401).json({ success: false, message: 'Invalid credentials or account inactive' });
        }

        if (!student.password_hash) {
            return res.status(401).json({ success: false, message: 'Invalid credentials or account inactive' });
        }

        const isValid = await comparePassword(password, student.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials or account inactive' });
        }

        const tokens = generateStudentTokens(student);
        const refreshTokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

        await db.query(
            'INSERT INTO student_refresh_tokens (student_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [student.id, refreshTokenHash]
        );

        res.status(200).json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                user: {
                    id: student.id,
                    email: student.email,
                    role: 'STUDENT',
                    institution_id: student.institution_id
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login
};
