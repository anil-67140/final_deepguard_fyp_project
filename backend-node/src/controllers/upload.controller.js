const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Transaction = require('../models/Transaction.model');
const Job = require('../models/Job.model');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const BATCH_SIZE = 1000; // Send to AI in chunks

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV, XLSX, and XLS files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
}).single('file');

/**
 * Parse IBM AML CSV/XLSX into transaction objects
 */
function parseIBMAMLRow(row, idx) {
  // IBM AML columns: Timestamp, From Bank, Account, To Bank, Account.1,
  // Amount Received, Receiving Currency, Amount Paid, Payment Currency,
  // Payment Format, Is Laundering
  return {
    transaction_id: row['Transaction ID'] || row['Id'] || `TX-${idx + 1}`,
    timestamp: row['Timestamp'] || row['timestamp'] || new Date().toISOString(),
    from_bank: row['From Bank'] || row['from_bank'] || '',
    account: row['Account'] || row['account'] || '',
    to_bank: row['To Bank'] || row['to_bank'] || '',
    to_account: row['Account.1'] || row['to_account'] || row['ToAccount'] || '',
    amount_paid: parseFloat(row['Amount Paid'] || row['amount_paid'] || 0),
    payment_currency: row['Payment Currency'] || row['payment_currency'] || 'USD',
    amount_received: parseFloat(row['Amount Received'] || row['amount_received'] || 0),
    receiving_currency: row['Receiving Currency'] || row['receiving_currency'] || 'USD',
    payment_format: row['Payment Format'] || row['payment_format'] || 'Wire',
    is_laundering: parseInt(row['Is Laundering'] || row['is_laundering'] || 0)
  };
}

/**
 * Compute per-account behavioral aggregates (Sender_TX_Count, Sender_Avg_Amount,
 * Sender_Unique_Receivers, Sender_Total_Amount, Sender_Max_Amount, Receiver_TX_Count)
 * from the full uploaded batch, and attach them to each transaction before sending
 * to the AI Engine.
 *
 * WHY: main.py's Transaction model defaults these fields to "first-seen account"
 * values (count=1, avg=amount_paid, etc.) when they aren't supplied, because a
 * single incoming transaction has no history of its own. But a bulk file upload
 * *is* a batch of that account's activity, so we can and should compute real
 * aggregates from it — this was a known gap (every live request silently used
 * defaults) and materially affects how well Isolation Forest / Autoencoder /
 * XGBoost can flag velocity-based and layering patterns (Sender_TX_Count,
 * Sender_Unique_Receivers are two of the model's 21 trained features).
 *
 * Note: this reflects the account's activity *within this uploaded file*, not
 * its full lifetime history (which would require a persistent per-account
 * running aggregate across jobs — out of scope for a single-batch endpoint).
 */
function attachBehavioralAggregates(transactions) {
  const senderStats = new Map(); // account -> { count, total, max, receivers:Set }
  const receiverCounts = new Map(); // to_account -> count

  for (const tx of transactions) {
    if (tx.account) {
      const s = senderStats.get(tx.account) || { count: 0, total: 0, max: 0, receivers: new Set() };
      s.count += 1;
      s.total += tx.amount_paid || 0;
      s.max = Math.max(s.max, tx.amount_paid || 0);
      if (tx.to_account) s.receivers.add(tx.to_account);
      senderStats.set(tx.account, s);
    }
    if (tx.to_account) {
      receiverCounts.set(tx.to_account, (receiverCounts.get(tx.to_account) || 0) + 1);
    }
  }

  return transactions.map(tx => {
    const s = tx.account ? senderStats.get(tx.account) : null;
    return {
      ...tx,
      sender_tx_count: s ? s.count : 1,
      sender_avg_amount: s ? s.total / s.count : (tx.amount_paid || 0),
      sender_unique_receivers: s ? s.receivers.size : 1,
      sender_total_amount: s ? s.total : (tx.amount_paid || 0),
      sender_max_amount: s ? s.max : (tx.amount_paid || 0),
      receiver_tx_count: tx.to_account ? (receiverCounts.get(tx.to_account) || 1) : 1
    };
  });
}

/**
 * Parse CSV file
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Parse XLSX/XLS file
 */
