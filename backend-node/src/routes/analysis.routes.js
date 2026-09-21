const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const Transaction = require('../models/Transaction.model');

// Get transactions for a job
router.get('/job/:jobId', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { page = 1, limit = 50, filter, search } = req.query;
    
    const query = { jobId };
    if (filter === 'fraud') query.isFraud = true;
    if (filter === 'critical') query.riskLevel = 'Critical';
    if (filter === 'high') query.riskLevel = 'High';
    if (search) query.$or = [
      { transactionId: { $regex: search, $options: 'i' } },
      { account: { $regex: search, $options: 'i' } },
      { fraudCategory: { $regex: search, $options: 'i' } }
    ];

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ riskScore: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Transaction.countDocuments(query)
    ]);

    res.json({ transactions, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single transaction with SHAP details
router.get('/transaction/:transactionId', authenticate, async (req, res) => {
  try {
    const tx = await Transaction.findOne({ transactionId: req.params.transactionId }).lean();
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
