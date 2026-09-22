# 🛡️ DeepGuard — AI-Driven Financial Forensics Platform

> Final Year Project | Iqra University, CS Batch 2023
> Supervisor:

A full-stack Anti-Money-Laundering (AML) detection platform: a supervised + unsupervised
ensemble (Isolation Forest, Autoencoder, XGBoost) trained on IBM's synthetic AML dataset,
served via a Python AI microservice, orchestrated by a Node.js API gateway, and visualized
through a React dashboard with an interactive transaction-network graph.

---

## 📁 Project Structure

```
final_deepguard_fyp_project/
├── notebooks/                        # Google Colab training notebooks — run in order
│   ├── 01_EDA_and_Preprocessing.ipynb
│   ├── 02_Model_Training_and_Evaluation.ipynb   # Isolation Forest + Autoencoder + XGBoost ensemble
│   └── 03_GNN_Model.ipynb                       # Graph Neural Network (research result — see Known Limitations)
│
├── preprocessed/                     # Small artifacts committed to git
│   ├── scaler.pkl
│   ├── feature_cols.pkl
│   ├── y_train.npy / y_test.npy
│   └── X_train.npy / X_test.npy      # 🚫 NOT in git (too large) — regenerate via Notebook 1, see below
│
├── ai-engine/                        # Python FastAPI — AI microservice
│   ├── main.py                       # loads saved_models/, exposes /analyze, /health, /models/info
│   ├── requirements.txt
│   ├── start.sh
│   ├── .env.example
│   └── saved_models/                 # trained model artifacts (committed — see saved_models/README.md)
│       ├── isolation_forest.pkl
│       ├── autoencoder.keras / autoencoder.h5
│       ├── xgboost_model.json        # primary model — 85% ensemble weight
│       ├── scaler.pkl / feature_cols.pkl / model_metadata.json
│       ├── meta_ensemble.pkl         # alternative combiner explored, not deployed
│       ├── deepguard_gnn_saved_model/ # GNN artifacts — not yet loaded by main.py
│       └── *.png, shap_importance.json  # evaluation plots for the FYP report
│
├── backend-node/                     # Node.js + Express — API Gateway
│   ├── src/
│   │   ├── config/mongodb.js
│   │   ├── controllers/              # upload, analysis, graph, report, admin
│   │   ├── middleware/                # auth, error handling
│   │   ├── models/                   # Job, Transaction (Mongoose)
│   │   ├── routes/
│   │   └── server.js
│   ├── uploads/                      # runtime file uploads — empty in git (.gitkeep)
│   ├── reports/                      # generated PDF reports — empty in git (.gitkeep)
│   ├── package.json
│   ├── start.sh
│   └── .env.example
│
└── frontend/                         # React.js + Tailwind CSS
    ├── src/
    │   ├── components/
    │   ├── pages/                    # Login, Dashboard, Upload, Analysis, Graph, Reports, Admin
    │   ├── store/                    # Redux
    │   └── utils/api.js
    ├── package.json
    ├── vite.config.js
    └── .env.example
```

