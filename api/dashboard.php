<?php
// EquipVault — Dashboard Analytics & Metrics API
require_once __DIR__ . '/config.php';
$pdo = getDatabaseConnection();

try {
    // 1. Equipment counts
    $total = (int)$pdo->query("SELECT COUNT(*) FROM equipment")->fetchColumn();
    $available = (int)$pdo->query("SELECT COUNT(*) FROM equipment WHERE status = 'Available'")->fetchColumn();
    $borrowed = (int)$pdo->query("SELECT COUNT(*) FROM equipment WHERE status = 'Borrowed'")->fetchColumn();
    $maintenance = (int)$pdo->query("SELECT COUNT(*) FROM equipment WHERE status = 'Under Maintenance'")->fetchColumn();
    $availabilityRate = ($total > 0) ? round(($available / $total) * 100) : 0;

    // 2. Pending Requests
    $pending = (int)$pdo->query("SELECT COUNT(*) FROM borrow_requests WHERE status = 'Pending'")->fetchColumn();

    // 3. Active Requests & Overdue tracking
    $activeStmt = $pdo->query("SELECT r.*, e.name AS equipment_name, e.category AS equipment_category, e.image_url AS equipment_image 
                               FROM borrow_requests r 
                               LEFT JOIN equipment e ON r.equipment_id = e.id 
                               WHERE r.status = 'Active' 
                               ORDER BY r.expected_return_date ASC");
    $activeRequests = $activeStmt->fetchAll();

    $now = new DateTime();
    $overdueCount = 0;
    foreach ($activeRequests as &$req) {
        $due = new DateTime($req['expected_return_date']);
        if ($now > $due) {
            $req['is_overdue'] = true;
            $diff = $now->diff($due);
            $days = $diff->days > 0 ? (int)$diff->days : 1;
            $req['overdue_days'] = $days;
            $req['days_due_text'] = 'Overdue by ' . $days . ' day' . ($days > 1 ? 's' : '');
            $overdueCount++;
        } else {
            $req['is_overdue'] = false;
            $req['overdue_days'] = 0;
            $diff = $due->diff($now);
            $days = (int)$diff->days;
            $hours = (int)$diff->h;
            $req['days_left'] = $days;
            $req['remaining_hours'] = ($days * 24) + $hours;
            if ($days === 0) {
                $req['days_due_text'] = 'Due today (' . max(1, $hours) . 'h left)';
            } elseif ($days === 1) {
                $req['days_due_text'] = 'Due in 1 day';
            } else {
                $req['days_due_text'] = 'Due in ' . $days . ' days';
            }
        }
    }

    // 4. Category breakdown
    $catStmt = $pdo->query("SELECT category, COUNT(*) as count FROM equipment GROUP BY category ORDER BY count DESC");
    $categories = $catStmt->fetchAll();

    // 5. Recent activity logs
    $logStmt = $pdo->query("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10");
    $recentActivities = $logStmt->fetchAll();

    // 6. Optional Borrower-specific Metrics
    $borrowerData = null;
    $borrowerEmail = trim($_GET['borrower_email'] ?? '');
    $borrowerId = trim($_GET['borrower_id'] ?? '');

    if (!empty($borrowerEmail) || !empty($borrowerId)) {
        $bActive = [];
        $bOverdue = 0;
        foreach ($activeRequests as $ar) {
            $match = false;
            if (!empty($borrowerEmail) && strtolower($ar['borrower_email'] ?? '') === strtolower($borrowerEmail)) $match = true;
            if (!empty($borrowerId) && strtolower($ar['borrower_id_number'] ?? '') === strtolower($borrowerId)) $match = true;
            if ($match) {
                $bActive[] = $ar;
                if (!empty($ar['is_overdue'])) $bOverdue++;
            }
        }

        // Pending requests for borrower
        $pStmt = $pdo->prepare("SELECT COUNT(*) FROM borrow_requests WHERE status = 'Pending' AND (LOWER(borrower_email) = LOWER(?) OR borrower_id_number = ?)");
        $pStmt->execute([$borrowerEmail, $borrowerId]);
        $bPending = (int)$pStmt->fetchColumn();

        // Completed / returned requests
        $rStmt = $pdo->prepare("SELECT COUNT(*) FROM borrow_requests WHERE status = 'Returned' AND (LOWER(borrower_email) = LOWER(?) OR borrower_id_number = ?)");
        $rStmt->execute([$borrowerEmail, $borrowerId]);
        $bCompleted = (int)$rStmt->fetchColumn();

        // Recent requests for borrower (up to 8)
        $recStmt = $pdo->prepare("SELECT r.*, e.name AS equipment_name, e.category AS equipment_category, e.image_url AS equipment_image 
                                  FROM borrow_requests r 
                                  LEFT JOIN equipment e ON r.equipment_id = e.id 
                                  WHERE (LOWER(r.borrower_email) = LOWER(?) OR r.borrower_id_number = ?)
                                  ORDER BY r.created_at DESC LIMIT 8");
        $recStmt->execute([$borrowerEmail, $borrowerId]);
        $bRecent = $recStmt->fetchAll();

        $borrowerData = [
            'active_count' => count($bActive),
            'pending_count' => $bPending,
            'overdue_count' => $bOverdue,
            'completed_count' => $bCompleted,
            'active_loans' => $bActive,
            'recent_requests' => $bRecent
        ];
    }

    sendJsonResponse([
        'metrics' => [
            'total_equipment' => $total,
            'available_equipment' => $available,
            'borrowed_equipment' => $borrowed,
            'active_loans' => count($activeRequests),
            'maintenance_equipment' => $maintenance,
            'overdue_count' => $overdueCount,
            'pending_requests' => $pending,
            'availability_rate' => $availabilityRate
        ],
        'active_requests' => $activeRequests,
        'categories_breakdown' => $categories,
        'recent_activities' => $recentActivities,
        'borrower' => $borrowerData
    ]);
} catch (Exception $e) {
    sendJsonResponse(['error' => 'Server Error: ' . $e->getMessage()], 500);
}
