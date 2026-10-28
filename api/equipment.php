<?php
require_once __DIR__ . '/config.php';
$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    if ($method === 'GET') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("SELECT * FROM equipment WHERE id = ?");
            $stmt->execute([$id]);
            $item = $stmt->fetch();
            sendJsonResponse(['data' => $item ?: null]);
        }

        // Auto-synchronize status based on available units
        $pdo->exec("UPDATE equipment SET status = 'Borrowed' WHERE available_units <= 0 AND status = 'Available'");
        $pdo->exec("UPDATE equipment SET status = 'Available' WHERE available_units > 0 AND status = 'Borrowed'");

        $query = "SELECT * FROM equipment WHERE 1=1";
        $params = [];
        if (!empty($_GET['category'])) { $query .= " AND category = ?"; $params[] = $_GET['category']; }
        if (!empty($_GET['status']))   { $query .= " AND status = ?";   $params[] = $_GET['status']; }
        if (!empty($_GET['condition'])){ $query .= " AND condition = ?"; $params[] = $_GET['condition']; }
        if (!empty($_GET['search']))   { $query .= " AND (LOWER(name) LIKE ? OR LOWER(id) LIKE ?)"; $s = '%'.strtolower($_GET['search']).'%'; $params[] = $s; $params[] = $s; }
        $query .= " ORDER BY name ASC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        sendJsonResponse(['data' => $stmt->fetchAll()]);
    }

    if ($method === 'POST') {
        $name = trim($data['name'] ?? '');
        if (empty($name)) sendJsonResponse(['error' => 'Equipment name is required.'], 400);

        $id = trim($data['id'] ?? '');
        if (empty($id)) {
            $catPrefix = 'GEN';
            $cat = $data['category'] ?? '';
            if (stripos($cat, 'comp') !== false) $catPrefix = 'CMP';
            elseif (stripos($cat, 'media') !== false || stripos($cat, 'av') !== false) $catPrefix = 'MED';
            elseif (stripos($cat, 'lab') !== false) $catPrefix = 'LAB';
            elseif (stripos($cat, 'robot') !== false) $catPrefix = 'ROB';
            elseif (stripos($cat, 'audio') !== false) $catPrefix = 'AUD';
            $id = 'EQP-' . $catPrefix . '-' . strtoupper(substr(uniqid(), -4));
        }

        $check = $pdo->prepare("SELECT COUNT(*) FROM equipment WHERE id = ?");
        $check->execute([$id]);
        if ($check->fetchColumn() > 0) sendJsonResponse(['error' => "Equipment ID '{$id}' already exists. Please choose a different ID."], 400);

        $category = $data['category'] ?? 'Other';
        $condition = $data['condition'] ?? 'Good';
        $status = $data['status'] ?? 'Available';
        $serial = trim($data['serial_number'] ?? '');
        $location = trim($data['location'] ?? 'Main IT Cage');
        $desc = trim($data['description'] ?? '');
        $image = trim($data['image_url'] ?? 'assets/images/laptop.jpg');

        $totalUnits = max(1, (int)($data['total_units'] ?? $data['units'] ?? 1));
        if (isset($data['available_units'])) {
            $availableUnits = max(0, min($totalUnits, (int)$data['available_units']));
        } else {
            $availableUnits = ($status === 'Available') ? $totalUnits : 0;
        }
        if ($availableUnits <= 0 && $status !== 'Under Maintenance') {
            $status = 'Borrowed';
        }

        $stmt = $pdo->prepare("INSERT INTO equipment (id,name,category,condition,status,serial_number,location,description,image_url,total_borrows,total_units,available_units) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)");
        $stmt->execute([$id, $name, $category, $condition, $status, $serial, $location, $desc, $image, $totalUnits, $availableUnits]);

        $log = $pdo->prepare("INSERT INTO activity_logs (action,details,performed_by) VALUES (?,?,?)");
        $log->execute(['EQUIPMENT_REGISTERED', "New equipment registered: [{$id}] {$name} ({$category}) — Stock Limit: {$totalUnits} unit(s)", $data['performed_by']??'Administrator']);
        sendJsonResponse(['success' => true, 'id' => $id, 'message' => "Equipment [{$id}] registered successfully with {$totalUnits} unit(s) stock limitation."], 201);
    }

    if ($method === 'PUT') {
        $id = $data['id'] ?? '';
        if (empty($id)) sendJsonResponse(['error' => 'Equipment ID required.'], 400);

        $fields = []; $params = [];
        foreach (['name','category','condition','status','serial_number','location','description','image_url','total_units','available_units'] as $f) {
            if (isset($data[$f])) {
                $val = $data[$f];
                if ($f === 'total_units') $val = max(1, (int)$val);
                if ($f === 'available_units') $val = max(0, (int)$val);
                $fields[] = "$f = ?";
                $params[] = $val;
            }
        }
        if (empty($fields)) sendJsonResponse(['error' => 'No fields to update.'], 400);
        $params[] = $id;

        $pdo->prepare("UPDATE equipment SET " . implode(',', $fields) . " WHERE id = ?")->execute($params);

        // Auto-synchronize status if available_units is 0 or greater than 0
        $checkEq = $pdo->prepare("SELECT total_units, available_units, status FROM equipment WHERE id = ?");
        $checkEq->execute([$id]);
        $row = $checkEq->fetch();
        if ($row) {
            $t = (int)$row['total_units'];
            $a = (int)$row['available_units'];
            $st = $row['status'];
            if ($a > $t) {
                $pdo->prepare("UPDATE equipment SET available_units = ? WHERE id = ?")->execute([$t, $id]);
            }
            if ($st === 'Available' && $a === 0) {
                $pdo->prepare("UPDATE equipment SET status = 'Borrowed' WHERE id = ?")->execute([$id]);
            } elseif ($st === 'Borrowed' && $a > 0) {
                $pdo->prepare("UPDATE equipment SET status = 'Available' WHERE id = ?")->execute([$id]);
            }
        }

        $log = $pdo->prepare("INSERT INTO activity_logs (action,details,performed_by) VALUES (?,?,?)");
        $log->execute(['EQUIPMENT_UPDATED', "Equipment [{$id}] updated", $data['performed_by']??'System']);
        sendJsonResponse(['success' => true]);
    }

    if ($method === 'DELETE') {
        $id = $data['id'] ?? '';
        if (empty($id)) sendJsonResponse(['error' => 'Equipment ID required.'], 400);

        $check = $pdo->prepare("SELECT status FROM equipment WHERE id = ?");
        $check->execute([$id]);
        $eq = $check->fetch();
        if (!$eq) sendJsonResponse(['error' => 'Equipment not found.'], 404);
        if ($eq['status'] === 'Borrowed') sendJsonResponse(['error' => 'Cannot delete borrowed equipment.'], 400);

        $pdo->prepare("DELETE FROM equipment WHERE id = ?")->execute([$id]);

        $log = $pdo->prepare("INSERT INTO activity_logs (action,details,performed_by) VALUES (?,?,?)");
        $log->execute(['EQUIPMENT_DELETED', "Equipment [{$id}] deleted", $data['performed_by']??'System']);
        sendJsonResponse(['success' => true]);
    }

    sendJsonResponse(['error' => 'Method not allowed'], 405);
} catch (Exception $e) {
    sendJsonResponse(['error' => 'Server Error: ' . $e->getMessage()], 500);
}