_(The `ai-engine/models/` and `ai-engine/utils/` split shown in earlier drafts of this README
doesn't reflect reality — everything is in the single `main.py` file. The tree above matches
what's actually in the repo.)_

---

## 🚀 Quick Start

Full step-by-step instructions, including Supabase/MongoDB setup and free LLM options for
report generation, are in **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**. Short version:

### 1. Trained models are already included

`ai-engine/saved_models/` ships with trained Isolation Forest, Autoencoder, and XGBoost models
committed to this repo — **you don't need to retrain anything to run the app.** Retraining
(via `notebooks/`) is only needed if you want to reproduce or improve the models yourself.

### 2. AI Engine (Python FastAPI)

```bash
cd ai-engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive API docs, or `http://localhost:8000/health`
to confirm models loaded (`"demo_mode": false` means the real models are active).

### 3. Node.js Backend

```bash
cd backend-node
cp .env.example .env   # fill in MongoDB URI + Supabase keys — see SETUP_GUIDE.md
npm install
npm run dev
```

**Requires MongoDB running first** — the server will not start (by design — it fails fast
with a clear error) until it can connect.

### 4. React Frontend

```bash
cd frontend
cp .env.example .env   # fill in Supabase keys
npm install
npm run dev
```

### 5. Retraining from scratch (optional)

Download `HI-Small_Trans.csv` from
[Kaggle](https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml)
(476 MB, ~5.08M transactions — note the hyphen in the filename) and follow `notebooks/01` → `02`
→ (optionally) `03` in Google Colab. Full instructions in `SETUP_GUIDE.md`. The large dataset
CSV and the preprocessed `X_train.npy`/`X_test.npy` arrays are `.gitignore`d — too large for
GitHub — so they're regenerated locally/in Colab, not pulled from this repo.

---

## ✅ Verified Working

The following was directly tested end-to-end, not just read for correctness:

| Layer                | What was checked                                                                                                                                            | Result                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AI Engine            | Started the real FastAPI server against the actual committed model files, hit `/health`, `/analyze/single`, `/analyze/batch`, `/models/info` over real HTTP | ✅ All respond correctly, including SHAP explanations                                  |
| AI Engine            | Malformed/empty transaction input                                                                                                                           | ✅ Handled gracefully with sensible defaults, no crash                                 |
| backend-node         | `npm install`, syntax-check on every file, integration payload shape vs. `ai-engine`'s `Transaction` model                                                  | ✅ Installs clean, all files valid, field names match exactly                          |
| backend-node         | Behavior when MongoDB is unreachable                                                                                                                        | ✅ Fails fast with a clear error (by design), doesn't hang or crash silently           |
| frontend             | `npm install`, `npm run build`                                                                                                                              | ✅ Builds clean (one non-fatal "bundle size" warning, common for React apps this size) |
| Cross-service config | Ports/URLs across all three `.env.example` files (frontend → 4000, backend → 8000)                                                                          | ✅ Consistent                                                                          |

**Not verified** (needs live credentials this environment doesn't have): full MongoDB-backed
request flow, Supabase auth, PDF report generation via Puppeteer, Groq/Ollama report
summarization. These should work if configured per `SETUP_GUIDE.md`, but weren't exercised
end-to-end here.

---

## 📊 Model Performance

From `ai-engine/saved_models/model_metadata.json`, evaluated on a held-out test split of the
full `HI-Small` dataset (~1.02M transactions, ~0.10% fraud rate):

| Model                                             | ROC-AUC   | Avg. Precision |
| ------------------------------------------------- | --------- | -------------- |
| Isolation Forest                                  | 0.712     | 0.002          |
| Autoencoder                                       | 0.535     | 0.001          |
| **XGBoost**                                       | **0.984** | **0.440**      |
| **Ensemble** (85% XGBoost + 15% Isolation Forest) | 0.930     | 0.401          |

Ensemble F1 (fraud class): **0.456**.

XGBoost — trained directly on the fraud labels, which Isolation Forest and the Autoencoder
don't use — does almost all of the work here; the other two remain in the pipeline mainly for
SHAP explainability and as an unsupervised signal for patterns not present in labeled training
data. This is normal for this dataset: 5 million transactions with roughly 1 in 1,000 flagged
as laundering is an extreme imbalance, and average precision in the 0.4 range on data this
skewed represents real, usable signal — not a modeling shortfall. (A separate note in this
repo's history claimed an "original baseline" of ROC-AUC 0.91 / AP 0.05 for comparison — that
number was computed on a much smaller ~170K-row test sample, not this dataset, and isn't a
fair before/after comparison. If you want a genuine baseline for your report, that requires
re-running an unsupervised-only version on this same full dataset.)

---

## 🧠 Tech Stack

| Layer     | Technology                                                     |
| --------- | -------------------------------------------------------------- |
| Frontend  | React.js, Tailwind CSS, Redux, Cytoscape.js, Recharts          |
| Backend   | Node.js, Express.js, Puppeteer                                 |
| AI Engine | Python, FastAPI, Scikit-learn, XGBoost, TensorFlow/Keras, SHAP |
| Research  | PyTorch Geometric (GNN — trained, not yet deployed)            |
| Database  | MongoDB (`$graphLookup`), Supabase (PostgreSQL)                |
| Auth      | Supabase Auth + JWT                                            |
| Report AI | Groq (free) / Ollama (local) / OpenAI (optional)               |

---

## ⚠️ Known Limitations

Worth stating plainly in your report/defense rather than leaving for a supervisor to find:

1. **The GNN model (Notebook 3) is trained and saved but not wired into the live API.**
   `ai-engine/saved_models/deepguard_gnn_saved_model/` exists; `main.py` doesn't load it.
   The running app scores every transaction with Isolation Forest + Autoencoder + XGBoost
   only. Treat the GNN result as a research/comparison finding for your write-up, not a
   description of what the deployed system does — unless you wire it in first.
2. **`Sender_*`/`Receiver_*` behavioral features default to "first-seen account" values in
   production.** These were computed from full transaction history during training, but a
   single incoming API request doesn't carry that history. `backend-node`'s
   `parseIBMAMLRow()` doesn't currently compute or send real rolling stats, so every live
   request gets the same defaults `main.py` falls back to. Fine for a demo; worth noting as
   future work for a real deployment.
3. **The ensemble is tuned for `HI-Small_Trans.csv` specifically.** The other IBM AML files
   (`LI-Small`, `HI-Medium`, etc.) are different synthetic "worlds" with different accounts —
   don't feed them into this trained model expecting comparable results.
4. **`ai-engine/saved_models/model_metadata.json`'s `baseline_performance_for_comparison`
   field is stale** (see Model Performance above) — computed on a different, smaller dataset,
   not a valid before/after comparison for the numbers actually shown in this repo.

---

_DeepGuard — Iqra University CS Batch 2023 | Supervised by Dr. Dure e Jabeen_
