# DIGITAL ACADEMIC CREDENTIAL VERIFICATION PLATFORM
## PHASE 1: Architecture and Database Design

### 1. Complete Backend Architecture
The backend will follow a **Modular Monolith** pattern using standard Layered Architecture principles. This ensures clear separation of concerns while keeping deployment simple.

**Layers:**
- **Routing Layer (Routes):** Defines RESTful API endpoints and maps them to controllers.
- **Controller Layer:** Handles HTTP requests, responses, and extracts parameters.
- **Service Layer:** Contains core business logic (e.g., Verification Engine operations, Hashing).
- **Data Access Layer (Repositories):** Manages interactions with the PostgreSQL database.
- **Middleware Layer:** Handles cross-cutting concerns like Auth (JWT), Role extraction, Error handling, and validation.

### 2. Recommended Folder Structure
```text
/backend
├── /src
│   ├── /config          # Database config, environment variables, Swagger config
│   ├── /controllers     # Route controllers (req, res handling)
│   ├── /services        # Business logic & complex operations
│   ├── /repositories    # Database queries and data mapping
│   ├── /middlewares     # Auth, Validation, Error Handling, Rate Limiting
│   ├── /routes          # API route definitions
│   ├── /utils           # Helpers (Hash generator, QR generator, Logger)
│   └── app.js           # Express app setup and middleware registration
├── /tests             # Jest Unit and Integration tests
├── /database          # SQL migrations
├── .env                 # Environment variables
├── server.js            # Entry point
└── package.json
```

### 3. Database ER-Style Relationship Design & 11. Relationship Explanation
- **institutions (1) -> (N) institution_users:** An institution can have many admins and officers.
- **institutions (1) -> (N) students:** An institution registers many students.
- **institutions (1) -> (N) credential_types:** An institution defines its specific types of credentials.
- **institutions (1) -> (N) credentials:** An institution issues credentials.
- **students (1) -> (N) credentials:** A student owns many credentials.
- **credential_types (1) -> (N) credentials:** A credential conforms to a specific type.
- **credentials (1) -> (N) credential_versions:** Each credential can have historical modifications (versions).
- **credentials (1) -> (0..1) revocations:** A credential can have at most one active revocation record.
- **credentials (1) -> (N) verification_logs:** A credential might be verified multiple times.
- **institution_users (1) -> (N) refresh_tokens:** A user can have multiple active sessions.

### 4 - 10. Detailed Schema for Initial 10 Tables

#### Enums / Status Values
- **user_role**: `INSTITUTION_ADMIN`, `CREDENTIAL_OFFICER`
- **credential_status**: `ACTIVE`, `REVOKED`, `EXPIRED`
- **audit_action**: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `ISSUE`, `REVOKE`
- **verification_result**: `VALID`, `TAMPERED`, `REVOKED`, `EXPIRED`, `NOT_FOUND`

#### 1. institutions
- `id` (UUID, PK)
- `name` (VARCHAR, NOT NULL)
- `registration_code` (VARCHAR, UNIQUE, NOT NULL)
- `contact_email` (VARCHAR, NOT NULL)
- `website` (VARCHAR)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

