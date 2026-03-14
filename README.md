# 🏥 Hospital Management System (HMS)

A comprehensive, full-stack Hospital Management System with an intelligent **Triage & Priority Engine**, three RBAC portals, emergency management, patient tracking, and integrated billing.

---

## 📁 Project Structure

```
project/
├── db/
│   └── schema.sql              # Full MySQL 8.0 schema (12 tables + triggers)
│
├── backend/
│   ├── priority_engine.py      # FastAPI backend: Priority Engine + all API routes
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment variable template
│   └── test_priority.py        # Unit tests for the Priority Engine
│
└── frontend/
    └── src/
        ├── AdminDashboard.jsx  # Admin portal (React)
        ├── AdminDashboard.css  # Dark-mode admin styling
        ├── PatientPortal.jsx   # Patient self-service portal (React)
        └── PatientPortal.css   # Light-mode patient styling
```

---

## ⚡ Quick Start

### 1. Database Setup (MySQL)
```bash
# Create the database (run in MySQL client)
mysql -u root -p -e "CREATE DATABASE hms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Apply the schema (includes all tables, triggers, and seed data)
mysql -u root -p hms_db < db/schema.sql
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env         # Windows
# cp .env.example .env         # macOS/Linux
# → Edit .env with your MySQL credentials

# Run the API server
python priority_engine.py
# → API available at http://localhost:8000
# → Interactive docs at http://localhost:8000/docs
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies (assumes Create React App or Vite project)
npm install

# Set API URL
echo "REACT_APP_API_URL=http://localhost:8000" > .env.local

# Start development server
npm start
```

---

## 🧠 Priority Engine

The core triage algorithm:

$$P = S + (T \times 0.5)$$

| Severity  | Weight (S) |
|-----------|-----------|
| 🔴 Critical | 100 |
| 🟡 Moderate | 50  |
| 🟢 Normal   | 20  |

`T` = minutes elapsed since patient arrival. The queue **re-sorts every 20 seconds** automatically.

> 💡 Internal scores are never exposed to UI. Patients only see **Queue Position** and **Estimated Wait Time**.

---

## 🗂️ Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/opd/register` | Register patient → auto-assigns doctor by symptom |
| `GET`  | `/api/opd/queue` | Live priority-sorted queue |
| `POST` | `/api/opd/refresh-queue` | Force priority recalculation |
| `GET`  | `/api/opd/patient/{id}/status` | Patient's own queue position |
| `POST` | `/api/emergency/request` | Submit emergency → alert admin + generate PDF |
| `GET`  | `/api/emergency/active` | All active emergencies (Admin) |
| `GET`  | `/api/patient/{id}/tracking` | Admission tracking with color status |
| `POST` | `/api/billing/items` | Add charges to a bill |
| `POST` | `/api/billing/pay` | Process payment + generate receipt PDF |
| `GET`  | `/api/admin/dashboard-stats` | Live stats for admin dashboard |

Full interactive docs: **http://localhost:8000/docs**

---

## 🩺 Patient Status Tracking

| Colour | Status | Meaning |
|--------|--------|---------|
| 🔴 Red | `icu` | Intensive Care Unit |
| 🟡 Yellow | `under_treatment` | Being treated |
| 🔵 Blue | `admitted` | Admitted, stable |
| 🟢 Green | `discharged` | Discharged |

---

## 📄 PDF Generation

PDFs are generated automatically in the background via **ReportLab** and saved to the **local filesystem**:

- **Emergency Intake Document** → triggered on every ambulance request → saved to `pdfs/emergency/`
- **Digital Receipt** → triggered after each payment → saved to `pdfs/receipts/`

PDFs are served back to the UI via the FastAPI static mount at `/files/...`.  
Set `PDF_STORAGE_DIR` in `.env` to change the storage location (default: `./pdfs`).

---

## 🧪 Running Tests

```bash
cd project
pytest backend/test_priority.py -v
```

Tests cover:
- Priority score calculations at various severities and wait times
- Queue sort order logic
- Edge case: Normal patient overtaking Critical after long wait
- Symptom keyword normalisation
- Color-status mapping for all 4 patient states

---

## 🔐 RBAC Portals

| Role | Access |
|------|--------|
| **Admin** | Dashboard stats, OPD management, emergency oversight, billing overview |
| **Doctor** | Assigned queue view, patient notes, consultation start/complete |
| **Patient** | OPD queue position, admission tracking, health records, bills & payments |

---

## 🗄️ Database Schema Overview

```
users ──────── roles (admin│doctor│patient)
patients ────── opd_queue ──── specialties ◄── symptom_map
doctors ──────┘               ↑
                              │
admissions ←── opd_queue      │
bills ◄─── bill_items         │
       └── payments           │
                              │
emergency_requests ───────────┘
admin_alerts
documents (PDF storage links)
audit_log
```

---

## ⚙️ Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL async connection string (`mysql+aiomysql://...`) |
| `PDF_STORAGE_DIR` | Local directory for generated PDFs (default: `./pdfs`) |
| `JWT_SECRET_KEY` | Secret for JWT token signing |
| `TOTAL_BEDS` | Total hospital bed capacity (for occupancy %) |
| `AVG_CONSULT_MINUTES` | Average consultation time for wait estimation |
