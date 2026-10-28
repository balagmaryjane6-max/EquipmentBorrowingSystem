<?php
// EquipVault — Borrow Requests API
require_once __DIR__ . '/config.php';
$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    if ($method === 'GET') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("SELECT r.*, e.name AS equipment_name, e.image_url AS equipment_image, e.category AS equipment_category 
                                  FROM borrow_requests r 
                                  LEFT JOIN equipment e ON r.equipment_id = e.id 
                                  WHERE r.id = ?");
            $stmt->execute([$id]);
            $item = $stmt->fetch();
            sendJsonResponse(['data' => $item ?: null]);
        }

        $query = "SELECT r.*, e.name AS equipment_name, e.image_url AS equipment_image, e.category AS equipment_category 
                  FROM borrow_requests r 
                  LEFT JOIN equipment e ON r.equipment_id = e.id 
                  WHERE 1=1";
        $params = [];

        if (!empty($_GET['status']) && $_GET['status'] !== 'All') {
            $query .= " AND r.status = ?";
            $params[] = $_GET['status'];
        }

        if (!empty($_GET['borrower_id'])) {
            $query .= " AND r.borrower_id_number = ?";
            $params[] = $_GET['borrower_id'];
        }

        if (!empty($_GET['borrower_email'])) {
            $query .= " AND LOWER(r.borrower_email) = LOWER(?)";
            $params[] = trim($_GET['borrower_email']);
        }

        if (!empty($_GET['search'])) {
            $s = '%' . strtolower(trim($_GET['search'])) . '%';
            $query .= " AND (LOWER(r.id) LIKE ? OR LOWER(r.borrower_name) LIKE ? OR LOWER(e.name) LIKE ? OR LOWER(r.borrower_id_number) LIKE ?)";
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
        }

        $query .= " ORDER BY r.created_at DESC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        // Calculate overdue info for active items
        $now = new DateTime();
        foreach ($rows as &$row) {
            if ($row['status'] === 'Active') {
                $due = new DateTime($row['expected_return_date']);
                if ($now > $due) {
                    $row['is_overdue'] = true;
                    $diff = $now->diff($due);
                    $row['overdue_days'] = $diff->days;
                } else {
                    $row['is_overdue'] = false;
                    $row['overdue_days'] = 0;
                }
            } else {
                $row['is_overdue'] = false;
                $row['overdue_days'] = 0;
            }
        }

        sendJsonResponse(['data' => $rows]);
    }

    if ($method === 'POST') {
        $equipmentId = $data['equipment_id'] ?? '';
        $borrowerName = $data['borrower_name'] ?? '';
        $borrowerEmail = $data['borrower_email'] ?? '';
        $borrowerIdNumber = $data['borrower_id_number'] ?? '';
        $department = $data['department'] ?? '';
        $borrowDate = $data['borrow_date'] ?? date('Y-m-d H:i:s');
        $expectedReturnDate = $data['expected_return_date'] ?? '';
        $purpose = $data['purpose'] ?? '';
        $contactNumber = $data['contact_number'] ?? '';
        $units = max(1, (int)($data['units'] ?? 1));

        if (empty($equipmentId) || empty($borrowerName) || empty($expectedReturnDate) || empty($purpose)) {
            sendJsonResponse(['error' => 'Equipment ID, borrower name, return date, and purpose are required.'], 400);
        }

        // Check if equipment is available and has sufficient units
        $eqStmt = $pdo->prepare("SELECT name, status, total_units, available_units FROM equipment WHERE id = ?");
        $eqStmt->execute([$equipmentId]);
        $equipment = $eqStmt->fetch();

        if (!$equipment) {
            sendJsonResponse(['error' => 'Equipment not found.'], 404);
        }
        if ($equipment['status'] === 'Under Maintenance') {
            sendJsonResponse(['error' => "Equipment is currently Under Maintenance and cannot be requested."], 400);
        }

        $avail = isset($equipment['available_units']) ? (int)$equipment['available_units'] : ($equipment['status'] === 'Available' ? 1 : 0);
        $totalStock = isset($equipment['total_units']) ? (int)$equipment['total_units'] : 1;

        if ($avail <= 0) {
            sendJsonResponse(['error' => "Out of stock. All {$totalStock} unit(s) of '{$equipment['name']}' are currently borrowed or reserved."], 400);
        }

        if ($units > $avail) {
            sendJsonResponse(['error' => "Stock limitation exceeded. You requested {$units} unit(s), but only {$avail} unit(s) of '{$equipment['name']}' are available in stock."], 400);
        }

        $reqId = 'REQ-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -4));

        $stmt = $pdo->prepare("INSERT INTO borrow_requests 
            (id, equipment_id, borrower_name, borrower_email, borrower_id_number, department, contact_number, borrow_date, expected_return_date, purpose, status, units) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)");

        $stmt->execute([
            $reqId, $equipmentId, $borrowerName, $borrowerEmail,
            $borrowerIdNumber, $department, $contactNumber, $borrowDate, $expectedReturnDate, $purpose, $units
        ]);

        $log = $pdo->prepare("INSERT INTO activity_logs (action, details, performed_by) VALUES (?, ?, ?)");
        $log->execute(['REQUEST_SUBMITTED', "Request {$reqId} submitted by {$borrowerName} for {$units} unit(s) of {$equipment['name']}", $borrowerName]);

        sendJsonResponse([
            'success' => true,
            'id' => $reqId,
            'message' => 'Borrow request submitted successfully.'
        ], 201);
    }

    if ($method === 'PUT') {
        $id = $data['id'] ?? '';
        $action = $data['action'] ?? '';

        if (empty($id) || empty($action)) {
            sendJsonResponse(['error' => 'Request ID and action are required.'], 400);
        }

        // Fetch request
        $stmt = $pdo->prepare("SELECT r.*, e.name AS equipment_name, e.available_units, e.total_units FROM borrow_requests r LEFT JOIN equipment e ON r.equipment_id = e.id WHERE r.id = ?");
        $stmt->execute([$id]);
        $req = $stmt->fetch();

        if (!$req) {
            sendJsonResponse(['error' => 'Request not found.'], 404);
        }

        if ($action === 'approve') {
            $notes = $data['approval_notes'] ?? '';
            $approvedBy = $data['approved_by'] ?? 'Administrator';

            $upd = $pdo->prepare("UPDATE borrow_requests SET status = 'Approved', approval_notes = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?");
            $upd->execute([$notes, $approvedBy, $id]);

            $log = $pdo->prepare("INSERT INTO activity_logs (action, details, performed_by) VALUES (?, ?, ?)");
            $log->execute(['REQUEST_APPROVED', "Request {$id} approved for {$req['borrower_name']}", $approvedBy]);

            sendJsonResponse(['success' => true, 'message' => "Request {$id} approved."]);
        }

        if ($action === 'reject') {
            $reason = $data['rejection_reason'] ?? 'No reason provided';
            $rejectedBy = $data['approved_by'] ?? 'Administrator';

            $upd = $pdo->prepare("UPDATE borrow_requests SET status = 'Rejected', rejection_reason = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?");
            $upd->execute([$reason, $rejectedBy, $id]);

            $log = $pdo->prepare("INSERT INTO activity_logs (action, details, performed_by) VALUES (?, ?, ?)");
            $log->execute(['REQUEST_REJECTED', "Request {$id} rejected. Reason: {$reason}", $rejectedBy]);

            sendJsonResponse(['success' => true, 'message' => "Request {$id} rejected."]);
        }

        if ($action === 'release') {
            $releasedBy = $data['released_by'] ?? 'Equipment Custodian';
            $reqUnits = max(1, (int)($req['units'] ?? 1));

            // Mark request Active
            $upd = $pdo->prepare("UPDATE borrow_requests SET status = 'Active', released_by = ?, released_at = CURRENT_TIMESTAMP WHERE id = ?");
            $upd->execute([$releasedBy, $id]);

            // Deduct units from equipment stock and determine if still Available or Borrowed
            $eqStmt = $pdo->prepare("SELECT total_units, available_units FROM equipment WHERE id = ?");
            $eqStmt->execute([$req['equipment_id']]);
            $eq = $eqStmt->fetch();
            $currAvail = isset($eq['available_units']) ? (int)$eq['available_units'] : 1;
            $newAvail = max(0, $currAvail - $reqUnits);
            $newStatus = ($newAvail <= 0) ? 'Borrowed' : 'Available';

            $eqUpd = $pdo->prepare("UPDATE equipment SET status = ?, available_units = ?, total_borrows = total_borrows + ? WHERE id = ?");
            $eqUpd->execute([$newStatus, $newAvail, $reqUnits, $req['equipment_id']]);

            $log = $pdo->prepare("INSERT INTO activity_logs (action, details, performed_by) VALUES (?, ?, ?)");
            $log->execute(['EQUIPMENT_RELEASED', "Equipment {$req['equipment_id']} ({$reqUnits} unit(s)) released to {$req['borrower_name']}. Remaining stock: {$newAvail} unit(s).", $releasedBy]);

            sendJsonResponse(['success' => true, 'message' => "Equipment released to {$req['borrower_name']} ({$reqUnits} unit(s))."]);
        }

        if ($action === 'cancel') {
            if ($req['status'] !== 'Pending') {
                sendJsonResponse(['error' => 'Only pending requests can be cancelled.'], 400);
            }
            $upd = $pdo->prepare("UPDATE borrow_requests SET status = 'Rejected', rejection_reason = 'Cancelled by borrower' WHERE id = ?");
            $upd->execute([$id]);

            $log = $pdo->prepare("INSERT INTO activity_logs (action, details, performed_by) VALUES (?, ?, ?)");
            $log->execute(['REQUEST_CANCELLED', "Request {$id} cancelled by borrower", $req['borrower_name']]);

            sendJsonResponse(['success' => true, 'message' => "Request {$id} cancelled successfully."]);
        }

        sendJsonResponse(['error' => 'Invalid action.'], 400);
    }

    sendJsonResponse(['error' => 'Method not allowed'], 405);
} catch (Exception $e) {
    sendJsonResponse(['error' => 'Server Error: ' . $e->getMessage()], 500);
}
