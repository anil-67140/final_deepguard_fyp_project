const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const Job = require('../models/Job.model');
const Transaction = require('../models/Transaction.model');

// All jobs (admin only)
router.get('/jobs', authenticate, requireAdmin, async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System stats
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const [totalJobs, totalTx, totalFraud] = await Promise.all([
      Job.countDocuments(),
      Transaction.countDocuments(),
      Transaction.countDocuments({ isFraud: true })
    ]);
    res.json({ totalJobs, totalTransactions: totalTx, totalFraud });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
