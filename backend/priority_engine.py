"""
priority_engine.py
==================
Hospital Management System – Core Backend Logic

Components:
  1. SymptomMatcher  – maps patient symptom text to a Specialty
  2. DoctorAssigner  – picks the best available doctor for a specialty
  3. PriorityEngine  – calculates P = S + (T × 0.5) and refreshes queue
  4. FastAPI routes  – OPD queue management endpoints

Requirements (pip install):
    fastapi uvicorn sqlalchemy aiomysql pymysql python-dotenv reportlab

Environment variables (see .env):
    DATABASE_URL=mysql+aiomysql://root:password@127.0.0.1:3306/hms_db
    PDF_STORAGE_DIR=./pdfs
"""

from __future__ import annotations

import os
import re
import uuid
import math
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles  # starlette dep, always available with fastapi
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# PDF storage directory (local filesystem)
# ---------------------------------------------------------------------------
PDF_STORAGE_DIR = os.getenv("PDF_STORAGE_DIR", "./pdfs")
os.makedirs(os.path.join(PDF_STORAGE_DIR, "emergency"), exist_ok=True)
os.makedirs(os.path.join(PDF_STORAGE_DIR, "receipts"),  exist_ok=True)

# ---------------------------------------------------------------------------
# Database setup  (MySQL via aiomysql)
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+aiomysql://root:password@127.0.0.1:3306/hms_db"
)
engine = create_async_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="HMS Priority Engine API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve locally-generated PDFs at /files/<path>
app.mount("/files", StaticFiles(directory=PDF_STORAGE_DIR), name="files")

