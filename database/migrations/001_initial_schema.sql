-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum Types
CREATE TYPE user_role AS ENUM ('INSTITUTION_ADMIN', 'CREDENTIAL_OFFICER');
CREATE TYPE credential_status AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'ISSUE', 'REVOKE');
CREATE TYPE verification_result AS ENUM ('VALID', 'TAMPERED', 'REVOKED', 'EXPIRED', 'NOT_FOUND');
CREATE TYPE institution_status AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- 1. platform_admins
CREATE TABLE platform_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. institutions
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL,
    registration_code VARCHAR UNIQUE NOT NULL,
    contact_email VARCHAR NOT NULL,
    website VARCHAR,
    status institution_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. institution_users
CREATE TABLE institution_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT instusers_uc_id_inst UNIQUE (id, institution_id)
);
CREATE INDEX idx_institution_users_institution_id ON institution_users(institution_id);

-- 4. students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    student_id_code VARCHAR NOT NULL,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    date_of_birth DATE NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, student_id_code),
    CONSTRAINT students_uc_id_inst UNIQUE (id, institution_id)
);
CREATE INDEX idx_students_institution_id ON students(institution_id);

-- 5. credential_types
CREATE TABLE credential_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT credtypes_uc_id_inst UNIQUE (id, institution_id)
);
CREATE INDEX idx_credential_types_institution_id ON credential_types(institution_id);

-- 6. credentials
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    public_id VARCHAR UNIQUE NOT NULL,
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    credential_type_id UUID NOT NULL,
    course_name VARCHAR,
    degree_name VARCHAR NOT NULL,
    field_of_study VARCHAR,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    status credential_status NOT NULL DEFAULT 'ACTIVE',
    sha256_hash VARCHAR(64) UNIQUE NOT NULL,
    qr_reference VARCHAR UNIQUE NOT NULL,
    issued_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Composite Foreign Keys enforcing Institution Integrity
    FOREIGN KEY (student_id, institution_id) REFERENCES students(id, institution_id) ON DELETE RESTRICT,
    FOREIGN KEY (credential_type_id, institution_id) REFERENCES credential_types(id, institution_id) ON DELETE RESTRICT,
    FOREIGN KEY (issued_by, institution_id) REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
    CONSTRAINT credentials_uc_id_inst UNIQUE (id, institution_id)
);
CREATE INDEX idx_credentials_student_id ON credentials(student_id);
CREATE INDEX idx_credentials_institution_id ON credentials(institution_id);

-- 7. credential_versions
CREATE TABLE credential_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    version_number INT NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    new_hash VARCHAR(64) NOT NULL,
    snapshot JSONB NOT NULL,
    changes JSONB,
    modified_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(credential_id, version_number),
    FOREIGN KEY (modified_by, institution_id) REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT,
    FOREIGN KEY (credential_id, institution_id) REFERENCES credentials(id, institution_id) ON DELETE RESTRICT
);
CREATE INDEX idx_credential_versions_credential_id ON credential_versions(credential_id);

-- 8. revocations
CREATE TABLE revocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id UUID NOT NULL UNIQUE,
    institution_id UUID NOT NULL,
    revoked_by UUID NOT NULL,
    reason TEXT NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (revoked_by, institution_id) REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT,
    FOREIGN KEY (credential_id, institution_id) REFERENCES credentials(id, institution_id) ON DELETE RESTRICT
);

-- 9. verification_logs
CREATE TABLE verification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id UUID REFERENCES credentials(id) ON DELETE RESTRICT,
    scanned_reference VARCHAR,
    verifier_ip VARCHAR,
    verifier_user_agent VARCHAR,
    result verification_result NOT NULL,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_verification_logs_credential_id ON verification_logs(credential_id);
CREATE INDEX idx_verification_logs_verified_at ON verification_logs(verified_at);

-- 10. audit_logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    institution_id UUID,
    action audit_action NOT NULL,
    entity_type VARCHAR NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id, institution_id) REFERENCES institution_users(id, institution_id) ON DELETE RESTRICT
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- 11. refresh_tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES institution_users(id) ON DELETE CASCADE,
    token_hash VARCHAR NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    replaced_by UUID,
    FOREIGN KEY (replaced_by) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
