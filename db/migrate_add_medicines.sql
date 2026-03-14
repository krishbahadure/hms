-- ============================================================
-- HMS – Migration: Add Medicines Tables
-- Run this ONLY if you already have an existing hms_db
-- (i.e., you ran schema.sql before and don't want to drop everything)
-- ============================================================

USE hms_db;

CREATE TABLE IF NOT EXISTS medicines (
    id              CHAR(36)     PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    dosage_form     VARCHAR(50),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_medicines_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patient_medicines (
    id                   CHAR(36) PRIMARY KEY,
    patient_id           CHAR(36) NOT NULL,
    medicine_id          CHAR(36) NOT NULL,
    dosage_instructions  TEXT NOT NULL,
    prescribed_by        CHAR(36),
    prescribed_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pm_patient (patient_id),
    CONSTRAINT fk_pm_patient    FOREIGN KEY (patient_id)  REFERENCES patients(id)  ON DELETE CASCADE,
    CONSTRAINT fk_pm_medicine   FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_prescriber FOREIGN KEY (prescribed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Done!
SELECT 'Migration complete: medicines and patient_medicines tables created.' AS status;