# ---------------------------------------------------------------------------
# 1. SYMPTOM MATCHER
# ---------------------------------------------------------------------------
class SymptomMatcher:
    """
    Matches free-text patient symptoms to a Specialty and returns a suggested
    severity level.

    Strategy (ordered):
      1. Exact keyword hit in symptom_map (db table).
      2. Partial / fuzzy token overlap.
      3. Default fallback → General Medicine.
    """

    SEVERITY_WEIGHTS = {"critical": 100, "moderate": 50, "normal": 20}

    @staticmethod
    def _normalise(text: str) -> str:
        """Lowercase, strip punctuation, collapse spaces."""
        text = text.lower().strip()
        text = re.sub(r"[^a-z0-9 ]", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text

    @classmethod
    async def match(
        cls,
        symptoms_text: str,
        db: AsyncSession
    ) -> dict[str, Any]:
        """
        Returns:
          specialty_id   : int
          specialty_name : str
          severity       : str ('critical'|'moderate'|'normal')
          severity_weight: int
          matched_keyword: str | None
        """
        normalised = cls._normalise(symptoms_text)
        tokens = normalised.split()

        # Build search phrases (single tokens + bigrams + trigrams)
        phrases = set(tokens)
        for i in range(len(tokens) - 1):
            phrases.add(f"{tokens[i]} {tokens[i+1]}")
        for i in range(len(tokens) - 2):
            phrases.add(f"{tokens[i]} {tokens[i+1]} {tokens[i+2]}")

        best = None
        best_length = 0

        for phrase in phrases:
            result = await db.execute(
                text("""
                    SELECT sm.keyword, sm.severity_hint,
                           s.id AS specialty_id, s.name AS specialty_name
                    FROM symptom_map sm
                    JOIN specialties s ON s.id = sm.specialty_id
                    WHERE sm.keyword = :kw
                    LIMIT 1
                """),
                {"kw": phrase}
            )
            row = result.mappings().first()
            if row and len(phrase) > best_length:
                best = dict(row)
                best_length = len(phrase)

        if best:
            severity = best["severity_hint"] or "normal"
            return {
                "specialty_id":    best["specialty_id"],
                "specialty_name":  best["specialty_name"],
                "severity":        severity,
                "severity_weight": cls.SEVERITY_WEIGHTS[severity],
                "matched_keyword": best["keyword"],
            }

        # --- Fallback: General Medicine / Normal severity --------------------
        fallback = await db.execute(
            text("SELECT id, name FROM specialties WHERE code = 'GEN' LIMIT 1")
        )
        row = fallback.mappings().first()
        sp_id   = row["id"]   if row else None
        sp_name = row["name"] if row else "General Medicine"

        return {
            "specialty_id":    sp_id,
            "specialty_name":  sp_name,
            "severity":        "normal",
            "severity_weight": 20,
            "matched_keyword": None,
        }


# ---------------------------------------------------------------------------
# 2. DOCTOR ASSIGNER
# ---------------------------------------------------------------------------
class DoctorAssigner:
    """
    Picks the least-loaded available doctor in a given specialty for today.
    Load = number of 'waiting' or 'in_progress' OPD entries assigned today.
    """

    @staticmethod
    async def assign(specialty_id: int, db: AsyncSession) -> dict[str, Any] | None:
        """
        Returns a dict with doctor UUID and user info, or None if unavailable.
        """
        result = await db.execute(
            text("""
                SELECT
                    d.id            AS doctor_id,
                    u.full_name     AS doctor_name,
                    d.specialty_id,
                    COUNT(q.id)     AS current_load
                FROM doctors d
                JOIN users u ON u.id = d.user_id
                LEFT JOIN opd_queue q
                    ON q.doctor_id = d.id
                    AND q.status IN ('waiting','in_progress')
                    AND DATE(q.arrival_time) = CURDATE()
                WHERE d.specialty_id = :sp_id
                  AND d.is_available = 1
                  AND u.is_active    = 1
                GROUP BY d.id, u.full_name, d.specialty_id
                ORDER BY current_load ASC, d.id
                LIMIT 1
            """),
            {"sp_id": specialty_id}
        )
        row = result.mappings().first()
        return dict(row) if row else None


# ---------------------------------------------------------------------------
# 3. PRIORITY ENGINE
# ---------------------------------------------------------------------------
class PriorityEngine:
    """
    Implements the HMS Priority Score formula:
        P = S + (T × 0.5)
    where:
        S = severity_weight  (critical=100, moderate=50, normal=20)
        T = minutes elapsed since arrival_time

    The engine:
      - Recalculates scores for all 'waiting' patients
      - Assigns queue_position (rank by P desc)
      - Estimates wait time as (position - 1) × avg_consult_minutes
    """

    AVG_CONSULT_MINUTES: int = 15  # tunable constant

    @classmethod
    def calculate_score(cls, severity_weight: int, arrival_time: datetime) -> float:
        """Pure function – computes P given S and arrival timestamp."""
        now = datetime.now(timezone.utc)
        if arrival_time.tzinfo is None:
            arrival_time = arrival_time.replace(tzinfo=timezone.utc)
        elapsed_minutes = (now - arrival_time).total_seconds() / 60.0
        return round(severity_weight + (elapsed_minutes * 0.5), 2)

    @classmethod
    async def refresh_queue(cls, db: AsyncSession) -> list[dict]:
        """
        Refreshes priority scores and positions for ALL waiting patients.
        Returns the sorted queue as a list of dicts.
        """
        result = await db.execute(
            text("""
                SELECT
                    q.id, q.patient_id, q.doctor_id, q.specialty_id,
                    q.severity_weight, q.arrival_time,
                    p.id AS pid,
                    u.full_name AS patient_name
                FROM opd_queue q
                JOIN patients  p ON p.id = q.patient_id
                JOIN users     u ON u.id = p.user_id
                WHERE q.status = 'waiting'
                ORDER BY q.arrival_time ASC
            """)
        )
        rows = result.mappings().all()

        if not rows:
            return []

        # Compute scores
        scored = []
        for row in rows:
            score = cls.calculate_score(row["severity_weight"], row["arrival_time"])
            scored.append({**dict(row), "priority_score": score})

        # Sort descending by priority score
        scored.sort(key=lambda x: x["priority_score"], reverse=True)

        # Assign positions and estimated wait; update DB row by row
        queue_output = []
        for position, entry in enumerate(scored, start=1):
            est_wait = (position - 1) * cls.AVG_CONSULT_MINUTES
            await db.execute(
                text("""
                    UPDATE opd_queue
                    SET priority_score         = :ps,
                        queue_position         = :qp,
                        estimated_wait_minutes = :ew,
                        updated_at             = NOW()
                    WHERE id = :id
                """),
                {
                    "ps": entry["priority_score"],
                    "qp": position,
                    "ew": est_wait,
                    "id": str(entry["id"]),
                }
            )
            queue_output.append({
                "queue_id":             entry["id"],
                "patient_name":         entry["patient_name"],
                "queue_position":       position,
                "estimated_wait_minutes": est_wait,
            })

        await db.commit()
        return queue_output


# ---------------------------------------------------------------------------
# 4. PYDANTIC SCHEMAS
# ---------------------------------------------------------------------------
class OPDRegistrationRequest(BaseModel):
    patient_id:    str = Field(..., description="UUID of the patient")
    symptoms_text: str = Field(..., min_length=3, description="Described symptoms")
    doctor_id:     str | None = Field(None, description="Optional: override auto-assignment with specific doctor UUID")

class OPDQueueItem(BaseModel):
    queue_id:               str
    patient_name:           str
    queue_position:         int
    estimated_wait_minutes: int

class OPDQueueResponse(BaseModel):
    total_waiting:  int
    queue:          list[OPDQueueItem]

class TreatmentNoteRequest(BaseModel):
    queue_id: str
    notes:    str

class EmergencyRequest(BaseModel):
    # Patient Information
    patient_name:              str
    age:                       str | None = None
    gender:                    str | None = None
    blood_group:               str | None = None
    patient_phone:             str | None = None
    emergency_contact:         str | None = None
    address:                   str | None = None
    # Medical Information
    symptoms_described:        str
    existing_diseases:         str | None = None
    allergies_info:            str | None = None
    current_medications:       str | None = None
    medical_history:           str | None = None
    # Emergency Details
    location_text:             str
    hospital_preference:       str | None = None
    severity:                  str = "critical"
    time_of_request:           str | None = None
    additional_notes:          str | None = None
    requestor_user_id:         str | None = None

class BillItemRequest(BaseModel):
    category:    str
    description: str
    quantity:    int = 1
    unit_price:  float

class AddBillItemsRequest(BaseModel):
    bill_id: str
    items:   list[BillItemRequest]

class PaymentRequest(BaseModel):
    bill_id:      str
    amount:       float
    method:       str = "simulated"
    reference_no: str | None = None


# ---------------------------------------------------------------------------
# 5. OPD QUEUE ROUTES
# ---------------------------------------------------------------------------
@app.post("/api/opd/register", summary="Register patient in OPD queue with auto-assignment")
async def register_opd(
    payload: OPDRegistrationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Workflow:
      1. Match symptoms → specialty + severity
      2. Assign doctor (least-load, or use provided doctor_id override)
      3. Insert OPD queue entry
      4. Trigger background queue refresh
    """
    # Step 1: Match symptoms
    match = await SymptomMatcher.match(payload.symptoms_text, db)

    # Step 2: Assign doctor
    assigned_doctor_name = "Unassigned (no doctor available)"
    if payload.doctor_id:
        # Use the manually selected doctor
        doctor_id = payload.doctor_id
        dr_row = await db.execute(
            text("SELECT u.full_name FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = :did"),
            {"did": doctor_id}
        )
        dr = dr_row.mappings().first()
        assigned_doctor_name = f"Dr. {dr['full_name']}" if dr else "Selected Doctor"
    else:
        doctor = await DoctorAssigner.assign(match["specialty_id"], db)
        doctor_id = str(doctor["doctor_id"]) if doctor else None
        if doctor:
            assigned_doctor_name = doctor["doctor_name"]

    # Severity weight is computed in Python (not a DB generated column in MySQL)
    severity_weight = match["severity_weight"]

    # Step 3: Insert queue entry
    queue_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO opd_queue
                (id, patient_id, doctor_id, specialty_id, symptoms_text,
                 severity, severity_weight, priority_score, status, arrival_time)
            VALUES
                (:id, :patient_id, :doctor_id, :specialty_id, :symptoms_text,
                 :severity, :severity_weight, 0, 'waiting', NOW())
        """),
        {
            "id":              queue_id,
            "patient_id":      payload.patient_id,
            "doctor_id":       doctor_id,
            "specialty_id":    match["specialty_id"],
            "symptoms_text":   payload.symptoms_text,
            "severity":        match["severity"],
            "severity_weight": severity_weight,
        }
    )
    await db.commit()

    # Step 4: Refresh queue in background
    background_tasks.add_task(_refresh_queue_task)

    return {
        "success":         True,
        "queue_id":        queue_id,
        "specialty":       match["specialty_name"],
        "severity":        match["severity"],
        "assigned_to":     assigned_doctor_name,
        "matched_keyword": match["matched_keyword"],
        "message":         "Patient registered. Queue position will update shortly.",
    }


