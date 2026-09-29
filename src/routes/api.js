const express = require('express');
const router = express.Router();

const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const instController = require('../controllers/institutionController');
const studentController = require('../controllers/studentController');
const credController = require('../controllers/credentialController');
const verificationController = require('../controllers/verificationController');
const studentAuthController = require('../controllers/studentAuthController');
const studentPortalController = require('../controllers/studentPortalController');

// Phase 4: Auth
router.post('/auth/login', authController.login);

// Phase 5E: Student Auth
router.post('/student/auth/login', studentAuthController.login);

// Phase 6: Institutions
router.post('/institutions', instController.registerInstitution); // (Should be super-admin protected in reality)
router.post('/institutions/users', instController.createInstitutionUser);

// Phase 7: Students (Requires Auth & INST_ADMIN role)
router.post('/students', requireAuth, requireRole(['INSTITUTION_ADMIN', 'CREDENTIAL_OFFICER']), studentController.addStudent);

// Phase 8: Credential Types
router.post('/credential-types', requireAuth, requireRole(['INSTITUTION_ADMIN']), credController.addCredentialType);

// Phase 9-10: Credential Issuance
router.post('/credentials', requireAuth, requireRole(['INSTITUTION_ADMIN', 'CREDENTIAL_OFFICER']), credController.issueCredential);

// Phase 11: Credential Verification
router.get('/credentials/verify/:reference', verificationController.verifyCredential);

// Phase 5F-5H: Student Credential Portal
// Authenticaton logic mapping enforces requireAuth and roles across all bounds
router.get('/student/profile', requireAuth, requireRole(['STUDENT']), studentPortalController.getProfile);
router.get('/student/credentials', requireAuth, requireRole(['STUDENT']), studentPortalController.getCredentials);
router.get('/student/credentials/:id', requireAuth, requireRole(['STUDENT']), studentPortalController.getCredentialDetails);
router.get('/student/credentials/:id/qr', requireAuth, requireRole(['STUDENT']), studentPortalController.getCredentialQR);
router.get('/student/credentials/:id/download', requireAuth, requireRole(['STUDENT']), studentPortalController.downloadCredentialPDF);

module.exports = router;
