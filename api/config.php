<?php
// EquipVault — API Configuration & Database Setup
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

function getDatabaseConnection() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $sqliteFile = __DIR__ . '/../data/equipment_borrowing.sqlite';
    $dataDir = dirname($sqliteFile);
    if (!is_dir($dataDir)) mkdir($dataDir, 0777, true);

    try {
        $pdo = new PDO("sqlite:" . $sqliteFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec("PRAGMA foreign_keys = ON;");
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database Error: ' . $e->getMessage()]);
        exit();
    }

    initializeDatabase($pdo);
    return $pdo;
}

function initializeDatabase($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS equipment (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(50) NOT NULL,
        condition VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Available',
        serial_number VARCHAR(100),
        location VARCHAR(100),
        description TEXT,
        image_url VARCHAR(255),
        total_borrows INTEGER DEFAULT 0,
        total_units INTEGER DEFAULT 1,
        available_units INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) DEFAULT 'password123',
        role VARCHAR(50) NOT NULL,
        department VARCHAR(100),
        borrower_id VARCHAR(50),
        phone VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    try { $pdo->exec("ALTER TABLE users ADD COLUMN password VARCHAR(255) DEFAULT 'password123'"); } catch (Exception $e) {}

    // Auto-migrate equipment table for unit limitation stock
    try { $pdo->exec("ALTER TABLE equipment ADD COLUMN total_units INTEGER DEFAULT 1"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE equipment ADD COLUMN available_units INTEGER DEFAULT 1"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS borrow_requests (
        id VARCHAR(50) PRIMARY KEY,
        equipment_id VARCHAR(50) NOT NULL,
        borrower_name VARCHAR(100) NOT NULL,
        borrower_email VARCHAR(100) NOT NULL,
        borrower_id_number VARCHAR(50) NOT NULL,
        department VARCHAR(100) NOT NULL,
        contact_number VARCHAR(50),
        borrow_date DATETIME NOT NULL,
        expected_return_date DATETIME NOT NULL,
        purpose TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        units INTEGER DEFAULT 1,
        rejection_reason TEXT,
        approval_notes TEXT,
        approved_by VARCHAR(100),
        approved_at DATETIME,
        released_by VARCHAR(100),
        released_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    )");

    try { $pdo->exec("ALTER TABLE borrow_requests ADD COLUMN units INTEGER DEFAULT 1"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS borrow_returns (
        id VARCHAR(50) PRIMARY KEY,
        request_id VARCHAR(50) NOT NULL,
        equipment_id VARCHAR(50) NOT NULL,
        borrower_name VARCHAR(100) NOT NULL,
        borrow_date DATETIME NOT NULL,
        expected_return_date DATETIME NOT NULL,
        actual_return_date DATETIME NOT NULL,
        is_overdue INTEGER DEFAULT 0,
        days_overdue INTEGER DEFAULT 0,
        condition_on_return VARCHAR(50) NOT NULL,
        custodian_notes TEXT,
        received_by VARCHAR(100) NOT NULL,
        units INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES borrow_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
    )");

    try { $pdo->exec("ALTER TABLE borrow_returns ADD COLUMN units INTEGER DEFAULT 1"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action VARCHAR(100) NOT NULL,
        details TEXT NOT NULL,
        performed_by VARCHAR(100) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // Ensure total_units and available_units are correctly populated on existing records
    try {
        $pdo->exec("UPDATE equipment SET total_units = 1 WHERE total_units IS NULL OR total_units < 1");
        $pdo->exec("UPDATE borrow_requests SET units = 1 WHERE units IS NULL OR units < 1");
        $pdo->exec("UPDATE borrow_returns SET units = 1 WHERE units IS NULL OR units < 1");
        
        // Sync available units based on actual active borrow requests
        $stmt = $pdo->query("SELECT equipment_id, SUM(COALESCE(units, 1)) as loaned_units FROM borrow_requests WHERE status = 'Active' GROUP BY equipment_id");
        $activeLoans = $stmt ? $stmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        $eqStmt = $pdo->query("SELECT id, status, condition, total_units, available_units FROM equipment");
        if ($eqStmt) {
            $upd = $pdo->prepare("UPDATE equipment SET available_units = ?, status = ? WHERE id = ?");
            foreach ($eqStmt->fetchAll(PDO::FETCH_ASSOC) as $eq) {
                $tot = max(1, (int)$eq['total_units']);
                $loaned = isset($activeLoans[$eq['id']]) ? (int)$activeLoans[$eq['id']] : 0;
                $newAvail = max(0, $tot - $loaned);
                $newStatus = $eq['status'];
                if ($newStatus !== 'Under Maintenance') {
                    $newStatus = ($newAvail <= 0) ? 'Borrowed' : 'Available';
                }
                if ($newAvail !== (int)$eq['available_units'] || $newStatus !== $eq['status']) {
                    $upd->execute([$newAvail, $newStatus, $eq['id']]);
                }
            }
        }
    } catch (Exception $e) {}

    $count = $pdo->query("SELECT COUNT(*) FROM equipment")->fetchColumn();
    if ($count == 0) seedSampleData($pdo);
}

function seedSampleData($pdo) {
    $equipment = [
        ['EQP-CMP-001','MacBook Pro M2 Max 16"','Computing','Excellent','Available','MBP-2024-99182','Main IT Cage - Shelf A1','Apple M2 Max 32GB RAM, 1TB SSD. Pre-loaded with developer and design suites.','assets/images/laptop.jpg',14, 5, 5],
        ['EQP-MED-002','Sony FX6 Cinema Camera System','Media & AV','Excellent','Borrowed','SNY-FX6-40291','Media Studio Vault - Locker 3','Full-frame 4K cinema camera with 16-35mm zoom lens and V-mount battery.','assets/images/camera.jpg',22, 3, 0],
        ['EQP-LAB-003','Rohde & Schwarz Digital Oscilloscope','Laboratory','Good','Available','RTP-6002-88','EE Lab Room 302 - Station 4','4-Channel 1GHz Oscilloscope with probes, waveform generator, and bus decode.','assets/images/lab.jpg',8, 4, 4],
        ['EQP-ROB-004','Orion Industrial Survey Drone Kit','Robotics','Excellent','Available','DRN-ORN-7741','Robotics Lab - Flight Cabinet B','Dual thermal & 4K optical gimbal payload, smart batteries, and controller.','assets/images/drone.jpg',19, 2, 2],
        ['EQP-CMP-005','Dell Precision 5820 VR Workstation','Computing','Good','Under Maintenance','DEL-P5820-112','Engineering Hub - Lab 101','Intel Xeon W-2245, 64GB DDR4, RTX A5000 24GB. Scheduled for thermal repasting.','assets/images/laptop.jpg',31, 1, 0],
        ['EQP-MED-006','Epson Pro EX9240 Wireless Projector','Media & AV','Good','Borrowed','EPS-9240-5582','AV Store - Shelf C2','4,000 lumens Full HD 1080p, Miracast streaming. Includes carry case.','assets/images/camera.jpg',45, 6, 0]
    ];
    $stmt = $pdo->prepare("INSERT INTO equipment (id,name,category,condition,status,serial_number,location,description,image_url,total_borrows,total_units,available_units) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    foreach ($equipment as $e) $stmt->execute($e);

    // Users (5 Institutional Administrators/Custodians + 1 Student Borrower)
    $users = [
        ['USR-ADM-001','Alexander Vance','admin@equipvault.edu',password_hash('VaultAdmin2026!', PASSWORD_BCRYPT),'Administrator','Equipment & Facilities IT','ADM-2026-001','+1 (555) 019-2831'],
        ['USR-ADM-002','Elena Rostova','custodian@equipvault.edu',password_hash('DepotMaster2026!', PASSWORD_BCRYPT),'Equipment Custodian','Media & Equipment Depot','CST-2026-002','+1 (555) 018-9943'],
        ['USR-ADM-003','Marcus Sterling','msterling@equipvault.edu',password_hash('MediaVault2026!', PASSWORD_BCRYPT),'Administrator','Media Arts & AV Vault','ADM-2026-003','+1 (555) 021-4477'],
        ['USR-ADM-004','Dr. Samantha Reynolds','sreynolds@equipvault.edu',password_hash('RoboAdmin2026!', PASSWORD_BCRYPT),'Administrator','Engineering & Robotics Lab','ADM-2026-004','+1 (555) 023-8812'],
        ['USR-CST-005','David K. Mendoza','dmendoza@equipvault.edu',password_hash('AuditLogistics2026!', PASSWORD_BCRYPT),'Equipment Custodian','Logistics & Compliance Depot','CST-2026-005','+1 (555) 027-1190'],
        ['USR-ADM-006','Mary Jane F. Balag','maryjane@gmail.com',password_hash('janeaimcmc27', PASSWORD_BCRYPT),'Administrator','Equipment & Facilities IT','ADM20268','09631174527'],
        ['USR-BRW-001','Maria Santos','borrower@equipvault.edu',password_hash('BorrowerPass2026!', PASSWORD_BCRYPT),'Borrower','Information Technology','STU-2026-001','+1 (555) 014-3829']
    ];
    $uStmt = $pdo->prepare("INSERT INTO users (id,name,email,password,role,department,borrower_id,phone) VALUES (?,?,?,?,?,?,?,?)");
    foreach ($users as $u) $uStmt->execute($u);

    // Seed requests
    $now = date('Y-m-d H:i:s');
    $rStmt = $pdo->prepare("INSERT INTO borrow_requests (id,equipment_id,borrower_name,borrower_email,borrower_id_number,department,contact_number,borrow_date,expected_return_date,purpose,status,approved_by,approved_at,released_by,released_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

    // Active (overdue)
    $rStmt->execute(['REQ-20261016A','EQP-MED-002','Carlos Rivera','crivera@student.edu','STU-2026-042','Film & Media Arts','+1 (555) 019-4421',
        date('Y-m-d H:i:s', strtotime('-5 days')), date('Y-m-d H:i:s', strtotime('-1 days')),
        'Senior thesis documentary filming.','Active','Administrator',date('Y-m-d H:i:s', strtotime('-5 days')),'Equipment Custodian',date('Y-m-d H:i:s', strtotime('-5 days'))]);

    // Active (on time)
    $rStmt->execute(['REQ-20261018B','EQP-MED-006','Aisha Patel','apatel@student.edu','STU-2026-077','Business Administration','+1 (555) 022-8831',
        date('Y-m-d H:i:s', strtotime('-3 days')), date('Y-m-d H:i:s', strtotime('+2 days')),
        'MBA capstone pitch presentation.','Active','Administrator',date('Y-m-d H:i:s', strtotime('-3 days')),'Equipment Custodian',date('Y-m-d H:i:s', strtotime('-3 days'))]);

    // Pending
    $rStmt->execute(['REQ-20261020C','EQP-LAB-003','James Chen','jchen@student.edu','STU-2026-031','Electrical Engineering','+1 (555) 018-3310',
        $now, date('Y-m-d H:i:s', strtotime('+6 days')),
        'Signal analysis for embedded systems project.','Pending',null,null,null,null]);

    // Seed returns
    $retStmt = $pdo->prepare("INSERT INTO borrow_returns (id,request_id,equipment_id,borrower_name,borrow_date,expected_return_date,actual_return_date,is_overdue,days_overdue,condition_on_return,custodian_notes,received_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    $retStmt->execute(['RET-20261010A','REQ-20261005X','EQP-CMP-001','Emma Watson',
        date('Y-m-d H:i:s', strtotime('-15 days')), date('Y-m-d H:i:s', strtotime('-8 days')), date('Y-m-d H:i:s', strtotime('-7 days')),
        0,0,'Excellent','All accessories accounted for.','Equipment Custodian']);
    $retStmt->execute(['RET-20261012B','REQ-20261002Y','EQP-ROB-004','Lucas Kim',
        date('Y-m-d H:i:s', strtotime('-20 days')), date('Y-m-d H:i:s', strtotime('-12 days')), date('Y-m-d H:i:s', strtotime('-10 days')),
        1,2,'Good','Minor scuff on landing gear. Batteries returned at 40%.','Administrator']);

    // Activity logs
    $logStmt = $pdo->prepare("INSERT INTO activity_logs (action,details,performed_by) VALUES (?,?,?)");
    $logStmt->execute(['SYSTEM_INIT','EquipVault system initialized with seed data.','System']);
    $logStmt->execute(['EQUIPMENT_REGISTERED','6 equipment items seeded into inventory.','System']);
    $logStmt->execute(['REQUEST_SUBMITTED','Borrowing request REQ-20261016A submitted.','Carlos Rivera']);
    $logStmt->execute(['REQUEST_APPROVED','Request REQ-20261016A approved.','Administrator']);
    $logStmt->execute(['EQUIPMENT_RELEASED','Camera system released to Carlos Rivera.','Equipment Custodian']);
    $logStmt->execute(['RETURN_PROCESSED','MacBook Pro returned by Emma Watson (on-time).','Equipment Custodian']);
}

function sendJsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit();
}