@app.get("/api/opd/queue", summary="Get live OPD queue (sorted by priority)")
async def get_opd_queue(
    specialty_id: int | None = None,
    doctor_id:    str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Returns the queue with full patient & status info for doctor portal."""
    filters = "WHERE q.status IN ('waiting', 'in_progress')"
    params: dict[str, Any] = {}

    if specialty_id:
        filters += " AND q.specialty_id = :sp_id"
        params["sp_id"] = specialty_id
    if doctor_id:
        filters += " AND q.doctor_id = :doc_id"
        params["doc_id"] = doctor_id

    result = await db.execute(
        text(f"""
            SELECT
                q.id              AS queue_id,
                u.full_name       AS patient_name,
                q.queue_position,
                q.estimated_wait_minutes,
                q.status,
                q.symptoms_text,
                q.severity,
                COALESCE(s.name, '') AS specialty
            FROM opd_queue q
            JOIN patients p  ON p.id = q.patient_id
            JOIN users    u  ON u.id = p.user_id
            LEFT JOIN specialties s ON s.id = q.specialty_id
            {filters}
            ORDER BY q.queue_position ASC
        """),
        params
    )
    rows = result.mappings().all()
    items = [dict(r) for r in rows]
    return {"total_waiting": len(items), "queue": items}


@app.post("/api/opd/refresh-queue", summary="Force a queue priority recalculation")
async def refresh_queue_endpoint(db: AsyncSession = Depends(get_db)):
    queue = await PriorityEngine.refresh_queue(db)
    return {"refreshed": True, "total_waiting": len(queue)}


@app.patch("/api/opd/{queue_id}/start", summary="Doctor marks patient as In Progress")
async def start_consultation(queue_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(
        text("""
            UPDATE opd_queue
            SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
            WHERE id = :id AND status = 'waiting'
        """),
        {"id": queue_id}
    )
    await db.commit()
    return {"success": True, "queue_id": queue_id, "status": "in_progress"}


@app.patch("/api/opd/{queue_id}/complete", summary="Doctor completes consultation and adds notes")
async def complete_consultation(
    queue_id: str,
    payload: TreatmentNoteRequest,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            UPDATE opd_queue
            SET status = 'completed', completed_at = NOW(),
                notes = :notes, updated_at = NOW()
            WHERE id = :id
        """),
        {"id": queue_id, "notes": payload.notes or ""}
    )
    await db.commit()
    return {"success": True, "queue_id": queue_id, "status": "completed"}


@app.patch("/api/opd/{queue_id}/attended", summary="Doctor marks patient as attended (quick complete)")
async def mark_attended(
    queue_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Marks a patient as attended without requiring full treatment notes."""
    await db.execute(
        text("""
            UPDATE opd_queue
            SET status = 'completed', completed_at = NOW(),
                notes = 'Patient attended.', updated_at = NOW()
            WHERE id = :id AND status = 'in_progress'
        """),
        {"id": queue_id}
    )
    await db.commit()
    return {"success": True, "queue_id": queue_id, "status": "attended"}


@app.get("/api/opd/patient/{patient_id}/status", summary="Patient's own queue status")
async def patient_queue_status(patient_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT
                q.id, q.status, q.queue_position, q.estimated_wait_minutes,
                s.name AS specialty, u.full_name AS doctor_name,
                q.arrival_time, q.severity
            FROM opd_queue q
            LEFT JOIN specialties s ON s.id = q.specialty_id
            LEFT JOIN doctors d     ON d.id = q.doctor_id
            LEFT JOIN users u       ON u.id = d.user_id
            WHERE q.patient_id = :pid
              AND q.status IN ('waiting', 'in_progress')
            ORDER BY q.arrival_time DESC
            LIMIT 1
        """),
        {"pid": patient_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No active OPD visit found")
    return dict(row)


# ---------------------------------------------------------------------------
# 6. EMERGENCY MODULE ROUTES
# ---------------------------------------------------------------------------
@app.post("/api/emergency/request", status_code=status.HTTP_201_CREATED,
          summary="Submit emergency ambulance request")
async def create_emergency(
    payload: EmergencyRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    em_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO emergency_requests
                (id, patient_name, patient_phone, location_text,
                 symptoms_described, severity, status, requestor_user_id, admin_alerted_at,
                 age, gender, blood_group, emergency_contact, address,
                 existing_diseases, allergies_info, current_medications, medical_history,
                 hospital_preference, time_of_request, additional_notes)
            VALUES
                (:id, :patient_name, :patient_phone, :location_text,
                 :symptoms_described, :severity, 'pending', :requestor_user_id, NOW(),
                 :age, :gender, :blood_group, :emergency_contact, :address,
                 :existing_diseases, :allergies_info, :current_medications, :medical_history,
                 :hospital_preference, :time_of_request, :additional_notes)
        """),
        {
            "id":                   em_id,
            "patient_name":         payload.patient_name,
            "patient_phone":        payload.patient_phone,
            "location_text":        payload.location_text,
            "symptoms_described":   payload.symptoms_described,
            "severity":             payload.severity,
            "requestor_user_id":    payload.requestor_user_id,
            "age":                  payload.age,
            "gender":               payload.gender,
            "blood_group":          payload.blood_group,
            "emergency_contact":    payload.emergency_contact,
            "address":              payload.address,
            "existing_diseases":    payload.existing_diseases,
            "allergies_info":       payload.allergies_info,
            "current_medications":  payload.current_medications,
            "medical_history":      payload.medical_history,
            "hospital_preference":  payload.hospital_preference,
            "time_of_request":      payload.time_of_request,
            "additional_notes":     payload.additional_notes,
        }
    )

    # Create admin alert row for all admins
    admins_result = await db.execute(
        text("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
    )
    admin_rows = admins_result.mappings().all()
    for admin in admin_rows:
        alert_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO admin_alerts
                    (id, admin_user_id, alert_type, reference_id, reference_table, message)
                VALUES
                    (:alert_id, :admin_id, 'emergency', :em_id, 'emergency_requests', :msg)
            """),
            {
                "alert_id": alert_id,
                "admin_id": str(admin["id"]),
                "em_id":    em_id,
                "msg":      f"\U0001f6a8 Emergency: {payload.patient_name} at {payload.location_text} | {payload.severity.upper()}",
            }
        )
    await db.commit()

    return {
        "success":      True,
        "emergency_id": em_id,
        "message":      "Emergency request submitted. Admin alerted.",
    }


