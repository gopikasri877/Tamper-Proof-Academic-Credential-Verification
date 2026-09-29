const db = require('../config/db');
const { comparePassword, generateTokens } = require('../utils/authUtil');
const crypto = require('crypto');

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const result = await db.query('SELECT * FROM institution_users WHERE email = $1 AND is_active = true', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const tokens = generateTokens(user);

        const refreshTokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

        // Store refresh token securely
        await db.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
            [user.id, refreshTokenHash]
        );

        res.json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    institution_id: user.institution_id
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
