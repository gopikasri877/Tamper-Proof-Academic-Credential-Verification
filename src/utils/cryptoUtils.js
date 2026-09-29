const crypto = require('crypto');

/**
 * Normalizes a nullable field to explicit null
 */
const normalizeNullable = (val) => {
    return (val === undefined || val === null) ? null : val;
};

/**
 * Normalizes a date to 'YYYY-MM-DD' if it's an ISO string.
 * Leaves nulls as null.
 */
const normalizeDate = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string' && val.includes('T')) {
        return val.split('T')[0];
    }
    return val;
};

const generateCredentialHash = (data) => {
    // 1. Mandatory Fields Validation
    const requiredFields = [
        'credential_public_id',
        'credential_type',
        'degree_name',
        'institution_registration_code',
        'issue_date',
        'student_id_code',
        'student_name'
    ];
    
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            throw new Error(`Missing required authoritative field for hashing: ${field}`);
        }
    }

    // 2. Assemble authoritative payload (Exactly 10 fields, normalized)
    const coreData = {
        course_name: normalizeNullable(data.course_name),
        credential_public_id: data.credential_public_id,
        credential_type: data.credential_type,
        degree_name: data.degree_name,
        expiry_date: normalizeDate(data.expiry_date),
        field_of_study: normalizeNullable(data.field_of_study),
        institution_registration_code: data.institution_registration_code,
        issue_date: normalizeDate(data.issue_date),
        student_id_code: data.student_id_code,
        student_name: data.student_name
    };

    // 3. Canonicalization (Deterministic rendering regardless of JS object nuances)
    // The replacer array explicitly guarantees the order of output string rendering natively in V8
    const sortedKeys = Object.keys(coreData).sort();
    const canonicalString = JSON.stringify(coreData, sortedKeys);
    
    // 4. Return strict 64-character payload
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
};

module.exports = {
    generateCredentialHash
};
