# 🛡️ DeepGuard — Complete Setup Guide
> **Iqra University FYP 2023** | Dr. Dure e Jabeen

---

## ✅ Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://python.org |
| MongoDB | 7+ (local) | https://www.mongodb.com/try/download/community |
| Git | any | https://git-scm.com |

---

## 🗂️ Project Structure Summary

```
deepguard/
├── 📓 notebooks/          ← Google Colab (train AI models)
├── 🤖 ai-engine/          ← Python FastAPI (AI microservice)
├── ⚙️  backend-node/      ← Node.js Express (API gateway)
└── 🌐 frontend/           ← React.js (dashboard)
```

---

## 📋 STEP-BY-STEP SETUP

### STEP 1 — Supabase (Free Auth + Database)

1. Go to **https://supabase.com** → Create account → New project
2. Go to **Project Settings → API**
3. Copy:
   - `Project URL` → used as `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon public` key → used as `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → used as `SUPABASE_SERVICE_KEY`
4. Go to **SQL Editor** → Run this to create demo users:

```sql
-- Create demo admin user
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
VALUES (
  gen_random_uuid(),
  'admin@deepguard.demo',
  crypt('deepguard123', gen_salt('bf')),
  NOW(),
  '{"role": "admin"}'::jsonb
);

-- Create demo auditor user
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
VALUES (
  gen_random_uuid(),
  'auditor@deepguard.demo',
  crypt('deepguard123', gen_salt('bf')),
  NOW(),
  '{"role": "auditor"}'::jsonb
);
```

---

### STEP 2 — Free AI for Reports (choose ONE)

#### Option A: Groq API (RECOMMENDED — Free, Fast, No credit card)
1. Go to **https://console.groq.com**
2. Sign up → Create API key (completely free)
3. Add to `backend-node/.env`:
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```

#### Option B: Ollama (100% Local — No internet needed)
1. Download from **https://ollama.ai**
2. Install and run:
   ```bash
   ollama serve          # starts Ollama server
   ollama pull llama3    # download model (~4GB)
   ```
3. Add to `backend-node/.env`:
   ```
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=llama3
   ```

#### Option C: OpenAI (Paid — optional)
```
OPENAI_API_KEY=sk-your-key-here
```

> **Note:** If none are set, DeepGuard generates reports with a built-in rule-based summary. Everything else still works perfectly.

---

### STEP 3 — Train AI Models (Google Colab)

1. Go to **https://colab.research.google.com**
2. Upload both notebooks from `notebooks/` folder
3. Download IBM AML dataset from Kaggle:
   - https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml
   - Use `HI_Small_Trans.csv` (smaller) or `LI_Small_Trans.csv`
4. Run **Notebook 1** (`01_EDA_and_Preprocessing.ipynb`) completely
5. Run **Notebook 2** (`02_Model_Training_and_Evaluation.ipynb`) completely
6. At the end, a `deepguard_models.zip` will download automatically
7. Extract and copy contents into `ai-engine/saved_models/`

```
ai-engine/saved_models/
├── isolation_forest.pkl
├── autoencoder.keras
├── scaler.pkl
├── feature_cols.pkl
└── model_metadata.json
```

> **Note:** If you skip this step, the AI engine runs in **DEMO MODE** — it still works but uses random predictions. Perfect for testing the UI!

---

### STEP 4 — Configure Environment Variables

#### `ai-engine/.env`
```env
MODEL_PATH=./saved_models
PORT=8000
```

#### `backend-node/.env`
```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/deepguard
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
AI_ENGINE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
GROQ_API_KEY=gsk_your_key_here        # OR
# OLLAMA_URL=http://localhost:11434    # OR
# OPENAI_API_KEY=sk-...               # optional
```

#### `frontend/.env`
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

---

### STEP 5 — Start MongoDB

```bash
# Windows
net start MongoDB

# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

---

### STEP 6 — Start All Services

#### Option A: One command (recommended)
```bash
cd deepguard
bash start-all.sh
```

#### Option B: Manual (3 separate terminals)

**Terminal 1 — AI Engine**
```bash
cd deepguard/ai-engine
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Node.js Backend**
```bash
cd deepguard/backend-node
npm install
npm run dev
```

**Terminal 3 — React Frontend**
```bash
cd deepguard/frontend
npm install
npm run dev
```

---

### STEP 7 — Access the App

| Service | URL |
|---------|-----|
| 🌐 Frontend Dashboard | http://localhost:5173 |
| ⚙️  Backend API | http://localhost:4000/api |
| 🤖 AI Engine | http://localhost:8000 |
| 📖 AI API Docs | http://localhost:8000/docs |

**Login credentials (demo):**
- Admin: `admin@deepguard.demo` / `deepguard123`
- Auditor: `auditor@deepguard.demo` / `deepguard123`

---

## 🧪 Testing Without Real Data

1. Login with demo credentials
2. Click **"Demo Auditor"** or **"Demo Admin"** on login page
3. Dashboard shows mock data immediately
4. Upload any CSV file — AI engine processes it (demo mode = random scores)
5. Network graph shows demo circular transaction pattern
6. PDF report generates with rule-based summary

---

## 🐛 Common Issues

| Issue | Fix |
|-------|-----|
| MongoDB connection error | Make sure MongoDB is running: `mongod --dbpath /data/db` |
| Supabase auth error | Check SUPABASE_URL and keys in `.env` files |
| AI Engine 503 | Start `uvicorn main:app --reload` in `ai-engine/` |
| CORS error | Make sure FRONTEND_URL in backend `.env` matches port 5173 |
| Port in use | Change PORT in `.env` files |
| Puppeteer error on PDF | `npm install puppeteer` or use `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false` |

---

## 🏗️ Architecture Summary

```
React Frontend (5173)
    ↕ REST + Socket.IO
Node.js Backend (4000)
    ↕ REST API          ↕ MongoDB ($graphLookup)
Python FastAPI (8000)
    ↕ joblib/keras
Trained Models (pkl/keras files)
```

---

## 📊 IBM AML Dataset Info

| File | Size | Transactions |
|------|------|-------------|
| HI_Small_Trans.csv | ~200MB | ~5.7M |
| LI_Small_Trans.csv | ~100MB | ~2.8M |
| HI_Medium_Trans.csv | ~2GB | ~57M |

Start with **HI_Small_Trans.csv** for testing.

---

*DeepGuard — Iqra University CS Batch 2023 | Supervised by Dr. Dure e Jabeen*