@app.get("/api/emergency/active", summary="List all active emergencies (Admin only)")
async def list_active_emergencies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT id, patient_name, patient_phone, location_text, symptoms_described,
                   severity, status, created_at,
                   age, gender, blood_group, emergency_contact, address,
                   existing_diseases, allergies_info, current_medications, medical_history,
                   hospital_preference, time_of_request, additional_notes
            FROM emergency_requests
            WHERE status IN ('pending', 'dispatched', 'arrived')
            ORDER BY created_at DESC
        """)
    )
    rows = result.mappings().all()
    return {"emergencies": [dict(r) for r in rows]}


@app.delete("/api/emergency/{emergency_id}", summary="Delete an emergency request (Admin)")
async def delete_emergency(emergency_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(
        text("DELETE FROM emergency_requests WHERE id = :id"),
        {"id": emergency_id}
    )
    await db.commit()
    return {"success": True}


@app.get("/api/emergency/{emergency_id}/download-pdf",
         summary="Generate and download emergency PDF on-demand (no DB storage)")
async def download_emergency_pdf(emergency_id: str, db: AsyncSession = Depends(get_db)):
    """Generates PDF in memory and streams it directly to the browser as a download."""
    from fastapi.responses import StreamingResponse
    import io
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import inch

    result = await db.execute(
        text("SELECT * FROM emergency_requests WHERE id = :id"),
        {"id": emergency_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Emergency not found")
    em = dict(row)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("Title", parent=styles["Title"], textColor=colors.darkred, fontSize=16)
    story.append(Paragraph("HMS EMERGENCY INTAKE DOCUMENT", title_style))
    story.append(Spacer(1, 12))

    def section(title, rows_data):
        story.append(Paragraph(f"<b>{title}</b>", styles["Heading2"]))
        story.append(Spacer(1, 4))
        t = Table(rows_data, colWidths=[2.4*inch, 4.6*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTNAME",      (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("PADDING",       (0, 0), (-1, -1), 7),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(t)
        story.append(Spacer(1, 12))

    section("PATIENT INFORMATION", [
        ["Full Name",           em.get("patient_name") or "—"],
        ["Age",                 em.get("age") or "—"],
        ["Gender",              em.get("gender") or "—"],
        ["Blood Group",         em.get("blood_group") or "—"],
        ["Phone",               em.get("patient_phone") or "—"],
        ["Emergency Contact",   em.get("emergency_contact") or "—"],
        ["Address",             em.get("address") or "—"],
    ])
    section("MEDICAL INFORMATION", [
        ["Symptoms",            em.get("symptoms_described") or "—"],
        ["Existing Diseases",   em.get("existing_diseases") or "—"],
        ["Allergies",           em.get("allergies_info") or "—"],
        ["Current Medications", em.get("current_medications") or "—"],
        ["Medical History",     em.get("medical_history") or "—"],
    ])
    section("EMERGENCY DETAILS", [
        ["Pickup Location",     em.get("location_text") or "—"],
        ["Hospital Preference", em.get("hospital_preference") or "—"],
        ["Severity",            (em.get("severity") or "critical").upper()],
        ["Time of Request",     em.get("time_of_request") or str(em.get("created_at") or "")],
        ["Additional Notes",    em.get("additional_notes") or "—"],
        ["Status",              (em.get("status") or "pending").upper()],
    ])

    doc.build(story)
    buffer.seek(0)
    file_name = f"emergency_{emergency_id[:8]}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'}
    )


# ---------------------------------------------------------------------------
# 7. PATIENT TRACKING ROUTE
# ---------------------------------------------------------------------------
COLOR_MAP = {
    "icu":             {"label": "ICU",              "color": "red",    "emoji": "🔴"},
    "under_treatment": {"label": "Under Treatment",  "color": "yellow", "emoji": "🟡"},
    "admitted":        {"label": "Admitted",         "color": "blue",   "emoji": "🔵"},
    "discharged":      {"label": "Discharged",       "color": "green",  "emoji": "🟢"},
}

@app.get("/api/patient/{patient_id}/tracking", summary="Visual tracking status for a patient")
async def patient_tracking(patient_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT a.id, a.status, a.ward, a.bed_number, a.admitted_at,
                   a.discharged_at, u.full_name AS doctor_name
            FROM admissions a
            LEFT JOIN doctors d ON d.id = a.doctor_id
            LEFT JOIN users   u ON u.id = d.user_id
            WHERE a.patient_id = :pid
            ORDER BY a.admitted_at DESC
            LIMIT 1
        """),
        {"pid": patient_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No admission record found")

    admission: dict[str, Any] = dict(row)
    admission["tracking"] = COLOR_MAP.get(admission["status"], {"label": "Unknown", "color": "grey", "emoji": "⚪"})
    return admission


class AdmissionStatusRequest(BaseModel):
    status: str  # one of: icu | under_treatment | admitted | discharged


class CreateAdmissionRequest(BaseModel):
    patient_id:   str
    doctor_id:    str | None = None
    opd_queue_id: str | None = None
    ward:         str | None = None
    bed_number:   str | None = None
    status:       str = "admitted"


@app.post("/api/admission/create", status_code=status.HTTP_201_CREATED,
          summary="Admit a patient (Doctor / Admin)")
async def create_admission(
    payload: CreateAdmissionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create an admission record and set initial tracking status."""
    valid = {"icu", "under_treatment", "admitted"}
    if payload.status not in valid:
        raise HTTPException(status_code=422, detail=f"status must be one of {valid}")

    admission_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO admissions
                (id, patient_id, doctor_id, opd_queue_id, ward, bed_number, status, admitted_at)
            VALUES
                (:id, :patient_id, :doctor_id, :opd_queue_id, :ward, :bed_number, :status, NOW())
        """),
        {
            "id":           admission_id,
            "patient_id":   payload.patient_id,
            "doctor_id":    payload.doctor_id,
            "opd_queue_id": payload.opd_queue_id,
            "ward":         payload.ward,
            "bed_number":   payload.bed_number,
            "status":       payload.status,
        }
    )
    await db.commit()
    return {
        "success":      True,
        "admission_id": admission_id,
        "status":       payload.status,
        "tracking":     COLOR_MAP.get(payload.status, {}),
    }


