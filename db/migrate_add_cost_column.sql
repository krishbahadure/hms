-- ============================================================
-- HMS – Migration: Add cost column to medicines table
-- ============================================================

USE hms_db;

ALTER TABLE medicines
    ADD COLUMN cost DECIMAL(10,2) DEFAULT NULL COMMENT 'Cost per unit in INR';

SELECT 'Migration complete: cost column added to medicines table.' AS status;