function parseXLSX(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

/**
 * Send batch to AI Engine
 */
async function sendToAIEngine(transactions, jobId) {
  const response = await axios.post(`${AI_ENGINE_URL}/analyze/batch`, {
    transactions,
    job_id: jobId
  }, { timeout: 300000 }); // 5 min timeout for large batches
  return response.data;
}

/**
 * Main upload handler
 */
const uploadFile = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobId = uuidv4();
    const io = req.app.get('io');

    // Create job record
    const job = await Job.create({
      jobId,
      userId: req.userId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      status: 'parsing',
      progress: 5
    });

    // Return immediately with job ID
    res.status(202).json({
      jobId,
      message: 'File received, processing started',
      status: 'parsing'
    });

    // ── Process asynchronously ──
    const filePath = req.file.path;
    const startTime = Date.now();

    try {
      // ── Parse file ──
      io?.to(`job_${jobId}`).emit('progress', { jobId, status: 'parsing', progress: 10 });
      let rawRows = [];
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (ext === '.csv') {
        rawRows = await parseCSV(filePath);
      } else {
        rawRows = parseXLSX(filePath);
      }

      const parsedTransactions = rawRows.map((row, idx) => parseIBMAMLRow(row, idx));
      const transactions = attachBehavioralAggregates(parsedTransactions);

      await Job.findOneAndUpdate({ jobId }, {
        status: 'analyzing',
        progress: 20,
        totalTransactions: transactions.length
      });

      io?.to(`job_${jobId}`).emit('progress', {
        jobId, status: 'analyzing', progress: 20,
        total: transactions.length
      });

      // ── Send to AI Engine in batches ──
      const allResults = [];
      const totalBatches = Math.ceil(transactions.length / BATCH_SIZE);

      for (let i = 0; i < totalBatches; i++) {
        const batch = transactions.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const response = await sendToAIEngine(batch, jobId);
        allResults.push(...(response.results || []));

        const progress = 20 + Math.round((i + 1) / totalBatches * 50);
        await Job.findOneAndUpdate({ jobId }, {
          progress,
          processedTransactions: allResults.length
        });
        io?.to(`job_${jobId}`).emit('progress', {
          jobId, status: 'analyzing', progress,
          processed: allResults.length, total: transactions.length
        });
      }

      // ── Save results to MongoDB ──
      await Job.findOneAndUpdate({ jobId }, { status: 'saving', progress: 75 });
      io?.to(`job_${jobId}`).emit('progress', { jobId, status: 'saving', progress: 75 });

      const txDocs = allResults.map((result, idx) => {
        const tx = transactions[idx] || {};
        return {
          jobId,
          transactionId: result.transaction_id,
          timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date(),
          fromBank: tx.from_bank,
          account: tx.account,
          toBank: tx.to_bank,
          toAccount: tx.to_account,
          amountPaid: tx.amount_paid,
          paymentCurrency: tx.payment_currency,
          amountReceived: tx.amount_received,
          receivingCurrency: tx.receiving_currency,
          paymentFormat: tx.payment_format,
          isLaundering: tx.is_laundering,
          riskScore: result.risk_score,
          riskLevel: result.risk_level,
          isFraud: result.is_fraud,
          isolationForestScore: result.isolation_forest_score,
          autoencoderScore: result.autoencoder_score,
          fraudCategory: result.fraud_category,
          shapValues: result.shap_values || {},
          graphLinks: tx.to_account ? [tx.to_account] : []
        };
      });

      // Bulk insert (ignore duplicates)
      await Transaction.insertMany(txDocs, { ordered: false }).catch(() => {});

      // ── Compute summary ──
      const flagged = allResults.filter(r => r.is_fraud);
      const critical = allResults.filter(r => r.risk_level === 'Critical');
      const avgRisk = allResults.reduce((s, r) => s + r.risk_score, 0) / Math.max(allResults.length, 1);

      const processingTime = Date.now() - startTime;

      await Job.findOneAndUpdate({ jobId }, {
        status: 'completed',
        progress: 100,
        totalTransactions: allResults.length,
        processedTransactions: allResults.length,
        flaggedCount: flagged.length,
        criticalCount: critical.length,
        cleanCount: allResults.length - flagged.length,
        averageRiskScore: Math.round(avgRisk * 10) / 10,
        processingTimeMs: processingTime,
        completedAt: new Date()
      });

      io?.to(`job_${jobId}`).emit('completed', {
        jobId,
        status: 'completed',
        summary: {
          total: allResults.length,
          flagged: flagged.length,
          critical: critical.length,
          clean: allResults.length - flagged.length,
          avgRisk: Math.round(avgRisk * 10) / 10,
          processingTimeMs: processingTime
        }
      });

      // Cleanup uploaded file
      fs.unlink(filePath, () => {});

    } catch (err) {
      console.error(`❌ Job ${jobId} failed:`, err.message);
      await Job.findOneAndUpdate({ jobId }, {
        status: 'failed',
        errorMessage: err.message
      });
      io?.to(`job_${jobId}`).emit('error', { jobId, error: err.message });
      fs.unlink(filePath, () => {});
    }
  });
};

/**
 * Get job status
 */
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findOne({ jobId, userId: req.userId });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all jobs for user
 */
const getUserJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadFile, getJobStatus, getUserJobs };