@app.patch("/api/admission/{admission_id}/status",
           summary="Update patient admission status (Doctor / Admin)")
async def update_admission_status(
    admission_id: str,
    payload: AdmissionStatusRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Updates the tracked status of an admission record.
    Maps to the color indicator: ICU=🔴, UnderTreatment=🟡, Admitted=🔵, Discharged=🟢.
    Also sets discharged_at when status becomes 'discharged'.
    """
    valid_statuses = {"icu", "under_treatment", "admitted", "discharged"}
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    # Check admission exists
    check = await db.execute(
        text("SELECT id FROM admissions WHERE id = :id"),
        {"id": admission_id}
    )
    if not check.first():
        raise HTTPException(status_code=404, detail="Admission not found")

    if payload.status == "discharged":
        await db.execute(
            text("""
                UPDATE admissions
                SET status = :status, discharged_at = NOW(), updated_at = NOW()
                WHERE id = :id
            """),
            {"status": payload.status, "id": admission_id}
        )
    else:
        await db.execute(
            text("""
                UPDATE admissions
                SET status = :status, updated_at = NOW()
                WHERE id = :id
            """),
            {"status": payload.status, "id": admission_id}
        )

    await db.commit()
    return {
        "success":      True,
        "admission_id": admission_id,
        "new_status":   payload.status,
        "tracking":     COLOR_MAP.get(payload.status, {"label": "Unknown", "color": "grey", "emoji": "⚪"}),
    }


# ---------------------------------------------------------------------------
# 8. BILLING ROUTES
# ---------------------------------------------------------------------------
@app.post("/api/billing/items", summary="Add charge items to a bill")
async def add_bill_items(payload: AddBillItemsRequest, db: AsyncSession = Depends(get_db)):
    for item in payload.items:
        item_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO bill_items (id, bill_id, category, description, quantity, unit_price)
                VALUES (:id, :bill_id, :category, :description, :qty, :price)
            """),
            {
                "id":          item_id,
                "bill_id":     payload.bill_id,
                "category":    item.category,
                "description": item.description,
                "qty":         item.quantity,
                "price":       item.unit_price,
            }
        )
    await db.commit()
    # Fetch updated bill totals
    result = await db.execute(
        text("SELECT id, total_amount, paid_amount, due_amount, status FROM bills WHERE id = :id"),
        {"id": payload.bill_id}
    )
    bill = result.mappings().first()
    return {"success": True, "bill": dict(bill) if bill else None}


