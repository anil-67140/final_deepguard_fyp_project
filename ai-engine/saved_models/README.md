# saved_models/

Trained model artifacts, produced by the notebooks in `notebooks/`. These are committed to
this repo (they're small enough for GitHub) — you don't need to regenerate them just to run
the app, only if you want to retrain.

## Required for the AI engine to run in full (non-demo) mode
- `isolation_forest.pkl` — from Notebook 1 → 2
- `autoencoder.keras` (`autoencoder.h5` also present as a fallback — `main.py` tries `.keras`
  first) — from Notebook 2
- `xgboost_model.json` — from Notebook 2 (this is the primary model; the ensemble weights in
  `model_metadata.json` put 85% of the score on this one)
- `scaler.pkl`, `feature_cols.pkl` — from Notebook 1
- `model_metadata.json` — thresholds + ensemble weights, from Notebook 2

Without `isolation_forest.pkl` specifically, `main.py` falls back to **DEMO MODE**
(random predictions) so the rest of the app is still demo-able without any trained models.

## Present but NOT currently loaded by `main.py`
- `deepguard_gnn_saved_model/` — the GNN model from Notebook 3. Trained and evaluated, but
  **not yet wired into the live API** — `main.py` only scores with Isolation Forest +
  Autoencoder + XGBoost. See the root `README.md` "Known Limitations" section.
- `meta_ensemble.pkl` — an alternative stacked-logistic-regression combiner explored during
  training; the deployed ensemble uses the simpler weighted-average approach in
  `model_metadata.json` instead, since it performed at least as well.
- `*.png`, `shap_importance.json` — evaluation plots and SHAP output saved for the FYP report,
  not used at runtime.

See `../../SETUP_GUIDE.md` for full setup instructions.
