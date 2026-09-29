const db = require('../config/db');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const getProfile = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const query = `
            SELECT s.student_id_code, s.first_name, s.last_name, s.email, s.date_of_birth,
                   i.name AS institution_name, i.registration_code AS institution_registration_code
            FROM students s
            JOIN institutions i ON s.institution_id = i.id
            WHERE s.id = $1
        `;
        const result = await db.query(query, [studentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        
        const profile = result.rows[0];
        // Ensure no internal DB timezone parsing shifts local DOB strings negatively
        profile.date_of_birth = typeof profile.date_of_birth === 'string' ? profile.date_of_birth.split('T')[0] : profile.date_of_birth.toISOString().split('T')[0];

        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        next(error);
    }
};

const getCredentials = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const query = `
            SELECT c.id, c.public_id, c.course_name, c.degree_name, c.field_of_study, 
                   c.issue_date, c.expiry_date, c.status, c.qr_reference,
                   ct.name AS credential_type
            FROM credentials c
            JOIN credential_types ct ON c.credential_type_id = ct.id
            WHERE c.student_id = $1
        `;
        const result = await db.query(query, [studentId]);
        
        const formatDbDate = (d) => {
            if(!d) return null;
            if(typeof d === 'string') return d.substring(0, 10);
            return d.toISOString().split('T')[0];
        };

        const list = result.rows.map(c => ({
            ...c,
            issue_date: formatDbDate(c.issue_date),
            expiry_date: formatDbDate(c.expiry_date)
        }));

        res.status(200).json({ success: true, data: list });
    } catch (error) {
        next(error);
    }
};

const getCredentialDetails = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const credId = req.params.id;
        
        const query = `
            SELECT c.public_id, c.course_name, c.degree_name, c.field_of_study, 
                   c.issue_date, c.expiry_date, c.status, c.qr_reference, c.sha256_hash,
                   s.first_name, s.last_name, s.student_id_code,
                   i.name AS institution_name, i.registration_code AS institution_registration_code,
                   ct.name AS credential_type
            FROM credentials c
            JOIN students s ON c.student_id = s.id
            JOIN institutions i ON c.institution_id = i.id
            JOIN credential_types ct ON c.credential_type_id = ct.id
            WHERE c.id = $1 AND c.student_id = $2
        `;
        const result = await db.query(query, [credId, studentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Credential not found' });
        }
        
        const cred = result.rows[0];
        const formatDbDate = (d) => {
            if(!d) return null;
            if(typeof d === 'string') return d.substring(0, 10);
            return d.toISOString().split('T')[0];
        };

        res.status(200).json({
            success: true,
            data: {
                public_id: cred.public_id,
                student_name: `${cred.first_name} ${cred.last_name}`,
                student_id_code: cred.student_id_code,
                institution_name: cred.institution_name,
                institution_registration_code: cred.institution_registration_code,
                credential_type: cred.credential_type,
                degree_name: cred.degree_name,
                course_name: cred.course_name,
                field_of_study: cred.field_of_study,
                issue_date: formatDbDate(cred.issue_date),
                expiry_date: cred.expiry_date ? formatDbDate(cred.expiry_date) : null,
                status: cred.status,
                qr_reference: cred.qr_reference,
                sha256_hash: cred.sha256_hash
            }
        });
    } catch (error) {
        next(error);
    }
};

const getCredentialQR = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const credId = req.params.id;
        
        const query = `SELECT public_id, qr_reference FROM credentials WHERE id = $1 AND student_id = $2`;
        const result = await db.query(query, [credId, studentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Credential not found' });
        }
        
        const { public_id, qr_reference } = result.rows[0];
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
        const verification_url = `${baseUrl}/api/v1/credentials/verify/${qr_reference}`;
        
        res.status(200).json({
            success: true,
            data: {
                public_id,
                qr_reference,
                verification_url
            }
        });
    } catch (error) {
        next(error);
    }
};

const downloadCredentialPDF = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const credId = req.params.id;
        
        const query = `
            SELECT c.public_id, c.course_name, c.degree_name, c.field_of_study, 
                   c.issue_date, c.expiry_date, c.status, c.qr_reference,
                   s.first_name, s.last_name, s.student_id_code,
                   i.name AS institution_name, i.registration_code AS institution_registration_code,
                   ct.name AS credential_type
            FROM credentials c
            JOIN students s ON c.student_id = s.id
            JOIN institutions i ON c.institution_id = i.id
            JOIN credential_types ct ON c.credential_type_id = ct.id
            WHERE c.id = $1 AND c.student_id = $2
        `;
        const result = await db.query(query, [credId, studentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Credential not found' });
        }
        
        const cred = result.rows[0];
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
        const verification_url = `${baseUrl}/api/v1/credentials/verify/${cred.qr_reference}`;
        
        const qrImageBuffer = await QRCode.toBuffer(verification_url);
        
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=credential_${cred.public_id}.pdf`);
        
        doc.pipe(res);
        
        doc.fontSize(24).text(cred.institution_name, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(20).text(cred.credential_type, { align: 'center' });
        doc.fontSize(16).text(cred.degree_name, { align: 'center' });
        if (cred.course_name) doc.fontSize(14).text(cred.course_name, { align: 'center' });
        if (cred.field_of_study) doc.fontSize(14).text(`Field of Study: ${cred.field_of_study}`, { align: 'center' });
        
        doc.moveDown(2);
        
        // Status Watermark logic
        doc.fontSize(16).text(`STATUS: ${cred.status}`, { align: 'center', stroke: true });
        doc.moveDown();
        
        doc.fontSize(12).text(`Student Name: ${cred.first_name} ${cred.last_name}`);
        doc.text(`Student ID: ${cred.student_id_code}`);
        doc.text(`Institution Code: ${cred.institution_registration_code}`);
        
        const formatDbDate = (d) => {
            if(!d) return null;
            if(typeof d === 'string') return d.substring(0, 10);
            return d.toISOString().split('T')[0];
        };
        
        doc.text(`Issue Date: ${formatDbDate(cred.issue_date)}`);
        if (cred.expiry_date) {
            doc.text(`Expiry Date: ${formatDbDate(cred.expiry_date)}`);
        }
        doc.text(`Public Credential ID: ${cred.public_id}`);
        doc.moveDown();
        
        const bottomY = doc.page.height - 200;
        
        doc.text('Scan to Verify:', 50, bottomY);
        doc.image(qrImageBuffer, 50, bottomY + 20, { fit: [100, 100] });
        
        doc.fontSize(8);
        doc.text(`Verification URL: ${verification_url}`, 50, bottomY + 130);
        
        doc.end();
        
    } catch (error) {
        if (!res.headersSent) {
            next(error);
        } else {
            console.error('PDF generation error:', error);
        }
    }
};

module.exports = {
    getProfile,
    getCredentials,
    getCredentialDetails,
    getCredentialQR,
    downloadCredentialPDF
};