@app.post("/api/billing/pay", summary="Process (simulated) payment and generate receipt PDF")
async def process_payment(
    payload: PaymentRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Record payment
    payment_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO payments (id, bill_id, amount, method, reference_no)
            VALUES (:id, :bill_id, :amount, :method, :ref)
        """),
        {
            "id":      payment_id,
            "bill_id": payload.bill_id,
            "amount":  payload.amount,
            "method":  payload.method,
            "ref":     payload.reference_no or f"SIM-{payment_id[:8].upper()}",
        }
    )
    await db.commit()

    # Generate receipt in background (saved locally)
    background_tasks.add_task(_generate_receipt_pdf, payload.bill_id, payment_id)

    return {
        "success":    True,
        "payment_id": payment_id,
        "message":    "Payment recorded. Digital receipt PDF generating.",
    }


@app.get("/api/billing/bill/{bill_id}", summary="Get full bill details with items")
async def get_bill(bill_id: str, db: AsyncSession = Depends(get_db)):
    bill_result = await db.execute(
        text("SELECT * FROM bills WHERE id = :id"), {"id": bill_id}
    )
    bill = bill_result.mappings().first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    items_result = await db.execute(
        text("SELECT * FROM bill_items WHERE bill_id = :id ORDER BY created_at"),
        {"id": bill_id}
    )
    items = [dict(r) for r in items_result.mappings().all()]
    return {**dict(bill), "items": items}


@app.get("/api/billing/bill/{bill_id}/download-receipt",
         summary="Generate and download receipt PDF on-demand (no DB storage)")
async def download_receipt_pdf(bill_id: str, db: AsyncSession = Depends(get_db)):
    """Generates receipt PDF in memory and streams directly to browser."""
    from fastapi.responses import StreamingResponse
    import io
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import inch

    bill_r = await db.execute(
        text("""
            SELECT b.id, b.total_amount, b.paid_amount, b.due_amount, b.status,
                   u.full_name AS patient_name
            FROM bills b
            JOIN patients p ON p.id = b.patient_id
            JOIN users    u ON u.id = p.user_id
            WHERE b.id = :id
        """), {"id": bill_id}
    )
    bill = bill_r.mappings().first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    items_r = await db.execute(
        text("SELECT category, description, quantity, unit_price, total_price FROM bill_items WHERE bill_id = :id"),
        {"id": bill_id}
    )
    items = items_r.mappings().all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("HMS DIGITAL RECEIPT", styles["Title"]))
    story.append(Spacer(1, 12))

    meta = Table([
        ["Bill ID:",    str(bill_id)],
        ["Patient:",    bill["patient_name"]],
        ["Date:",       datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")],
        ["Status:",     (bill["status"] or "").upper()],
        ["Total:",      f"Rs. {float(bill['total_amount'] or 0):.2f}"],
        ["Paid:",       f"Rs. {float(bill['paid_amount'] or 0):.2f}"],
        ["Due:",        f"Rs. {float(bill['due_amount'] or 0):.2f}"],
    ], colWidths=[2*inch, 5*inch])
    meta.setStyle(TableStyle([
        ("GRID",     (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("PADDING",  (0, 0), (-1, -1), 6),
    ]))
    story.append(meta)
    story.append(Spacer(1, 16))

    if items:
        item_data = [["Category", "Description", "Qty", "Unit Price", "Total"]]
        for it in items:
            item_data.append([
                (it["category"] or "").upper(),
                it["description"],
                str(it["quantity"]),
                f"Rs.{float(it['unit_price']):.2f}",
                f"Rs.{float(it['total_price']):.2f}",
            ])
        item_table = Table(item_data, colWidths=[1.2*inch, 2.5*inch, 0.5*inch, 1.2*inch, 1.1*inch])
        item_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), colors.HexColor("#1a6b5e")),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("PADDING",       (0, 0), (-1, -1), 6),
        ]))
        story.append(item_table)

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="receipt_{bill_id[:8]}.pdf"'}
    )


@app.get("/api/billing/patient/{patient_id}/summary",
         summary="Get all bills for a patient with totals (Admin)")
async def patient_billing_summary(patient_id: str, db: AsyncSession = Depends(get_db)):
    bills_r = await db.execute(
        text("""
            SELECT b.id, b.status, b.total_amount, b.paid_amount, b.due_amount, b.created_at
            FROM bills b
            WHERE b.patient_id = :pid
            ORDER BY b.created_at DESC
        """),
        {"pid": patient_id}
    )
    bills = [dict(r) for r in bills_r.mappings().all()]

    total_billed = sum(float(b["total_amount"] or 0) for b in bills)
    total_paid   = sum(float(b["paid_amount"]   or 0) for b in bills)
    total_due    = sum(float(b["due_amount"]    or 0) for b in bills)

    # Patient name
    pr = await db.execute(
        text("SELECT u.full_name FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = :pid"),
        {"pid": patient_id}
    )
    prow = pr.mappings().first()

    return {
        "patient_id":   patient_id,
        "patient_name": prow["full_name"] if prow else "Unknown",
        "total_billed":  total_billed,
        "total_paid":    total_paid,
        "total_due":     total_due,
        "bills":         bills,
    }


# ---------------------------------------------------------------------------
# 9. ADMIN DASHBOARD STATS ROUTE
# ---------------------------------------------------------------------------
@app.get("/api/admin/dashboard-stats", summary="Real-time dashboard stats for Admin")
async def admin_dashboard_stats(db: AsyncSession = Depends(get_db)):
    stats: dict[str, Any] = {}

    r = await db.execute(text("SELECT COUNT(*) FROM patients"))
    stats["total_patients"] = r.scalar()

    r = await db.execute(
        text("SELECT COUNT(*) FROM admissions WHERE status IN ('admitted','icu','under_treatment')")
    )
    stats["active_admissions"] = r.scalar()

    r = await db.execute(
        text("""
            SELECT
                SUM(status = 'icu')             AS icu_count,
                SUM(status = 'under_treatment') AS treatment_count,
                SUM(status = 'admitted')        AS admitted_count
            FROM admissions WHERE status != 'discharged'
        """)
    )
    bed_row = r.mappings().first()
    stats["beds"] = dict(bed_row) if bed_row else {}

    TOTAL_BEDS = int(os.getenv("TOTAL_BEDS", "100"))
    active = stats["active_admissions"] or 0
    occupancy: float = (float(active) / TOTAL_BEDS) * 100.0
    stats["occupancy_rate"] = round(occupancy, 1)

    r = await db.execute(
        text("SELECT COUNT(*) FROM emergency_requests WHERE status IN ('pending','dispatched','arrived')")
    )
    stats["active_emergencies"] = r.scalar()

    r = await db.execute(text("SELECT COUNT(*) FROM opd_queue WHERE status = 'waiting'"))
    stats["opd_waiting"] = r.scalar()

    r = await db.execute(text("SELECT COALESCE(SUM(paid_amount), 0) FROM bills"))
    stats["total_revenue"] = float(r.scalar())

    r = await db.execute(
        text("SELECT COUNT(*) FROM admin_alerts WHERE is_read = 0")
    )
    stats["unread_alerts"] = r.scalar()

    return stats


# ---------------------------------------------------------------------------
# 10. BACKGROUND TASKS (PDF generation + queue refresh)
# ---------------------------------------------------------------------------
async def _refresh_queue_task():
    """Background wrapper for queue refresh."""
    async with AsyncSessionLocal() as db:
        await PriorityEngine.refresh_queue(db)


async def _generate_emergency_pdf(
    emergency_id: str,
    patient_name: str,
    location: str,
    symptoms: str,
    severity: str,
):
    """
    Generates an Emergency Intake Document PDF and saves it to local storage.
    """
    try:
        import io
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import inch

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=inch)
        styles = getSampleStyleSheet()
        story = []

        # Title
        title_style = ParagraphStyle("Title", parent=styles["Title"], textColor=colors.darkred)
        story.append(Paragraph("HMS EMERGENCY INTAKE DOCUMENT", title_style))
        story.append(Spacer(1, 12))

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        data = [
            ["Field",          "Details"],
            ["Emergency ID",   emergency_id],
            ["Timestamp",      timestamp],
            ["Patient Name",   patient_name],
            ["Location",       location],
            ["Symptoms",       symptoms],
            ["Severity",       severity.upper()],
            ["Status",         "PENDING - Admin Alerted"],
        ]
        table = Table(data, colWidths=[2.5 * inch, 4.5 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), colors.darkred),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.lightyellow]),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 10),
            ("PADDING",       (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
        doc.build(story)

        pdf_bytes = buffer.getvalue()
        file_name    = f"emergency_{emergency_id}.pdf"
        local_path   = os.path.join(PDF_STORAGE_DIR, "emergency", file_name)
        public_url   = f"/files/emergency/{file_name}"

        with open(local_path, "wb") as f:
            f.write(pdf_bytes)

        doc_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE emergency_requests SET intake_pdf_url = :url WHERE id = :id"),
                {"url": public_url, "id": emergency_id}
            )
            await db.execute(
                text("""
                    INSERT INTO documents
                        (id, doc_type, reference_id, reference_table,
                         file_name, storage_path, public_url)
                    VALUES
                        (:id, 'emergency_intake', :ref_id,
                         'emergency_requests', :fname, :spath, :purl)
                """),
                {
                    "id":     doc_id,
                    "ref_id": emergency_id,
                    "fname":  file_name,
                    "spath":  local_path,
                    "purl":   public_url,
                }
            )
            await db.commit()

    except Exception as exc:
        print(f"[PDF ERROR - Emergency] {exc}")


async def _generate_receipt_pdf(bill_id: str, payment_id: str):
    """Generates a Digital Receipt PDF and saves it to local storage."""
    try:
        import io
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import inch

        async with AsyncSessionLocal() as db:
            bill_r = await db.execute(
                text("""
                    SELECT b.id, b.total_amount, b.paid_amount, b.status,
                           u.full_name AS patient_name
                    FROM bills b
                    JOIN patients p ON p.id = b.patient_id
                    JOIN users    u ON u.id = p.user_id
                    WHERE b.id = :id
                """),
                {"id": bill_id}
            )
            bill = bill_r.mappings().first()
            if not bill:
                return

            items_r = await db.execute(
                text("""
                    SELECT category, description, quantity, unit_price, total_price
                    FROM bill_items WHERE bill_id = :id
                """),
                {"id": bill_id}
            )
            items = items_r.mappings().all()

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=inch)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("HMS DIGITAL RECEIPT", styles["Title"]))
        story.append(Spacer(1, 12))

        meta_data = [
            ["Bill ID:",    str(bill_id)],
            ["Payment ID:", str(payment_id)],
            ["Patient:",    bill["patient_name"]],
            ["Date:",       datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")],
            ["Status:",     bill["status"].upper()],
        ]
        meta_table = Table(meta_data, colWidths=[2 * inch, 5 * inch])
        meta_table.setStyle(TableStyle([
            ("GRID",     (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("PADDING",  (0, 0), (-1, -1), 6),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 16))

        item_data = [["Category", "Description", "Qty", "Unit Price", "Total"]]
        for it in items:
            item_data.append([
                it["category"].upper(),
                it["description"],
                str(it["quantity"]),
                f"Rs.{it['unit_price']:.2f}",
                f"Rs.{it['total_price']:.2f}",
            ])
        item_data.append(["", "", "", "TOTAL PAID:", f"Rs.{bill['paid_amount']:.2f}"])

        item_table = Table(item_data, colWidths=[1.2*inch, 2.5*inch, 0.5*inch, 1.2*inch, 1.1*inch])
        item_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), colors.HexColor("#1a6b5e")),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS",(0, 1), (-1, -2), [colors.white, colors.lightgrey]),
            ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("PADDING",       (0, 0), (-1, -1), 6),
        ]))
        story.append(item_table)
        doc.build(story)

        pdf_bytes    = buffer.getvalue()
        file_name    = f"receipt_{bill_id}.pdf"
        local_path   = os.path.join(PDF_STORAGE_DIR, "receipts", file_name)
        public_url   = f"/files/receipts/{file_name}"

        with open(local_path, "wb") as f:
            f.write(pdf_bytes)

        doc_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE bills SET receipt_pdf_url = :url WHERE id = :id"),
                {"url": public_url, "id": bill_id}
            )
            await db.execute(
                text("""
                    INSERT INTO documents
                        (id, doc_type, reference_id, reference_table,
                         file_name, storage_path, public_url)
                    VALUES
                        (:id, 'billing_receipt', :ref_id,
                         'bills', :fname, :spath, :purl)
                """),
                {
                    "id":     doc_id,
                    "ref_id": bill_id,
                    "fname":  file_name,
                    "spath":  local_path,
                    "purl":   public_url,
                }
            )
            await db.commit()

    except Exception as exc:
        print(f"[PDF ERROR - Receipt] {exc}")


# ---------------------------------------------------------------------------
# 11. AUTH ROUTES  (register / login – plain-text passwords for demo)
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    full_name: str
    email:     str
    password:  str
    role:      str = "patient"   # patient | doctor | admin
    phone:     str | None = None

class LoginRequest(BaseModel):
    email:    str
    password: str


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED,
          summary="Register a new user (patient / doctor / admin)")
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check duplicate e-mail
    existing = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": payload.email}
    )
    if existing.first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO users (id, email, password_hash, role, full_name, phone)
            VALUES (:id, :email, :pwd, :role, :name, :phone)
        """),
        {
            "id":    user_id,
            "email": payload.email,
            "pwd":   payload.password,   # plain-text for demo
            "role":  payload.role,
            "name":  payload.full_name,
            "phone": payload.phone,
        }
    )

    patient_id = None
    if payload.role == "patient":
        patient_id = str(uuid.uuid4())
        await db.execute(
            text("INSERT INTO patients (id, user_id) VALUES (:id, :uid)"),
            {"id": patient_id, "uid": user_id}
        )

    await db.commit()
    return {
        "success":    True,
        "user_id":    user_id,
        "patient_id": patient_id,
        "role":       payload.role,
        "full_name":  payload.full_name,
    }


