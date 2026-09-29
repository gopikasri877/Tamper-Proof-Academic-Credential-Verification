BEGIN;

-- Add authentication columns to existing students table
ALTER TABLE students
ADD COLUMN password_hash VARCHAR,
ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Create isolated refresh token tracking for students
CREATE TABLE student_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    token_hash VARCHAR NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    replaced_by UUID REFERENCES student_refresh_tokens(id) ON DELETE SET NULL
);

-- Index to support primary token lookups during authentication cycles
CREATE INDEX idx_student_refresh_tokens_student_id ON student_refresh_tokens(student_id);

COMMIT;
