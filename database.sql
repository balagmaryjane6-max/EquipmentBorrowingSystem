-- ========================================================
-- EquipVault — Equipment Borrowing & Inventory System
-- Database Schema for MySQL / phpMyAdmin (XAMPP)
-- ========================================================

CREATE DATABASE IF NOT EXISTS `equipment_borrowing` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `equipment_borrowing`;

-- Table 1: Equipment
DROP TABLE IF EXISTS `activity_logs`;
DROP TABLE IF EXISTS `borrow_returns`;
DROP TABLE IF EXISTS `borrow_requests`;
DROP TABLE IF EXISTS `equipment`;
DROP TABLE IF EXISTS `users`;

CREATE TABLE `equipment` (
    `id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `condition` VARCHAR(50) NOT NULL DEFAULT 'Good',
    `status` VARCHAR(50) NOT NULL DEFAULT 'Available',
    `serial_number` VARCHAR(100) DEFAULT NULL,
    `location` VARCHAR(100) DEFAULT NULL,
    `description` TEXT DEFAULT NULL,
    `image_url` VARCHAR(255) DEFAULT NULL,
    `total_borrows` INT(11) DEFAULT 0,
    `total_units` INT(11) NOT NULL DEFAULT 1,
    `available_units` INT(11) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table 2: Users (Admin, Custodian, Borrower)
CREATE TABLE `users` (
    `id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('Administrator', 'Equipment Custodian', 'Borrower') NOT NULL DEFAULT 'Borrower',
    `department` VARCHAR(100) DEFAULT NULL,
    `borrower_id` VARCHAR(50) DEFAULT NULL,
    `phone` VARCHAR(50) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table 3: Borrow Requests
CREATE TABLE `borrow_requests` (
    `id` VARCHAR(50) NOT NULL,
    `equipment_id` VARCHAR(50) NOT NULL,
    `borrower_name` VARCHAR(100) NOT NULL,
    `borrower_email` VARCHAR(100) NOT NULL,
    `borrower_id_number` VARCHAR(50) NOT NULL,
    `department` VARCHAR(100) NOT NULL,
    `contact_number` VARCHAR(50) DEFAULT NULL,
    `borrow_date` DATETIME NOT NULL,
    `expected_return_date` DATETIME NOT NULL,
    `purpose` TEXT NOT NULL,
    `status` ENUM('Pending', 'Approved', 'Active', 'Returned', 'Rejected') NOT NULL DEFAULT 'Pending',
    `units` INT(11) NOT NULL DEFAULT 1,
    `rejection_reason` TEXT DEFAULT NULL,
    `approval_notes` TEXT DEFAULT NULL,
    `approved_by` VARCHAR(100) DEFAULT NULL,
    `approved_at` DATETIME DEFAULT NULL,
    `released_by` VARCHAR(100) DEFAULT NULL,
    `released_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_eq_id` (`equipment_id`),
    CONSTRAINT `fk_req_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table 4: Borrow Returns
CREATE TABLE `borrow_returns` (
    `id` VARCHAR(50) NOT NULL,
    `request_id` VARCHAR(50) NOT NULL,
    `equipment_id` VARCHAR(50) NOT NULL,
    `borrower_name` VARCHAR(100) NOT NULL,
    `borrow_date` DATETIME NOT NULL,
    `expected_return_date` DATETIME NOT NULL,
    `actual_return_date` DATETIME NOT NULL,
    `is_overdue` TINYINT(1) DEFAULT 0,
    `days_overdue` INT(11) DEFAULT 0,
    `condition_on_return` VARCHAR(50) NOT NULL,
    `custodian_notes` TEXT DEFAULT NULL,
    `received_by` VARCHAR(100) NOT NULL,
    `units` INT(11) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ret_req` (`request_id`),
    KEY `idx_ret_eq` (`equipment_id`),
    CONSTRAINT `fk_ret_request` FOREIGN KEY (`request_id`) REFERENCES `borrow_requests` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ret_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table 5: Activity Logs
CREATE TABLE `activity_logs` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `action` VARCHAR(100) NOT NULL,
    `details` TEXT NOT NULL,
    `performed_by` VARCHAR(100) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- Seed Initial Data
-- ========================================================

-- Seed Equipment
INSERT INTO `equipment` (`id`, `name`, `category`, `condition`, `status`, `serial_number`, `location`, `description`, `image_url`, `total_borrows`, `total_units`, `available_units`) VALUES
('EQP-CMP-001', 'MacBook Pro M2 Max 16"', 'Computing', 'Excellent', 'Available', 'MBP-2024-99182', 'Main IT Cage - Shelf A1', 'Apple M2 Max 32GB RAM, 1TB SSD. Pre-loaded with developer and design suites.', 'assets/images/laptop.jpg', 14, 5, 5),
('EQP-MED-002', 'Sony FX6 Cinema Camera System', 'Media & AV', 'Excellent', 'Borrowed', 'SNY-FX6-40291', 'Media Studio Vault - Locker 3', 'Full-frame 4K cinema camera with 16-35mm zoom lens and V-mount battery.', 'assets/images/camera.jpg', 22, 3, 0),
('EQP-LAB-003', 'Rohde & Schwarz Digital Oscilloscope', 'Laboratory', 'Good', 'Available', 'RTP-6002-88', 'EE Lab Room 302 - Station 4', '4-Channel 1GHz Oscilloscope with probes, waveform generator, and bus decode.', 'assets/images/lab.jpg', 8, 4, 4),
('EQP-ROB-004', 'Orion Industrial Survey Drone Kit', 'Robotics', 'Excellent', 'Available', 'DRN-ORN-7741', 'Robotics Lab - Flight Cabinet B', 'Dual thermal & 4K optical gimbal payload, smart batteries, and controller.', 'assets/images/drone.jpg', 19, 2, 2),
('EQP-CMP-005', 'Dell Precision 5820 VR Workstation', 'Computing', 'Good', 'Under Maintenance', 'DEL-P5820-112', 'Engineering Hub - Lab 101', 'Intel Xeon W-2245, 64GB DDR4, RTX A5000 24GB. Scheduled for thermal repasting.', 'assets/images/laptop.jpg', 31, 1, 0),
('EQP-MED-006', 'Epson Pro EX9240 Wireless Projector', 'Media & AV', 'Good', 'Borrowed', 'EPS-9240-5582', 'AV Store - Shelf C2', '4,000 lumens Full HD 1080p, Miracast streaming. Includes carry case.', 'assets/images/camera.jpg', 45, 6, 0);

-- Seed Default Users (5 Institutional Admins/Custodians + Borrower)
INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `department`, `borrower_id`, `phone`) VALUES
('USR-ADM-001', 'Alexander Vance', 'admin@equipvault.edu', '$2y$10$QOqEwKkQ98F807fB3WzHse2e8L4wWqI25p44U34u8o5M1v9A8kYvS', 'Administrator', 'Equipment & Facilities IT', 'ADM20261', '+1 (555) 019-2831'),
('USR-CST-002', 'Elena Rostova', 'custodian@equipvault.edu', '$2y$10$QOqEwKkQ98F807fB3WzHse2e8L4wWqI25p44U34u8o5M1v9A8kYvS', 'Equipment Custodian', 'Media & Equipment Depot', 'CST20262', '+1 (555) 018-9943'),
('USR-ADM-003', 'Marcus Sterling', 'msterling@equipvault.edu', '$2y$10$QOqEwKkQ98F807fB3WzHse2e8L4wWqI25p44U34u8o5M1v9A8kYvS', 'Administrator', 'Media Arts & AV Vault', 'ADM20263', '+1 (555) 021-4477'),
('USR-ADM-004', 'Dr. Samantha Reynolds', 'sreynolds@equipvault.edu', '$2y$10$QOqEwKkQ98F807fB3WzHse2e8L4wWqI25p44U34u8o5M1v9A8kYvS', 'Administrator', 'Engineering & Robotics Lab', 'ADM20264', '+1 (555) 023-8812'),
('USR-CST-005', 'David K. Mendoza', 'dmendoza@equipvault.edu', '$2y$10$QOqEwKkQ98F807fB3WzHse2e8L4wWqI25p44U34u8o5M1v9A8kYvS', 'Equipment Custodian', 'Logistics & Compliance Depot', 'CST20265', '+1 (555) 027-1190'),
('USR-ADM-006', 'Mary Jane F. Balag', 'maryjane@gmail.com', '$2y$10$u8N3Z6gYt8sQ3CqG.9bTzeQ8eT5vYwU12p44U34u8o5M1v9A8kYvS', 'Administrator', 'Equipment & Facilities IT', 'ADM20268', '09631174527'),
('USR-BRW-001', 'Student Borrower', 'borrower@equipvault.edu', '$2y$10$QOqEwKkQ98F807fB3WzHse2e8L4wWqI25p44U34u8o5M1v9A8kYvS', 'Borrower', 'Information Technology', '202600101', '+1 (555) 014-3829');

-- Seed Borrow Requests
INSERT INTO `borrow_requests` (`id`, `equipment_id`, `borrower_name`, `borrower_email`, `borrower_id_number`, `department`, `contact_number`, `borrow_date`, `expected_return_date`, `purpose`, `status`, `approved_by`, `approved_at`, `released_by`, `released_at`) VALUES
('REQ-20261016A', 'EQP-MED-002', 'Carlos Rivera', 'crivera@student.edu', 'STU-2026-042', 'Film & Media Arts', '+1 (555) 019-4421', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'Senior thesis documentary filming.', 'Active', 'Administrator', DATE_SUB(NOW(), INTERVAL 5 DAY), 'Equipment Custodian', DATE_SUB(NOW(), INTERVAL 5 DAY)),
('REQ-20261018B', 'EQP-MED-006', 'Aisha Patel', 'apatel@student.edu', 'STU-2026-077', 'Business Administration', '+1 (555) 022-8831', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY), 'MBA capstone pitch presentation.', 'Active', 'Administrator', DATE_SUB(NOW(), INTERVAL 3 DAY), 'Equipment Custodian', DATE_SUB(NOW(), INTERVAL 3 DAY)),
('REQ-20261020C', 'EQP-LAB-003', 'James Chen', 'jchen@student.edu', 'STU-2026-031', 'Electrical Engineering', '+1 (555) 018-3310', NOW(), DATE_ADD(NOW(), INTERVAL 6 DAY), 'Signal analysis for embedded systems project.', 'Pending', NULL, NULL, NULL, NULL);

