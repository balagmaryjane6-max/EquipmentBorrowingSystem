<?php
// EquipVault — Returns & Borrowing History API
require_once __DIR__ . '/config.php';
$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    if ($method === 'GET') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("SELECT ret.*, e.name AS equipment_name, e.category AS equipment_category, e.image_url AS equipment_image 
                                  FROM borrow_returns ret 
                                  LEFT JOIN equipment e ON ret.equipment_id = e.id 
                                  WHERE ret.id = ?");
            $stmt->execute([$id]);
            $item = $stmt->fetch();
            sendJsonResponse(['data' => $item ?: null]);
        }

        $query = "SELECT ret.*, e.name AS equipment_name, e.category AS equipment_category, e.image_url AS equipment_image, 
                         r.borrower_email, r.borrower_id_number 
                  FROM borrow_returns ret 
                  LEFT JOIN equipment e ON ret.equipment_id = e.id 
                  LEFT JOIN borrow_requests r ON ret.request_id = r.id 
                  WHERE 1=1";
        $params = [];

        if (!empty($_GET['condition']) && $_GET['condition'] !== 'All') {
            $query .= " AND ret.condition_on_return = ?";
            $params[] = $_GET['condition'];
        }

        if (!empty($_GET['borrower_id'])) {
            $query .= " AND (r.borrower_id_number = ? OR ret.borrower_name = ?)";
            $params[] = $_GET['borrower_id'];
            $params[] = $_GET['borrower_id'];
        }

        if (!empty($_GET['borrower_email'])) {
            $query .= " AND LOWER(r.borrower_email) = LOWER(?)";
            $params[] = trim($_GET['borrower_email']);
        }

        if (!empty($_GET['search'])) {
            $s = '%' . strtolower(trim($_GET['search'])) . '%';
            $query .= " AND (LOWER(ret.id) LIKE ? OR LOWER(ret.borrower_name) LIKE ? OR LOWER(ret.equipment_id) LIKE ? OR LOWER(e.name) LIKE ?)";
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
        }

        $query .= " ORDER BY ret.created_at DESC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        sendJsonResponse(['data' => $rows]);
    }

    if ($method === 'POST') {
        $requestId = $data['request_id'] ?? '';
        $actualReturnDate = $data['actual_return_date'] ?? date('Y-m-d H:i:s');
        $conditionOnReturn = $data['condition_on_return'] ?? 'Good';
        $custodianNotes = $data['custodian_notes'] ?? '';
        $receivedBy = $data['received_by'] ?? 'Equipment Custodian';

        if (empty($requestId)) {
            sendJsonResponse(['error' => 'Request ID is required to process return.'], 400);
        }

        // Fetch the borrow request
        $rStmt = $pdo->prepare("SELECT * FROM borrow_requests WHERE id = ?");
        $rStmt->execute([$requestId]);
        $req = $rStmt->fetch();

        if (!$req) {
            sendJsonResponse(['error' => 'Borrow request not found.'], 404);
        }

        if ($req['status'] === 'Returned') {
            sendJsonResponse(['error' => 'This request has already been marked as returned.'], 400);
        }

        $dueDate = new DateTime($req['expected_return_date']);
        $actualDate = new DateTime($actualReturnDate);

        $isOverdue = 0;
        $daysOverdue = 0;
        if ($actualDate > $dueDate) {
            $isOverdue = 1;
            $diff = $actualDate->diff($dueDate);
            $daysOverdue = $diff->days;
            if ($daysOverdue == 0) $daysOverdue = 1; // At least 1 day overdue if later
        }

        $retId = 'RET-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -4));

        $reqUnits = max(1, (int)($req['units'] ?? 1));

        // Insert into borrow_returns
        $insStmt = $pdo->prepare("INSERT INTO borrow_returns 
            (id, request_id, equipment_id, borrower_name, borrow_date, expected_return_date, actual_return_date, is_overdue, days_overdue, condition_on_return, custodian_notes, received_by, units) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $insStmt->execute([
            $retId,
            $requestId,
            $req['equipment_id'],
            $req['borrower_name'],
            $req['borrow_date'],
            $req['expected_return_date'],
            $actualReturnDate,
            $isOverdue,
            $daysOverdue,
            $conditionOnReturn,
            $custodianNotes,
            $receivedBy,
            $reqUnits
        ]);

        // Update request status to Returned
        $updReq = $pdo->prepare("UPDATE borrow_requests SET status = 'Returned' WHERE id = ?");
        $updReq->execute([$requestId]);

        // Restore equipment available units and update status
        $eqStmt = $pdo->prepare("SELECT total_units, available_units FROM equipment WHERE id = ?");
        $eqStmt->execute([$req['equipment_id']]);
        $eq = $eqStmt->fetch();

        $totalUnits = isset($eq['total_units']) ? (int)$eq['total_units'] : 1;
        $currAvail = isset($eq['available_units']) ? (int)$eq['available_units'] : 0;
        $newAvail = min($totalUnits, $currAvail + $reqUnits);

        // Determine new equipment status based on return condition and remaining stock
        $newEquipmentStatus = ($conditionOnReturn === 'Needs Repair') ? 'Under Maintenance' : (($newAvail > 0) ? 'Available' : 'Borrowed');

        // Update equipment status, condition and available_units
        $updEq = $pdo->prepare("UPDATE equipment SET status = ?, condition = ?, available_units = ? WHERE id = ?");
        $updEq->execute([$newEquipmentStatus, $conditionOnReturn, $newAvail, $req['equipment_id']]);

        // Audit log
        $log = $pdo->prepare("INSERT INTO activity_logs (action, details, performed_by) VALUES (?, ?, ?)");
        $statusNote = $isOverdue ? " ({$daysOverdue} days overdue)" : " (on-time)";
        $log->execute([
            'RETURN_PROCESSED',
            "Return {$retId} processed for [{$req['equipment_id']}] ({$reqUnits} unit(s)) by {$req['borrower_name']}{$statusNote}. Restored stock: {$newAvail}/{$totalUnits} available. Condition: {$conditionOnReturn}.",
            $receivedBy
        ]);

        sendJsonResponse([
            'success' => true,
            'return_id' => $retId,
            'new_equipment_status' => $newEquipmentStatus,
            'is_overdue' => (bool)$isOverdue,
            'days_overdue' => $daysOverdue,
            'message' => 'Equipment return processed successfully.'
        ], 201);
    }

    sendJsonResponse(['error' => 'Method not allowed'], 405);
} catch (Exception $e) {
    sendJsonResponse(['error' => 'Server Error: ' . $e->getMessage()], 500);
}
