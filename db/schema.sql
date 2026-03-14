-- ============================================================
-- Hospital Management System – MySQL Database Schema
-- ============================================================
-- Run order: execute this entire file once on a fresh database.
-- Requires MySQL 8.0+ for JSON and computed columns.
-- Create DB first:
--   CREATE DATABASE hms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE hms_db;
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1.  ROLES & USERS  (RBAC Core)
-- ============================================================
CREATE TABLE users (
    id              CHAR(36)     PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    role            ENUM('admin','doctor','patient') NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    is_active       TINYINT(1)   DEFAULT 1,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role  (role),
    INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 2.  SPECIALTIES  (Medical Department Catalogue)
-- ============================================================
CREATE TABLE specialties (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO specialties (name, code, description) VALUES
    ('General Medicine',    'GEN',   'Common illnesses, fevers, infections'),
    ('Cardiology',          'CARD',  'Heart and cardiovascular conditions'),
    ('Orthopedics',         'ORTH',  'Bone, joint, and muscle injuries'),
    ('Neurology',           'NEURO', 'Brain and nervous system conditions'),
    ('Pediatrics',          'PED',   'Children medical care'),
    ('Dermatology',         'DERM',  'Skin, hair, and nail conditions'),
    ('Gastroenterology',    'GASTRO','Digestive system disorders'),
    ('Pulmonology',         'PULM',  'Respiratory and lung conditions'),
    ('Ophthalmology',       'OPTH',  'Eye and vision conditions'),
    ('ENT',                 'ENT',   'Ear, nose, and throat conditions'),
    ('Urology',             'URO',   'Urinary tract and kidneys'),
    ('Psychiatry',          'PSYCH', 'Mental health conditions'),
    ('Emergency Medicine',  'EM',    'Critical and life-threatening conditions'),
    ('Oncology',            'ONC',   'Cancer care and treatment'),
    ('Endocrinology',       'ENDO',  'Hormonal and metabolic conditions');


-- ============================================================
-- 3.  SYMPTOM MAP  (Symptom → Specialty auto-assignment)
-- ============================================================
CREATE TABLE symptom_map (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    keyword         VARCHAR(100) NOT NULL,
    specialty_id    INT          NOT NULL,
    severity_hint   ENUM('critical','moderate','normal'),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_symptom_keyword (keyword),
    CONSTRAINT fk_symptom_specialty
        FOREIGN KEY (specialty_id) REFERENCES specialties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed symptom mappings
INSERT INTO symptom_map (keyword, specialty_id, severity_hint)
SELECT 'chest pain',          id, 'critical' FROM specialties WHERE code='CARD' UNION ALL
SELECT 'heart attack',        id, 'critical' FROM specialties WHERE code='CARD' UNION ALL
SELECT 'palpitations',        id, 'moderate' FROM specialties WHERE code='CARD' UNION ALL
SELECT 'shortness of breath', id, 'critical' FROM specialties WHERE code='CARD' UNION ALL
SELECT 'angina',              id, 'critical' FROM specialties WHERE code='CARD' UNION ALL
SELECT 'fracture',            id, 'moderate' FROM specialties WHERE code='ORTH' UNION ALL
SELECT 'broken bone',         id, 'moderate' FROM specialties WHERE code='ORTH' UNION ALL
SELECT 'joint pain',          id, 'normal'   FROM specialties WHERE code='ORTH' UNION ALL
SELECT 'sprain',              id, 'normal'   FROM specialties WHERE code='ORTH' UNION ALL
SELECT 'back pain',           id, 'normal'   FROM specialties WHERE code='ORTH' UNION ALL
SELECT 'stroke',              id, 'critical' FROM specialties WHERE code='NEURO' UNION ALL
SELECT 'seizure',             id, 'critical' FROM specialties WHERE code='NEURO' UNION ALL
SELECT 'headache',            id, 'normal'   FROM specialties WHERE code='NEURO' UNION ALL
SELECT 'migraine',            id, 'moderate' FROM specialties WHERE code='NEURO' UNION ALL
SELECT 'numbness',            id, 'moderate' FROM specialties WHERE code='NEURO' UNION ALL
SELECT 'dizziness',           id, 'moderate' FROM specialties WHERE code='NEURO' UNION ALL
SELECT 'fever',               id, 'normal'   FROM specialties WHERE code='GEN' UNION ALL
SELECT 'cold',                id, 'normal'   FROM specialties WHERE code='GEN' UNION ALL
SELECT 'flu',                 id, 'normal'   FROM specialties WHERE code='GEN' UNION ALL
SELECT 'fatigue',             id, 'normal'   FROM specialties WHERE code='GEN' UNION ALL
SELECT 'infection',           id, 'moderate' FROM specialties WHERE code='GEN' UNION ALL
SELECT 'vomiting',            id, 'moderate' FROM specialties WHERE code='GEN' UNION ALL
SELECT 'nausea',              id, 'normal'   FROM specialties WHERE code='GEN' UNION ALL
SELECT 'child fever',         id, 'moderate' FROM specialties WHERE code='PED' UNION ALL
SELECT 'infant rash',         id, 'normal'   FROM specialties WHERE code='PED' UNION ALL
SELECT 'vaccination',         id, 'normal'   FROM specialties WHERE code='PED' UNION ALL
SELECT 'asthma',              id, 'moderate' FROM specialties WHERE code='PULM' UNION ALL
SELECT 'cough',               id, 'normal'   FROM specialties WHERE code='PULM' UNION ALL
SELECT 'pneumonia',           id, 'critical' FROM specialties WHERE code='PULM' UNION ALL
SELECT 'wheezing',            id, 'moderate' FROM specialties WHERE code='PULM' UNION ALL
SELECT 'abdominal pain',      id, 'moderate' FROM specialties WHERE code='GASTRO' UNION ALL
SELECT 'diarrhea',            id, 'normal'   FROM specialties WHERE code='GASTRO' UNION ALL
SELECT 'constipation',        id, 'normal'   FROM specialties WHERE code='GASTRO' UNION ALL
SELECT 'appendicitis',        id, 'critical' FROM specialties WHERE code='GASTRO' UNION ALL
SELECT 'rash',                id, 'normal'   FROM specialties WHERE code='DERM' UNION ALL
SELECT 'acne',                id, 'normal'   FROM specialties WHERE code='DERM' UNION ALL
SELECT 'eczema',              id, 'normal'   FROM specialties WHERE code='DERM' UNION ALL
SELECT 'psoriasis',           id, 'normal'   FROM specialties WHERE code='DERM' UNION ALL
SELECT 'ear pain',            id, 'normal'   FROM specialties WHERE code='ENT' UNION ALL
SELECT 'sore throat',         id, 'normal'   FROM specialties WHERE code='ENT' UNION ALL
SELECT 'hearing loss',        id, 'moderate' FROM specialties WHERE code='ENT' UNION ALL
SELECT 'nosebleed',           id, 'moderate' FROM specialties WHERE code='ENT' UNION ALL
SELECT 'eye pain',            id, 'moderate' FROM specialties WHERE code='OPTH' UNION ALL
SELECT 'vision loss',         id, 'critical' FROM specialties WHERE code='OPTH' UNION ALL
SELECT 'blurry vision',       id, 'moderate' FROM specialties WHERE code='OPTH' UNION ALL
SELECT 'kidney stone',        id, 'critical' FROM specialties WHERE code='URO' UNION ALL
SELECT 'urinary pain',        id, 'moderate' FROM specialties WHERE code='URO' UNION ALL
SELECT 'blood in urine',      id, 'moderate' FROM specialties WHERE code='URO' UNION ALL
SELECT 'anxiety',             id, 'moderate' FROM specialties WHERE code='PSYCH' UNION ALL
SELECT 'depression',          id, 'moderate' FROM specialties WHERE code='PSYCH' UNION ALL
SELECT 'panic attack',        id, 'critical' FROM specialties WHERE code='PSYCH' UNION ALL
SELECT 'diabetes',            id, 'moderate' FROM specialties WHERE code='ENDO' UNION ALL
SELECT 'thyroid',             id, 'moderate' FROM specialties WHERE code='ENDO' UNION ALL
SELECT 'insulin shock',       id, 'critical' FROM specialties WHERE code='ENDO' UNION ALL
SELECT 'unconscious',         id, 'critical' FROM specialties WHERE code='EM' UNION ALL
SELECT 'severe bleeding',     id, 'critical' FROM specialties WHERE code='EM' UNION ALL
SELECT 'trauma',              id, 'critical' FROM specialties WHERE code='EM' UNION ALL
SELECT 'burn',                id, 'critical' FROM specialties WHERE code='EM' UNION ALL
SELECT 'poisoning',           id, 'critical' FROM specialties WHERE code='EM';


-- ============================================================
-- 4.  DOCTORS  (linked to users + specialty)
-- ============================================================
CREATE TABLE doctors (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL UNIQUE,
    specialty_id    INT          NOT NULL,
    registration_no VARCHAR(50)  UNIQUE,
    max_daily_patients INT       DEFAULT 30,
    is_available    TINYINT(1)   DEFAULT 1,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_doctors_specialty (specialty_id),
    CONSTRAINT fk_doctor_user
        FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
    CONSTRAINT fk_doctor_specialty
        FOREIGN KEY (specialty_id) REFERENCES specialties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 5.  PATIENTS  (linked to users)
-- ============================================================
CREATE TABLE patients (
    id              CHAR(36)     PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL UNIQUE,
    date_of_birth   DATE,
    gender          VARCHAR(10),
    blood_group     ENUM('A+','A-','B+','B-','O+','O-','AB+','AB-','Unknown') DEFAULT 'Unknown',
    address         TEXT,
    -- Stored as comma-separated strings (MySQL has no native array type)
    allergies               TEXT,
    chronic_conditions      TEXT,
    emergency_contact_name  VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 6.  OPD QUEUE  (Smart Triage & Priority Engine)
-- ============================================================
CREATE TABLE opd_queue (
    id              CHAR(36)     PRIMARY KEY,
    patient_id      CHAR(36)     NOT NULL,
    doctor_id       CHAR(36),
    specialty_id    INT,

    -- Triage inputs
    symptoms_text   TEXT         NOT NULL,
    severity        ENUM('critical','moderate','normal') NOT NULL DEFAULT 'normal',

    -- severity_weight is computed in Python; the mapped values are:
    --   critical=100, moderate=50, normal=20
    severity_weight INT          NOT NULL DEFAULT 20,

    arrival_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority_score  DECIMAL(10,2) DEFAULT 0,

    -- Queue metadata
    status          ENUM('waiting','in_progress','completed','no_show') NOT NULL DEFAULT 'waiting',
    queue_position  INT,
    estimated_wait_minutes INT   DEFAULT 0,
    assigned_at     DATETIME,
    started_at      DATETIME,
    completed_at    DATETIME,
    notes           TEXT,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_opd_queue_status    (status),
    INDEX idx_opd_queue_priority  (priority_score),
    INDEX idx_opd_queue_doctor    (doctor_id),
    INDEX idx_opd_queue_patient   (patient_id),
    INDEX idx_opd_queue_specialty (specialty_id),

    CONSTRAINT fk_opd_patient   FOREIGN KEY (patient_id)   REFERENCES patients(id)    ON DELETE CASCADE,
    CONSTRAINT fk_opd_doctor    FOREIGN KEY (doctor_id)    REFERENCES doctors(id),
    CONSTRAINT fk_opd_specialty FOREIGN KEY (specialty_id) REFERENCES specialties(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 7.  ADMISSIONS  (Inpatient Tracking with Color Markers)
-- ============================================================
CREATE TABLE admissions (
    id              CHAR(36)     PRIMARY KEY,
    patient_id      CHAR(36)     NOT NULL,
    doctor_id       CHAR(36),
    opd_queue_id    CHAR(36),
    ward            VARCHAR(100),
    bed_number      VARCHAR(20),
    -- Color mapping: icu=RED, under_treatment=YELLOW, admitted=BLUE, discharged=GREEN
    status          ENUM('icu','under_treatment','admitted','discharged') NOT NULL DEFAULT 'admitted',
    admitted_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    discharged_at   DATETIME,
    diagnosis       TEXT,
    treatment_plan  TEXT,
    notes           TEXT,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_admissions_status  (status),
    INDEX idx_admissions_patient (patient_id),

    CONSTRAINT fk_admission_patient   FOREIGN KEY (patient_id)   REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_admission_doctor    FOREIGN KEY (doctor_id)    REFERENCES doctors(id),
    CONSTRAINT fk_admission_opd_queue FOREIGN KEY (opd_queue_id) REFERENCES opd_queue(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 8.  EMERGENCY MODULE  (Ambulance Requests & Admin Alerts)
-- ============================================================
CREATE TABLE emergency_requests (
    id                  CHAR(36)   PRIMARY KEY,
    patient_name        VARCHAR(255) NOT NULL,
    patient_phone       VARCHAR(20),
    location_text       TEXT         NOT NULL,
    location_lat        DOUBLE,
    location_lng        DOUBLE,
    symptoms_described  TEXT         NOT NULL,
    severity            ENUM('critical','moderate','normal') NOT NULL DEFAULT 'critical',
    status              ENUM('pending','dispatched','arrived','resolved') NOT NULL DEFAULT 'pending',
    requestor_user_id   CHAR(36),
    assigned_patient_id CHAR(36),
    intake_pdf_url      TEXT,           -- local filesystem path to the PDF
    admin_alerted_at    DATETIME,
    dispatched_at       DATETIME,
    arrived_at          DATETIME,
    resolved_at         DATETIME,
    resolution_notes    TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_emergency_status (status),

    CONSTRAINT fk_emergency_requestor FOREIGN KEY (requestor_user_id)   REFERENCES users(id),
    CONSTRAINT fk_emergency_patient   FOREIGN KEY (assigned_patient_id) REFERENCES patients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin Alert Log
CREATE TABLE admin_alerts (
    id              CHAR(36)    PRIMARY KEY,
    admin_user_id   CHAR(36),
    alert_type      VARCHAR(50) NOT NULL,
    reference_id    CHAR(36),
    reference_table VARCHAR(50),
    message         TEXT        NOT NULL,
    is_read         TINYINT(1)  DEFAULT 0,
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_admin_alerts_read (is_read, created_at),

    CONSTRAINT fk_alert_admin FOREIGN KEY (admin_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 9.  BILLING & PAYMENTS
-- ============================================================
CREATE TABLE bills (
    id              CHAR(36)       PRIMARY KEY,
    patient_id      CHAR(36)       NOT NULL,
    opd_queue_id    CHAR(36),
    admission_id    CHAR(36),
    status          ENUM('pending','paid','partial','waived','refunded') NOT NULL DEFAULT 'pending',
    total_amount    DECIMAL(12,2)  DEFAULT 0,
    paid_amount     DECIMAL(12,2)  DEFAULT 0,
    -- due_amount is computed by trigger (see below)
    due_amount      DECIMAL(12,2)  DEFAULT 0,
    currency        CHAR(3)        DEFAULT 'INR',
    receipt_pdf_url TEXT,           -- local filesystem path to the receipt PDF
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_bills_patient (patient_id),
    INDEX idx_bills_status  (status),

    CONSTRAINT fk_bill_patient    FOREIGN KEY (patient_id)   REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_bill_opd        FOREIGN KEY (opd_queue_id) REFERENCES opd_queue(id),
    CONSTRAINT fk_bill_admission  FOREIGN KEY (admission_id) REFERENCES admissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bill_items (
    id              CHAR(36)      PRIMARY KEY,
    bill_id         CHAR(36)      NOT NULL,
    category        ENUM('consultation','pharmacy','lab','radiology','procedure','room','other') NOT NULL,
    description     VARCHAR(255)  NOT NULL,
    quantity        INT           DEFAULT 1,
    unit_price      DECIMAL(10,2) NOT NULL,
    -- total_price computed by trigger
    total_price     DECIMAL(10,2) DEFAULT 0,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_item_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payments (
    id              CHAR(36)      PRIMARY KEY,
    bill_id         CHAR(36)      NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    method          ENUM('cash','card','upi','insurance','simulated') NOT NULL DEFAULT 'simulated',
    reference_no    VARCHAR(100),
    paid_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 10.  DOCUMENT STORAGE  (PDF tracking – local filesystem)
-- ============================================================
CREATE TABLE documents (
    id              CHAR(36)     PRIMARY KEY,
    doc_type        ENUM('emergency_intake','billing_receipt','medical_report','discharge_summary') NOT NULL,
    reference_id    CHAR(36)     NOT NULL,
    reference_table VARCHAR(50)  NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    storage_path    TEXT         NOT NULL,   -- local filesystem path
    public_url      TEXT,                    -- served via /files/... FastAPI static mount
    uploaded_by     CHAR(36),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_documents_ref (reference_id, reference_table),

    CONSTRAINT fk_doc_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 11.  MEDICINES  (Catalogue & Patient Prescriptions)
-- ============================================================
CREATE TABLE medicines (
    id              CHAR(36)     PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    dosage_form     VARCHAR(50),               -- Tablet, Syrup, Injection, etc.
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_medicines_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE patient_medicines (
    id                   CHAR(36) PRIMARY KEY,
    patient_id           CHAR(36) NOT NULL,
    medicine_id          CHAR(36) NOT NULL,
    dosage_instructions  TEXT NOT NULL,
    prescribed_by        CHAR(36),              -- user_id of prescribing admin/doctor
    prescribed_at        DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_pm_patient (patient_id),

    CONSTRAINT fk_pm_patient  FOREIGN KEY (patient_id)   REFERENCES patients(id)  ON DELETE CASCADE,
    CONSTRAINT fk_pm_medicine FOREIGN KEY (medicine_id)  REFERENCES medicines(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_prescriber FOREIGN KEY (prescribed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 12.  AUDIT LOG  (Tamper-proof change tracking)
-- ============================================================
CREATE TABLE audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     CHAR(36),
    action      VARCHAR(100) NOT NULL,
    table_name  VARCHAR(100),
    record_id   CHAR(36),
    old_data    JSON,
    new_data    JSON,
    ip_address  VARCHAR(45),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_audit_log_user  (user_id, created_at),
    INDEX idx_audit_log_table (table_name, record_id),

    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- 12.  TRIGGERS
-- ============================================================

DELIMITER $$

-- Compute total_price on bill_items insert/update
CREATE TRIGGER trg_bill_items_total_before_insert
BEFORE INSERT ON bill_items
FOR EACH ROW
BEGIN
    SET NEW.total_price = NEW.quantity * NEW.unit_price;
END$$

CREATE TRIGGER trg_bill_items_total_before_update
BEFORE UPDATE ON bill_items
FOR EACH ROW
BEGIN
    SET NEW.total_price = NEW.quantity * NEW.unit_price;
END$$

-- Sync bill total_amount and due_amount after bill_items change
CREATE TRIGGER trg_sync_bill_total_after_insert
AFTER INSERT ON bill_items
FOR EACH ROW
BEGIN
    UPDATE bills
    SET total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM bill_items WHERE bill_id = NEW.bill_id),
        due_amount   = total_amount - paid_amount
    WHERE id = NEW.bill_id;
END$$

CREATE TRIGGER trg_sync_bill_total_after_update
AFTER UPDATE ON bill_items
FOR EACH ROW
BEGIN
    UPDATE bills
    SET total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM bill_items WHERE bill_id = NEW.bill_id),
        due_amount   = total_amount - paid_amount
    WHERE id = NEW.bill_id;
END$$

CREATE TRIGGER trg_sync_bill_total_after_delete
AFTER DELETE ON bill_items
FOR EACH ROW
BEGIN
    UPDATE bills
    SET total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM bill_items WHERE bill_id = OLD.bill_id),
        due_amount   = total_amount - paid_amount
    WHERE id = OLD.bill_id;
END$$

-- Sync paid_amount and status after a payment is recorded
CREATE TRIGGER trg_sync_paid_amount_after_payment
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
    DECLARE v_paid   DECIMAL(12,2);
    DECLARE v_total  DECIMAL(12,2);

    SELECT COALESCE(SUM(amount), 0) INTO v_paid  FROM payments  WHERE bill_id = NEW.bill_id;
    SELECT COALESCE(total_amount, 0) INTO v_total FROM bills     WHERE id      = NEW.bill_id;

    UPDATE bills
    SET paid_amount = v_paid,
        due_amount  = v_total - v_paid,
        status      = CASE
                        WHEN v_paid >= v_total THEN 'paid'
                        WHEN v_paid > 0        THEN 'partial'
                        ELSE                        'pending'
                      END
    WHERE id = NEW.bill_id;
END$$

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
