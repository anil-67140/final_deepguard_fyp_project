# 🛡️ DeepGuard — AI-Driven Financial Forensics Platform

> Final Year Project | Iqra University, CS Batch 2023
> Supervisor:

---

## 📁 Project Structure

```
deepguard/
├── notebooks/                  # Google Colab training notebooks
│   ├── 01_EDA_and_Preprocessing.ipynb
│   ├── 02_Model_Training_and_Evaluation.ipynb
|   └── 03_GNN_Model.ipynb
|
├── ai-engine/                  # Python FastAPI — AI microservice
│   ├── main.py
│   ├── models/
│   │   ├── isolation_forest.py
│   │   └── autoencoder.py
|   |    __
│   ├── utils/
│   │   ├── shap_explainer.py
│   │   └── preprocessor.py
│   ├── requirements.txt
│   └── .env.example
├── backend-node/               # Node.js + Express — API Gateway
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   └── utils/
│   ├── package.json
│   └── .env.example
└── frontend/                   # React.js + Tailwind CSS
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── store/
    │   └── utils/
    ├── package.json
    └── .env.example
```

---

## 🚀 Quick Start

### 1. Dataset

Download **IBM AML (Anti Money Laundering) dataset** from Kaggle:

- https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml
- Place CSV files in `ai-engine/data/`

### 2. Google Colab (Model Training)

- Upload `notebooks/` to Google Drive
- Run in order: EDA → Training
- Download trained model weights to `ai-engine/saved_models/`

### 3. AI Engine (Python FastAPI)

```bash
cd ai-engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Node.js Backend

```bash
cd backend-node
npm install
npm run dev
```

### 5. React Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` in each service and fill in your values.

### Free AI for Report Generation

- Uses **Ollama (local)** with `llama3` model as FREE alternative
- OR uses **Groq API** (free tier, very fast) with `llama3-8b-8192`
- OpenAI key is optional — system works without it

---

## 🧠 Tech Stack

| Layer     | Technology                                            |
| --------- | ----------------------------------------------------- |
| Frontend  | React.js, Tailwind CSS, Redux, Cytoscape.js, Recharts |
| Backend   | Node.js, Express.js, Puppeteer                        |
| AI Engine | Python, FastAPI, Scikit-learn, TensorFlow/Keras, SHAP |
| Database  | MongoDB ($graphLookup), Supabase (PostgreSQL)         |
| Auth      | Supabase Auth + JWT                                   |
| Report AI | Groq (free) / Ollama (local) / OpenAI (optional)      |