-- Seed Returns
INSERT INTO `borrow_returns` (`id`, `request_id`, `equipment_id`, `borrower_name`, `borrow_date`, `expected_return_date`, `actual_return_date`, `is_overdue`, `days_overdue`, `condition_on_return`, `custodian_notes`, `received_by`) VALUES
('RET-20261010A', 'REQ-20261005X', 'EQP-CMP-001', 'Emma Watson', DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), 0, 0, 'Excellent', 'All accessories accounted for.', 'Equipment Custodian'),
('RET-20261012B', 'REQ-20261002Y', 'EQP-ROB-004', 'Lucas Kim', DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY), 1, 2, 'Good', 'Minor scuff on landing gear. Batteries returned at 40%.', 'Administrator');

-- Seed Activity Logs
INSERT INTO `activity_logs` (`action`, `details`, `performed_by`) VALUES
('SYSTEM_INIT', 'EquipVault system initialized.', 'System'),
('EQUIPMENT_REGISTERED', '6 equipment items registered into inventory.', 'System'),
('REQUEST_SUBMITTED', 'Borrowing request REQ-20261016A submitted.', 'Carlos Rivera'),
('REQUEST_APPROVED', 'Request REQ-20261016A approved.', 'Administrator'),
('EQUIPMENT_RELEASED', 'Camera system released to Carlos Rivera.', 'Equipment Custodian'),
('RETURN_PROCESSED', 'MacBook Pro returned by Emma Watson (on-time).', 'Equipment Custodian');
