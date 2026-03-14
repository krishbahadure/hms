-- ============================================================
-- HMS Round 2 Migration – Emergency extended fields + medicine cost
-- Run this ONLY if you already have an existing hms_db
-- ============================================================

USE hms_db;

-- Add new columns to emergency_requests
ALTER TABLE emergency_requests
    ADD COLUMN age VARCHAR(10) DEFAULT NULL,
    ADD COLUMN gender VARCHAR(20) DEFAULT NULL,
    ADD COLUMN blood_group VARCHAR(10) DEFAULT NULL,
    ADD COLUMN emergency_contact VARCHAR(30) DEFAULT NULL,
    ADD COLUMN address TEXT DEFAULT NULL,
    ADD COLUMN existing_diseases TEXT DEFAULT NULL,
    ADD COLUMN allergies_info TEXT DEFAULT NULL,
    ADD COLUMN current_medications TEXT DEFAULT NULL,
    ADD COLUMN medical_history TEXT DEFAULT NULL,
    ADD COLUMN hospital_preference VARCHAR(255) DEFAULT NULL,
    ADD COLUMN time_of_request VARCHAR(50) DEFAULT NULL,
    ADD COLUMN additional_notes TEXT DEFAULT NULL;

-- Add cost to medicines
ALTER TABLE medicines
    ADD COLUMN cost DECIMAL(10,2) DEFAULT NULL;

SELECT 'Round 2 migration complete.' AS status;