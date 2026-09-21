const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  transactionId: { type: String, required: true, unique: true, index: true },

  // IBM AML fields
  timestamp: { type: Date, default: Date.now },
  fromBank: { type: String, index: true },
  account: { type: String, index: true },        // sender account
  toBank: { type: String },
  toAccount: { type: String, index: true },       // receiver account (for graphLookup)
  amountPaid: { type: Number, default: 0 },
  paymentCurrency: { type: String, default: 'USD' },
  amountReceived: { type: Number, default: 0 },
  receivingCurrency: { type: String, default: 'USD' },
  paymentFormat: { type: String, default: 'Wire' },
  isLaundering: { type: Number, default: 0 },      // original label (if available)

  // AI Results
  riskScore: { type: Number, default: 0 },         // 0-100
  riskLevel: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
  isFraud: { type: Boolean, default: false },
  isolationForestScore: { type: Number, default: 0 },
  autoencoderScore: { type: Number, default: 0 },
  fraudCategory: { type: String, default: 'Clean' },
  shapValues: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Graph metadata
  graphLinks: [{ type: String }],                  // list of connected account IDs

  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

// Compound index for graph traversal
TransactionSchema.index({ account: 1, toAccount: 1 });
TransactionSchema.index({ jobId: 1, riskScore: -1 });
TransactionSchema.index({ jobId: 1, isFraud: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