@app.post("/api/auth/login", summary="Login with email + password")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, password_hash, role, full_name FROM users WHERE email = :email AND is_active = 1"),
        {"email": payload.email}
    )
    row = result.mappings().first()
    if not row or row["password_hash"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(row["id"])
    patient_id = None
    if row["role"] == "patient":
        pr = await db.execute(
            text("SELECT id FROM patients WHERE user_id = :uid"),
            {"uid": user_id}
        )
        prow = pr.mappings().first()
        patient_id = str(prow["id"]) if prow else None

    return {
        "success":    True,
        "user_id":    user_id,
        "patient_id": patient_id,
        "role":       row["role"],
        "full_name":  row["full_name"],
    }


# ---------------------------------------------------------------------------
# 12. MEDICINES & PATIENT-MEDICINE ROUTES
# ---------------------------------------------------------------------------
class MedicineRequest(BaseModel):
    name:         str
    description:  str | None = None
    dosage_form:  str | None = None   # e.g. "Tablet", "Syrup", "Injection"
    cost:         float | None = None  # cost per unit in INR

class AssignMedicineRequest(BaseModel):
    medicine_id:          str
    dosage_instructions:  str
    prescribed_by_user_id: str | None = None


@app.get("/api/medicines", summary="List all medicines (admin)")
async def list_medicines(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, name, description, dosage_form, cost, created_at FROM medicines ORDER BY name")
    )
    return {"medicines": [dict(r) for r in result.mappings().all()]}


@app.post("/api/medicines", status_code=status.HTTP_201_CREATED,
          summary="Create a new medicine entry (admin)")
async def create_medicine(payload: MedicineRequest, db: AsyncSession = Depends(get_db)):
    med_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO medicines (id, name, description, dosage_form, cost)
            VALUES (:id, :name, :desc, :form, :cost)
        """),
        {"id": med_id, "name": payload.name, "desc": payload.description,
         "form": payload.dosage_form, "cost": payload.cost}
    )
    await db.commit()
    return {"success": True, "medicine_id": med_id, "name": payload.name}


@app.delete("/api/medicines/{medicine_id}", summary="Delete a medicine (admin)")
async def delete_medicine(medicine_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM medicines WHERE id = :id"), {"id": medicine_id})
    await db.commit()
    return {"success": True}


@app.get("/api/patient/{patient_id}/medicines",
         summary="List medicines assigned to a patient")
async def get_patient_medicines(patient_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT pm.id AS assignment_id,
                   m.name, m.description, m.dosage_form,
                   pm.dosage_instructions, pm.prescribed_at
            FROM patient_medicines pm
            JOIN medicines m ON m.id = pm.medicine_id
            WHERE pm.patient_id = :pid
            ORDER BY pm.prescribed_at DESC
        """),
        {"pid": patient_id}
    )
    return {"medicines": [dict(r) for r in result.mappings().all()]}


