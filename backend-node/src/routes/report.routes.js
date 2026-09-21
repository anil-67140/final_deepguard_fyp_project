const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { generateReport } = require('../controllers/report.controller');

router.get('/generate/:jobId', authenticate, generateReport);

module.exports = router;