#### 2. institution_users
- `id` (UUID, PK)
- `institution_id` (UUID, FK -> institutions.id) - *Index required*
- `first_name` (VARCHAR, NOT NULL)
- `last_name` (VARCHAR, NOT NULL)
- `email` (VARCHAR, UNIQUE, NOT NULL) - *Index required*
- `password_hash` (VARCHAR, NOT NULL)
- `role` (user_role enum, NOT NULL)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at` (TIMESTAMP)

#### 3. students
- `id` (UUID, PK)
- `institution_id` (UUID, FK -> institutions.id) - *Index required*
- `student_id_code` (VARCHAR, NOT NULL) - *Combined UNIQUE(institution_id, student_id_code)*
- `first_name` (VARCHAR, NOT NULL)
- `last_name` (VARCHAR, NOT NULL)
- `date_of_birth` (DATE, NOT NULL)
- `email` (VARCHAR, UNIQUE, NOT NULL)
- `created_at` (TIMESTAMP)

#### 4. credential_types
- `id` (UUID, PK)
- `institution_id` (UUID, FK -> institutions.id) - *Index required*
- `name` (VARCHAR, NOT NULL)
- `description` (TEXT)
- `created_at` (TIMESTAMP)

#### 5. credentials
- `id` (UUID, PK) - *Acts as the primary Credential ID*
- `student_id` (UUID, FK -> students.id) - *Index required*
- `institution_id` (UUID, FK -> institutions.id)
- `credential_type_id` (UUID, FK -> credential_types.id)
- `course_name` (VARCHAR)
- `degree_name` (VARCHAR, NOT NULL)
- `field_of_study` (VARCHAR)
- `issue_date` (DATE, NOT NULL)
- `expiry_date` (DATE) - *Nullable*
- `status` (credential_status enum, DEFAULT 'ACTIVE')
- `sha256_hash` (VARCHAR(64), NOT NULL)
- `qr_reference` (VARCHAR, UNIQUE, NOT NULL)
- `issued_by` (UUID, FK -> institution_users.id)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

#### 6. credential_versions
- `id` (UUID, PK)
- `credential_id` (UUID, FK -> credentials.id) - *Index required*
- `previous_hash` (VARCHAR(64), NOT NULL)
- `new_hash` (VARCHAR(64), NOT NULL)
- `changes` (JSONB)
- `modified_by` (UUID, FK -> institution_users.id)
- `created_at` (TIMESTAMP)

#### 7. revocations
- `id` (UUID, PK)
- `credential_id` (UUID, UNIQUE, FK -> credentials.id)
- `revoked_by` (UUID, FK -> institution_users.id)
- `reason` (TEXT, NOT NULL)
- `revoked_at` (TIMESTAMP, DEFAULT NOW())

#### 8. verification_logs
- `id` (UUID, PK)
- `credential_id` (UUID, FK -> credentials.id) - *Nullable if NOT_FOUND*
- `scanned_reference` (VARCHAR)
- `verifier_ip` (VARCHAR)
- `verifier_user_agent` (VARCHAR)
- `result` (verification_result enum, NOT NULL)
- `verified_at` (TIMESTAMP, DEFAULT NOW())

#### 9. audit_logs
- `id` (UUID, PK)
- `user_id` (UUID, FK -> institution_users.id) - *Nullable for system actions*
- `action` (audit_action enum, NOT NULL)
- `entity_type` (VARCHAR, NOT NULL)
- `entity_id` (UUID)
- `details` (JSONB)
- `ip_address` (VARCHAR)
- `created_at` (TIMESTAMP)

#### 10. refresh_tokens
- `id` (UUID, PK)
- `user_id` (UUID, FK -> institution_users.id) - *Index required*
- `token` (VARCHAR, UNIQUE, NOT NULL)
- `expires_at` (TIMESTAMP, NOT NULL)
- `created_at` (TIMESTAMP)
- `revoked` (BOOLEAN, DEFAULT false)

### 12. Authentication and Authorization Design
- **Auth Strategy:** Stateless JWT approach with short-lived Access Tokens and persistent Refresh Tokens stored securely in HttpOnly cookies to prevent XSS.
- **Authorization:** Role-Based Access Control (RBAC) middleware verifying JWT payload roles (`INSTITUTION_ADMIN`, `CREDENTIAL_OFFICER`).
- **Passwords:** Hashed using `bcrypt` (min 12 salt rounds).

### 13. SHA-256 Hashing Design
**Canonicalization Logic (Deterministic Data):**
Before hashing, immutable core fields are serialized into a strict JSON string with alphabetically sorted keys.
*Included:* `student_id_code`, `student_name`, `institution_registration_code`, `degree_name`, `field_of_study`, `issue_date`.
(Note: Metadata like `status` or dates created are EXCLUDED because statuses change, but the achievement details do not).
**Formula:** `hash = crypto.createHash('sha256').update(canonical_json_string).digest('hex')`

### 14. Verification Engine Design
**Step-by-Step Flow:**
1. **Lookup:** Search credential by `id` or `qr_reference`. => *If blank: `NOT_FOUND`*.
2. **Status Check:** Check if `credential.status === 'REVOKED'`. => *If true: `REVOKED`*.
3. **Expiry Check:** If `credential.expiry_date` exists and is before today. => *If true: `EXPIRED`*.
4. **Integrity Check:** Extract core credential data, rebuild canonical JSON, apply SHA-256. Compare with `credential.sha256_hash`. => *If false: `TAMPERED`*.
5. **Success:** All passed. Returns `VALID`.
6. **Logging:** Irrespective of outcome, write to `verification_logs`.

### 15. API Module Plan
- `/api/v1/auth`: Login, Logout, Refresh.
- `/api/v1/institutions`: Profile management.
- `/api/v1/users`: Invite and manage Admins/Officers.
- `/api/v1/students`: Manage and get student data.
- `/api/v1/credentials`: Issue (POST), View (GET), Revoke (POST).
- `/api/v1/verify`: Public endpoint for the Verification Engine.
- `/api/v1/audit`: Access logs.

### 16. Security Architecture
- Use `helmet` for Security Header configurations.
- Use `cors` restricted strictly to the frontend origin.
- Use `express-rate-limit`: Strict limits on Auth and Verify APIs.
- Use parameterized queries with `pg` preventing SQL injection. NO direct payload insertion.

### 17. Testing Strategy
- **Unit Tests:** Jest for isolated logic (SHA-256 canonicalization, JWT checking).
- **Integration Tests:** Supertest for endpoint tests against a test database.

### 18. Complete Development Roadmap
- [x] **PHASE 1:** Architecture and Database Design (COMPLETED)
- [ ] **PHASE 2:** Backend Project Setup 
- [ ] **PHASE 3:** PostgreSQL Connection and Migrations 
- [ ] **PHASE 4:** Authentication
- [ ] **PHASE 5:** Role-Based Authorization 
- [ ] **PHASE 6:** Institution Management
- [ ] **PHASE 7:** Student Management
- [ ] **PHASE 8:** Credential Types
- [ ] **PHASE 9:** Credential Issuance
- [ ] **PHASE 10:** Credential ID and SHA-256 Integrity
- [ ] **PHASE 11:** QR Verification Reference
- [ ] **PHASE 12:** Credential Versioning
- [ ] **PHASE 13:** Credential Revocation
- [ ] **PHASE 14:** Verification Engine 
- [ ] **PHASE 15:** Verification Logs
- [ ] **PHASE 16:** Audit Logs
- [ ] **PHASE 17:** Security Hardening
- [ ] **PHASE 18:** Automated Testing 
- [ ] **PHASE 19:** API Documentation
- [ ] **PHASE 20:** Frontend Integration 
- [ ] **PHASE 21:** Deployment Readiness