@app.post("/api/patient/{patient_id}/medicines",
          status_code=status.HTTP_201_CREATED,
          summary="Assign a medicine to a patient (admin)")
async def assign_medicine(
    patient_id: str,
    payload: AssignMedicineRequest,
    db: AsyncSession = Depends(get_db),
):
    assign_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO patient_medicines
                (id, patient_id, medicine_id, dosage_instructions, prescribed_by)
            VALUES (:id, :pid, :mid, :instructions, :by)
        """),
        {
            "id":           assign_id,
            "pid":          patient_id,
            "mid":          payload.medicine_id,
            "instructions": payload.dosage_instructions,
            "by":           payload.prescribed_by_user_id,
        }
    )

    # — Auto-add medicine cost as a bill item —
    med_row = await db.execute(
        text("SELECT name, cost FROM medicines WHERE id = :id"),
        {"id": payload.medicine_id}
    )
    med = med_row.mappings().first()
    if med and med["cost"] is not None:
        # Find or create an open bill for this patient
        bill_row = await db.execute(
            text("""
                SELECT id FROM bills
                WHERE patient_id = :pid AND status IN ('pending', 'partial')
                ORDER BY created_at DESC LIMIT 1
            """),
            {"pid": patient_id}
        )
        bill = bill_row.mappings().first()
        if bill:
            bill_id = str(bill["id"])
        else:
            bill_id = str(uuid.uuid4())
            await db.execute(
                text("""
                    INSERT INTO bills (id, patient_id, status)
                    VALUES (:id, :pid, 'pending')
                """),
                {"id": bill_id, "pid": patient_id}
            )
        # Add bill item for the medicine
        item_id = str(uuid.uuid4())
        unit_price = float(med["cost"])
        await db.execute(
            text("""
                INSERT INTO bill_items (id, bill_id, category, description, quantity, unit_price)
                VALUES (:id, :bill_id, 'pharmacy', :desc, 1, :price)
            """),
            {
                "id":      item_id,
                "bill_id": bill_id,
                "desc":    f"{med['name']} – {payload.dosage_instructions}",
                "price":   unit_price,
            }
        )
        # Update bill total from sum of all items (handles generated-column absence)
        await db.execute(
            text("""
                UPDATE bills
                SET total_amount = (
                    SELECT COALESCE(SUM(unit_price * quantity), 0)
                    FROM bill_items WHERE bill_id = :bid
                ),
                due_amount = (
                    SELECT COALESCE(SUM(unit_price * quantity), 0)
                    FROM bill_items WHERE bill_id = :bid
                ) - COALESCE(paid_amount, 0)
                WHERE id = :bid
            """),
            {"bid": bill_id}
        )

    await db.commit()
    return {"success": True, "assignment_id": assign_id}


@app.delete("/api/patient/{patient_id}/medicines/{assignment_id}",
            summary="Remove a medicine assignment from a patient (admin)")
async def remove_patient_medicine(
    patient_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM patient_medicines WHERE id = :id AND patient_id = :pid"),
        {"id": assignment_id, "pid": patient_id}
    )
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# 13. ADMIN – PATIENT LIST & DOCTOR LIST  (for dropdowns)
# ---------------------------------------------------------------------------
@app.get("/api/patients/all", summary="List all patients with names (admin – for dropdowns)")
async def list_all_patients(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT p.id AS patient_id, u.full_name, u.email
            FROM patients p
            JOIN users u ON u.id = p.user_id
            WHERE u.is_active = 1
            ORDER BY u.full_name
        """)
    )
    return {"patients": [dict(r) for r in result.mappings().all()]}


@app.get("/api/doctors/all", summary="List all doctors with names and specialty (for dropdowns)")
async def list_all_doctors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT d.id AS doctor_id, u.id AS user_id, u.full_name,
                   COALESCE(s.name, 'General') AS specialty_name
            FROM doctors d
            JOIN users u       ON u.id = d.user_id
            LEFT JOIN specialties s ON s.id = d.specialty_id
            ORDER BY u.full_name
        """)
    )
    return {"doctors": [dict(r) for r in result.mappings().all()]}


@app.get("/api/admissions/by-patient/{patient_id}",
         summary="Get the latest admission record for a patient (for doctor dropdown)")
async def get_admission_by_patient(patient_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT a.id AS admission_id, a.status, a.ward, a.bed_number,
                   a.admitted_at, u.full_name AS patient_name
            FROM admissions a
            JOIN patients p ON p.id = a.patient_id
            JOIN users    u ON u.id = p.user_id
            WHERE a.patient_id = :pid
            ORDER BY a.admitted_at DESC
            LIMIT 1
        """),
        {"pid": patient_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No admission found for this patient")
    return dict(row)


@app.get("/api/doctor/{doctor_user_id}/patients",
         summary="Get patients assigned to this doctor via OPD queue")
async def get_doctor_patients(doctor_user_id: str, db: AsyncSession = Depends(get_db)):
    """Returns OPD entries where the doctor (by user_id) is assigned."""
    result = await db.execute(
        text("""
            SELECT q.id AS queue_id, u.full_name AS patient_name,
                   q.symptoms_text, q.severity, q.status,
                   COALESCE(s.name, '') AS specialty,
                   q.arrival_time
            FROM opd_queue q
            JOIN patients p  ON p.id = q.patient_id
            JOIN users    u  ON u.id = p.user_id
            JOIN doctors  d  ON d.id = q.doctor_id
            LEFT JOIN specialties s ON s.id = q.specialty_id
            WHERE d.user_id = :uid
            ORDER BY q.arrival_time DESC
            LIMIT 50
        """),
        {"uid": doctor_user_id}
    )
    rows = result.mappings().all()
    return {"patients": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# 14. STARTUP
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    """Perform an initial queue refresh on startup."""
    async with AsyncSessionLocal() as db:
        await PriorityEngine.refresh_queue(db)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("priority_engine:app", host="0.0.0.0", port=8000, reload=True)
