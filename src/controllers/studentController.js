const db = require('../config/db');

const addStudent = async (req, res, next) => {
    try {
        const institutionId = req.user.institutionId; // Extracted exactly from auth middleware JWT
        const { student_id_code, first_name, last_name, date_of_birth, email } = req.body;
        
        const result = await db.query(
            `INSERT INTO students (institution_id, student_id_code, first_name, last_name, date_of_birth, email)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, student_id_code, first_name, last_name`,
            [institutionId, student_id_code, first_name, last_name, date_of_birth, email]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    addStudent
};
