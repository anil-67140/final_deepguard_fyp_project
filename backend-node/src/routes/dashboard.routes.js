const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const Job = require('../models/Job.model');
const Transaction = require('../models/Transaction.model');

// Dashboard overview for current user
router.get('/overview', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const [jobs, recentFrauds, riskBreakdown] = await Promise.all([
      Job.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
      Transaction.find({ isFraud: true })
        .sort({ riskScore: -1 })
        .limit(10)
        .lean(),
      Transaction.aggregate([
        { $group: {
          _id: '$riskLevel',
          count: { $sum: 1 },
          avgRisk: { $avg: '$riskScore' }
        }}
      ])
    ]);

    const totals = await Job.aggregate([
      { $match: { userId } },
      { $group: {
        _id: null,
        totalTransactions: { $sum: '$totalTransactions' },
        totalFlagged: { $sum: '$flaggedCount' },
        totalCritical: { $sum: '$criticalCount' }
      }}
    ]);

    res.json({
      recentJobs: jobs,
      recentAlerts: recentFrauds,
      riskBreakdown,
      totals: totals[0] || { totalTransactions: 0, totalFlagged: 0, totalCritical: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
