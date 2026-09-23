"""
DeepGuard — AI Engine (FastAPI)
Handles fraud detection using Isolation Forest + Autoencoder + SHAP
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import numpy as np
import pandas as pd
import joblib
import json
import os
import time
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s — %(levelname)s — %(message)s')
logger = logging.getLogger("deepguard-ai")

app = FastAPI(
    title="DeepGuard AI Engine",
    description="AI-powered financial fraud detection using Isolation Forest + Autoencoder + SHAP",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Model Loader (singleton pattern)
# ─────────────────────────────────────────────
class ModelRegistry:
    _instance = None
    _models_loaded = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load_models(self):
        if self._models_loaded:
            return

        MODEL_PATH = os.getenv("MODEL_PATH", "./saved_models")
        logger.info(f"Loading models from: {MODEL_PATH}")

        try:
            # Load Isolation Forest
            if_path = os.path.join(MODEL_PATH, "isolation_forest.pkl")
            self.isolation_forest = joblib.load(if_path)
            logger.info("✅ Isolation Forest loaded")

            # Load Autoencoder — prefer the native .keras format, fall back to .h5
            # (the training notebook now saves both, but only .keras is "current")
            import tensorflow as tf
            ae_keras_path = os.path.join(MODEL_PATH, "autoencoder.keras")
            ae_h5_path = os.path.join(MODEL_PATH, "autoencoder.h5")
            ae_path = ae_keras_path if os.path.exists(ae_keras_path) else ae_h5_path
            self.autoencoder = tf.keras.models.load_model(ae_path)
            logger.info(f"✅ Autoencoder loaded from {ae_path}")

            # Load XGBoost (supervised model — this now carries most of the
            # detection performance; IF + AE remain for explainability and as
            # an unsupervised signal for fraud patterns unseen in labeled data)
            self.xgboost_model = None
            xgb_path = os.path.join(MODEL_PATH, "xgboost_model.json")
            if os.path.exists(xgb_path):
                import xgboost as xgb
                self.xgboost_model = xgb.XGBClassifier()
                self.xgboost_model.load_model(xgb_path)
                logger.info("✅ XGBoost loaded")
            else:
                logger.warning("⚠️  xgboost_model.json not found — falling back to IF+AE only")

            # Load Scaler
            scaler_path = os.path.join(MODEL_PATH, "scaler.pkl")
            self.scaler = joblib.load(scaler_path)
            logger.info("✅ Scaler loaded")

            # Load feature columns (defines the exact column order the scaler
            # and every model expect — engineer_features() must match this)
            feature_path = os.path.join(MODEL_PATH, "feature_cols.pkl")
            self.feature_cols = joblib.load(feature_path)
            logger.info(f"✅ Features loaded ({len(self.feature_cols)}): {self.feature_cols}")

            # Load metadata (thresholds, ensemble weights, etc.)
            meta_path = os.path.join(MODEL_PATH, "model_metadata.json")
            with open(meta_path, "r") as f:
                self.metadata = json.load(f)
            self.ae_threshold = self.metadata["ae_threshold"]
            self.ensemble_threshold = self.metadata.get("ensemble_threshold", 0.5)
            self.ensemble_weights = self.metadata.get(
                "ensemble_weights",
                {"xgboost": 0.85, "autoencoder": 0.15, "isolation_forest": 0.0},
            )
            if_range = self.metadata.get("if_decision_function_range", {"min": -0.5, "max": 0.5})
            self.if_score_min = if_range["min"]
            self.if_score_max = if_range["max"]
            logger.info(f"✅ Metadata loaded. Ensemble threshold: {self.ensemble_threshold:.4f}  "
                        f"Weights: {self.ensemble_weights}")

            self._models_loaded = True

        except FileNotFoundError as e:
            logger.warning(f"⚠️  Model files not found: {e}")
            logger.warning("⚠️  Running in DEMO mode with random predictions")
            self.isolation_forest = None
            self.autoencoder = None
            self.xgboost_model = None
            self.scaler = None
            self.feature_cols = [
                'Amount Paid', 'Amount Received', 'Amount_Ratio', 'Amount_Diff',
                'Log_Amount_Paid', 'Log_Amount_Recv', 'Is_Round_Amount',
                'Hour', 'DayOfWeek', 'Month', 'IsWeekend', 'IsNightTx',
                'Payment Format_enc', 'Payment Currency_enc', 'Receiving Currency_enc',
                'Sender_TX_Count', 'Sender_Avg_Amount', 'Sender_Unique_Receivers',
                'Sender_Total_Amount', 'Sender_Max_Amount', 'Receiver_TX_Count'
            ]
            self.ae_threshold = 0.05
            self.ensemble_threshold = 0.5
            self.ensemble_weights = {"xgboost": 0.85, "autoencoder": 0.15, "isolation_forest": 0.0}
            self.if_score_min, self.if_score_max = -0.5, 0.5
            self.metadata = {
                "model_performance": {
                    "isolation_forest_roc_auc": 0.0,
                    "autoencoder_roc_auc": 0.0,
                    "xgboost_roc_auc": 0.0,
                    "ensemble_roc_auc": 0.0
                }
            }
            self._models_loaded = True

    def is_demo_mode(self):
        return self.isolation_forest is None


registry = ModelRegistry()


@app.on_event("startup")
async def startup_event():
    registry.load_models()
    logger.info("🚀 DeepGuard AI Engine started!")


# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────
class Transaction(BaseModel):
    timestamp: Optional[str] = None
    from_bank: Optional[str] = None
    account: Optional[str] = None
    to_bank: Optional[str] = None
    to_account: Optional[str] = None
    amount_paid: float = Field(0.0, ge=0)
    payment_currency: Optional[str] = "USD"
    amount_received: float = Field(0.0, ge=0)
    receiving_currency: Optional[str] = "USD"
    payment_format: Optional[str] = "Wire"
    transaction_id: Optional[str] = None

    # Sender/receiver behavioral aggregates. These were engineered from full
    # transaction history in the training notebook (a single incoming
    # transaction doesn't carry this by itself). The Node backend/DB layer
    # should compute and pass these when available (e.g. from a rolling
    # window of that account's recent activity); sensible "first-seen
    # account" defaults are used otherwise so the API never crashes.
    sender_tx_count: Optional[int] = 1
    sender_avg_amount: Optional[float] = None
    sender_unique_receivers: Optional[int] = 1
    sender_total_amount: Optional[float] = None
    sender_max_amount: Optional[float] = None
    receiver_tx_count: Optional[int] = 1


class BatchAnalysisRequest(BaseModel):
    transactions: List[Transaction]
    job_id: Optional[str] = None


class SingleTransactionRequest(BaseModel):
    transaction: Transaction


class AnalysisResult(BaseModel):
    transaction_id: str
    risk_score: float
    risk_level: str
    is_fraud: bool
    isolation_forest_score: float
    autoencoder_score: float
    xgboost_score: float
    fraud_category: str
    shap_values: Optional[Dict[str, float]] = None
    processing_time_ms: float


# ─────────────────────────────────────────────
# Feature Engineering (matches notebook)
# ─────────────────────────────────────────────
PAYMENT_FORMAT_MAP = {
    "Cheque": 0, "ACH": 1, "Wire": 2, "Reinvestment": 3,
    "Credit Card": 4, "Bitcoin": 5, "Cash": 6
}
CURRENCY_MAP = {
    "USD": 0, "EUR": 1, "GBP": 2, "JPY": 3, "AUD": 4,
    "CAD": 5, "CHF": 6, "CNY": 7, "BTC": 8, "ETH": 9
}


def engineer_features(transactions: List[Transaction]) -> np.ndarray:
    """
    Convert transaction objects into the feature matrix the models expect.

    IMPORTANT: this must produce the *same* columns, in the *same* order, as
    `feature_cols` from model_metadata.json / feature_cols.pkl — that's what
    the scaler and every model were fit on. We build a name->value dict per
    transaction and then select from it using registry.feature_cols, so the
    function stays correct even if a future retrain changes column order.
    """
    feature_cols = registry.feature_cols
    rows = []
    for tx in transactions:
        try:
            ts = pd.to_datetime(tx.timestamp) if tx.timestamp else pd.Timestamp.now()
        except Exception:
            ts = pd.Timestamp.now()

        amount_paid = float(tx.amount_paid)
        amount_received = float(tx.amount_received)
        amount_ratio = amount_paid / (amount_received + 1e-9)
        amount_diff = amount_paid - amount_received
        log_paid = np.log1p(amount_paid)
        log_received = np.log1p(amount_received)
        is_round = 1 if (amount_paid > 0 and amount_paid % 100 == 0) else 0

        hour = int(ts.hour)
        dow = int(ts.dayofweek)
        month = int(ts.month)
        is_weekend = 1 if dow >= 5 else 0
        is_night = 1 if (hour >= 22 or hour <= 5) else 0

        pf_enc = PAYMENT_FORMAT_MAP.get(tx.payment_format, 2)
        pc_enc = CURRENCY_MAP.get(tx.payment_currency, 0)
        rc_enc = CURRENCY_MAP.get(tx.receiving_currency, 0)

        sender_avg = tx.sender_avg_amount if tx.sender_avg_amount is not None else amount_paid
        sender_total = tx.sender_total_amount if tx.sender_total_amount is not None else amount_paid
        sender_max = tx.sender_max_amount if tx.sender_max_amount is not None else amount_paid

        values = {
            "Amount Paid": amount_paid,
            "Amount Received": amount_received,
            "Amount_Ratio": amount_ratio,
            "Amount_Diff": amount_diff,
            "Log_Amount_Paid": log_paid,
            "Log_Amount_Recv": log_received,
            "Is_Round_Amount": is_round,
            "Hour": hour,
            "DayOfWeek": dow,
            "Month": month,
            "IsWeekend": is_weekend,
            "IsNightTx": is_night,
            "Payment Format_enc": pf_enc,
            "Payment Currency_enc": pc_enc,
            "Receiving Currency_enc": rc_enc,
            "Sender_TX_Count": tx.sender_tx_count or 1,
            "Sender_Avg_Amount": sender_avg,
            "Sender_Unique_Receivers": tx.sender_unique_receivers or 1,
            "Sender_Total_Amount": sender_total,
            "Sender_Max_Amount": sender_max,
            "Receiver_TX_Count": tx.receiver_tx_count or 1,
        }

        row = [values.get(col, 0.0) for col in feature_cols]
        rows.append(row)

    return np.array(rows, dtype=np.float64)


def get_fraud_category(risk_score: float, payment_format: str, amount_diff: float) -> str:
    """Categorize fraud type based on patterns."""
    if risk_score < 0.3:
        return "Clean"
    elif payment_format == "Bitcoin" and risk_score > 0.7:
        return "Cryptocurrency Laundering"
    elif abs(amount_diff) < 1.0 and risk_score > 0.6:
        return "Circular Transaction"
    elif risk_score > 0.85:
        return "High-Risk AML Typology"
    elif risk_score > 0.7:
        return "Suspicious Layering"
    elif risk_score > 0.5:
        return "Unusual Transfer Volume"
    else:
        return "Low-Risk Anomaly"


def compute_shap_for_transaction(X_scaled: np.ndarray, feature_cols: list) -> Dict[str, float]:
    """Compute SHAP feature importance for a single transaction.

    Explains the XGBoost model (the primary/highest-weighted model in the
    ensemble) when available, since that's what's actually driving most of
    the risk score; falls back to the Isolation Forest for explainability
    if XGBoost isn't loaded.
    """
    try:
        import shap
        if not registry.is_demo_mode():
            explain_model = registry.xgboost_model if registry.xgboost_model is not None \
                else registry.isolation_forest
            explainer = shap.TreeExplainer(explain_model)
            shap_vals = explainer.shap_values(X_scaled)
            if isinstance(shap_vals, list):
                shap_vals = shap_vals[0]
            # Take absolute values and normalize
            abs_shap = np.abs(shap_vals).flatten()
            total = abs_shap.sum() + 1e-9
            shap_dict = {
                feat: round(float(abs_shap[i] / total), 4)
                for i, feat in enumerate(feature_cols)
                if i < len(abs_shap)
            }
            return dict(sorted(shap_dict.items(), key=lambda x: x[1], reverse=True)[:8])
    except Exception as e:
        logger.warning(f"SHAP computation failed: {e}")

    # Fallback: return rule-based feature importance
    feature_idx = {f: i for i, f in enumerate(feature_cols)}
    amounts = float(X_scaled[0][0]) if len(X_scaled[0]) > 0 else 0.5
    return {
        "Amount Paid": round(amounts * 0.4, 4),
        "Amount_Ratio": round(0.2, 4),
        "Log_Amount_Paid": round(0.15, 4),
        "Amount_Diff": round(0.1, 4),
        "Payment Format_enc": round(0.08, 4),
        "Hour": round(0.04, 4),
        "DayOfWeek": round(0.02, 4),
        "Receiving Currency_enc": round(0.01, 4)
    }


def analyze_transactions(transactions: List[Transaction]) -> List[AnalysisResult]:
    """Core analysis function — runs IF + AE + SHAP."""
    start = time.time()

    # Feature engineering
    X_raw = engineer_features(transactions)

    if not registry.is_demo_mode():
        # Scale (using the *same* fitted scaler + column order used at training time)
        X_scaled = registry.scaler.transform(X_raw)

        # ── Isolation Forest — normalized using the fixed train-set range
        # saved at training time (a single-row batch has no min/max of its
        # own to normalize against, which was the previous bug) ──
        if_raw_scores = registry.isolation_forest.decision_function(X_scaled)
        if_lo, if_hi = registry.if_score_min, registry.if_score_max
        if_normalized = np.clip(1 - (if_raw_scores - if_lo) / (if_hi - if_lo + 1e-9), 0, 1)

        # ── Autoencoder ──
        X_pred = registry.autoencoder.predict(X_scaled, verbose=0)
        ae_mse = np.mean(np.power(X_scaled - X_pred, 2), axis=1)
        ae_normalized = np.clip(ae_mse / (registry.ae_threshold * 3), 0, 1)

        # ── XGBoost (supervised — primary driver of the risk score) ──
        if registry.xgboost_model is not None:
            xgb_normalized = registry.xgboost_model.predict_proba(X_scaled)[:, 1]
        else:
            xgb_normalized = np.zeros(len(transactions))

    else:
        # Demo mode — deterministic pseudo-random scores
        np.random.seed(42)
        if_normalized = np.clip(np.random.beta(2, 5, len(transactions)), 0, 1)
        ae_normalized = np.clip(np.random.beta(2, 5, len(transactions)), 0, 1)
        xgb_normalized = np.clip(np.random.beta(2, 5, len(transactions)), 0, 1)
        X_scaled = X_raw

    # Ensemble — weights come from model_metadata.json (data-driven, tuned on
    # a held-out validation split during training; see saved_models/README).
    w = registry.ensemble_weights
    ensemble_scores = (
        w.get("xgboost", 0.85) * xgb_normalized
        + w.get("autoencoder", 0.15) * ae_normalized
        + w.get("isolation_forest", 0.0) * if_normalized
    )
    threshold = registry.ensemble_threshold

    results = []
    for i, tx in enumerate(transactions):
        risk = float(ensemble_scores[i])

        # Risk-level bands are spaced relative to the fitted decision
        # threshold rather than fixed absolute numbers, so they stay
        # meaningful if the model/threshold is retrained later.
        if risk >= max(threshold * 1.3, threshold + 0.15):
            risk_level = "Critical"
        elif risk >= threshold:
            risk_level = "High"
        elif risk >= threshold * 0.5:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        is_fraud = risk >= threshold

        amount_diff = tx.amount_paid - tx.amount_received
        category = get_fraud_category(risk, tx.payment_format or "Wire", amount_diff)

        # SHAP (only for medium-risk-and-above or explicitly requested — it's
        # the most expensive step per transaction)
        shap_vals = None
        if risk >= threshold * 0.5:
            shap_vals = compute_shap_for_transaction(X_scaled[i:i+1], registry.feature_cols)

        tx_id = tx.transaction_id or f"TX-{i+1:05d}"

        proc_ms = (time.time() - start) * 1000 / max(len(transactions), 1)

        results.append(AnalysisResult(
            transaction_id=tx_id,
            risk_score=round(risk * 100, 2),       # 0–100
            risk_level=risk_level,
            is_fraud=is_fraud,
            isolation_forest_score=round(float(if_normalized[i]) * 100, 2),
            autoencoder_score=round(float(ae_normalized[i]) * 100, 2),
            xgboost_score=round(float(xgb_normalized[i]) * 100, 2),
            fraud_category=category,
            shap_values=shap_vals,
            processing_time_ms=round(proc_ms, 2)
        ))

    return results


# ─────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "DeepGuard AI Engine",
        "version": "1.0.0",
        "status": "running",
        "demo_mode": registry.is_demo_mode(),
        "models_loaded": registry._models_loaded,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models": {
            "isolation_forest": not registry.is_demo_mode(),
            "autoencoder": not registry.is_demo_mode(),
            "scaler": not registry.is_demo_mode()
        },
        "demo_mode": registry.is_demo_mode(),
        "performance": registry.metadata.get("model_performance", {})
    }


@app.post("/analyze/batch", response_model=Dict[str, Any])
async def analyze_batch(request: BatchAnalysisRequest):
    """
    Analyze a batch of transactions.
    Returns fraud scores, risk levels, and SHAP explanations.
    """
    if len(request.transactions) == 0:
        raise HTTPException(status_code=400, detail="No transactions provided")

    if len(request.transactions) > 100000:
        raise HTTPException(status_code=400, detail="Max 100,000 transactions per batch")

    start = time.time()
    logger.info(f"📥 Batch analysis: {len(request.transactions)} transactions | Job: {request.job_id}")

    try:
        results = analyze_transactions(request.transactions)
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    total_ms = (time.time() - start) * 1000
    flagged = [r for r in results if r.is_fraud]
    critical = [r for r in results if r.risk_level == "Critical"]

    return {
        "job_id": request.job_id,
        "status": "completed",
        "summary": {
            "total_transactions": len(results),
            "flagged_count": len(flagged),
            "critical_count": len(critical),
            "clean_count": len(results) - len(flagged),
            "flagging_rate_pct": round(len(flagged) / max(len(results), 1) * 100, 2),
            "processing_time_ms": round(total_ms, 2),
            "demo_mode": registry.is_demo_mode()
        },
        "results": [r.dict() for r in results],
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/analyze/single", response_model=Dict[str, Any])
async def analyze_single(request: SingleTransactionRequest):
    """Analyze a single transaction with full SHAP explanation."""
    try:
        results = analyze_transactions([request.transaction])
        result = results[0]
        # Always compute SHAP for single analysis
        X_raw = engineer_features([request.transaction])
        X_scaled = registry.scaler.transform(X_raw) if not registry.is_demo_mode() else X_raw
        result.shap_values = compute_shap_for_transaction(X_scaled, registry.feature_cols)
        return {"result": result.dict(), "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models/info")
async def model_info():
    """Return model metadata and performance metrics."""
    return {
        "demo_mode": registry.is_demo_mode(),
        "features": registry.feature_cols,
        "n_features": len(registry.feature_cols),
        "metadata": registry.metadata
    }


# ─────────────────────────────────────────────
# FR-14: Manage AI Models (Admin)
# Lets an admin view/adjust the ensemble threshold and per-model weights
# at runtime, without retraining. Changes are held in memory for the life
# of the process and persisted back to model_metadata.json so they survive
# a restart. This does NOT retrain any model — it only changes how the
# already-trained model scores are combined and thresholded.
# ─────────────────────────────────────────────
class ModelConfigUpdate(BaseModel):
    ensemble_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    ensemble_weights: Optional[Dict[str, float]] = None


@app.get("/models/config")
async def get_model_config():
    """Return the currently active, adjustable model configuration."""
    return {
        "ensemble_threshold": registry.ensemble_threshold,
        "ensemble_weights": registry.ensemble_weights,
        "ae_threshold": registry.ae_threshold,
    }


@app.patch("/models/config")
async def update_model_config(update: ModelConfigUpdate):
    """
    Admin-only in practice (the Node.js gateway's requireAdmin middleware
    should sit in front of whatever route proxies to this endpoint — the
    AI engine itself has no auth, matching the rest of this service).
    """
    if registry.is_demo_mode():
        raise HTTPException(status_code=400, detail="Cannot update config in demo mode (no models loaded)")

    if update.ensemble_threshold is not None:
        registry.ensemble_threshold = update.ensemble_threshold
        registry.metadata["ensemble_threshold"] = update.ensemble_threshold

    if update.ensemble_weights is not None:
        total = sum(update.ensemble_weights.values())
        if abs(total - 1.0) > 0.01:
            raise HTTPException(status_code=400, detail=f"ensemble_weights must sum to 1.0 (got {total:.3f})")
        registry.ensemble_weights = update.ensemble_weights
        registry.metadata["ensemble_weights"] = update.ensemble_weights

    # Persist so the new config survives a restart
    try:
        MODEL_PATH = os.getenv("MODEL_PATH", "./saved_models")
        meta_path = os.path.join(MODEL_PATH, "model_metadata.json")
        with open(meta_path, "w") as f:
            json.dump(registry.metadata, f, indent=2)
    except Exception as e:
        logger.warning(f"Config updated in memory but failed to persist to disk: {e}")

    logger.info(f"⚙️  Model config updated: threshold={registry.ensemble_threshold:.4f}, "
                f"weights={registry.ensemble_weights}")

    return {
        "ensemble_threshold": registry.ensemble_threshold,
        "ensemble_weights": registry.ensemble_weights,
        "message": "Configuration updated"
    }
