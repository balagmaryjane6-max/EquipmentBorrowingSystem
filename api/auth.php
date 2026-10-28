<?php
require_once __DIR__ . '/config.php';
$pdo = getDatabaseConnection();
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true) ?? $_POST;

try {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT id, name, email, role, department, borrower_id, phone, created_at FROM users ORDER BY role ASC, name ASC");
        sendJsonResponse(['data' => $stmt->fetchAll()]);
    }

    if ($method === 'POST') {
        $action = $data['action'] ?? 'login';

        if ($action === 'login') {
            $email = trim($data['email'] ?? '');
            $password = trim($data['password'] ?? '');
            if (empty($email) || empty($password)) sendJsonResponse(['error' => 'Email and password required.'], 400);

            $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(borrower_id) = LOWER(?)");
            $stmt->execute([$email, $email]);
            $user = $stmt->fetch();
            if (!$user) sendJsonResponse(['error' => 'Invalid email/ID or password.'], 401);

            $valid = false;
            if (password_verify($password, $user['password'])) {
                $valid = true;
            } elseif ($user['password'] === $password) {
                $valid = true;
                $upd = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
                $upd->execute([password_hash($password, PASSWORD_BCRYPT), $user['id']]);
            }
            if (!$valid) sendJsonResponse(['error' => 'Invalid email or password.'], 401);

            unset($user['password']);
            $log = $pdo->prepare("INSERT INTO activity_logs (action,details,performed_by) VALUES (?,?,?)");
            $log->execute(['USER_LOGIN', "{$user['name']} logged in", $user['name']]);

            sendJsonResponse(['success' => true, 'message' => "Welcome, {$user['name']}!", 'user' => $user, 'token' => bin2hex(random_bytes(24))]);
        }

        if ($action === 'register') {
            $name = trim($data['name'] ?? '');
            $email = trim($data['email'] ?? '');
            $password = trim($data['password'] ?? '');
            $department = trim($data['department'] ?? 'General');
            $borrowerId = trim($data['borrower_id'] ?? '');
            $phone = trim($data['phone'] ?? '');
            // Role: 'Borrower' (default) or 'Administrator' (Staff)
            $allowedRoles = ['Borrower', 'Administrator'];
            $role = trim($data['role'] ?? 'Borrower');
            if (!in_array($role, $allowedRoles)) $role = 'Borrower';

            if (empty($name) || empty($email) || empty($password)) sendJsonResponse(['error' => 'Name, email, and password required.'], 400);
            if (strlen($password) < 4) sendJsonResponse(['error' => 'Password must be at least 4 characters.'], 400);

            // 1. Strict Duplicate Email Check
            $checkEmail = $pdo->prepare("SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(?)");
            $checkEmail->execute([$email]);
            if ($checkEmail->fetchColumn() > 0) {
                sendJsonResponse(['error' => 'This email address is already registered. Duplicate emails cannot be accepted.'], 400);
            }

            // 2. Strict Duplicate Mobile Phone Check
            if (!empty($phone)) {
                $cleanPhone = preg_replace('/[^\d]/', '', $phone);
                if (strlen($cleanPhone) >= 7) {
                    $phoneStmt = $pdo->query("SELECT phone FROM users WHERE phone IS NOT NULL AND phone != ''");
                    while ($pRow = $phoneStmt->fetch()) {
                        $existingClean = preg_replace('/[^\d]/', '', $pRow['phone']);
                        if ($existingClean === $cleanPhone) {
                            sendJsonResponse(['error' => 'This mobile number is already registered to another account. Duplicate mobile numbers cannot be accepted.'], 400);
                        }
                    }
                }
            }

            // 3. Strict Duplicate ID Check
            if (!empty($borrowerId)) {
                $checkId = $pdo->prepare("SELECT COUNT(*) FROM users WHERE LOWER(borrower_id) = LOWER(?)");
                $checkId->execute([$borrowerId]);
                if ($checkId->fetchColumn() > 0) {
                    sendJsonResponse(['error' => 'This ID number is already registered. Please check your assigned ID.'], 400);
                }
            }

            if ($role === 'Borrower') {
                $prefix = 'STU';
                $roleCol = 'Borrower';
                if (empty($borrowerId)) {
                    $seq = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'Borrower'")->fetchColumn() + 101;
                    $borrowerId = sprintf('STU-%s-%04d', date('Y'), $seq);
                }
                $userId = 'USR-BRW-' . substr(md5(uniqid()), 0, 6);
            } elseif ($role === 'Equipment Custodian') {
                if (empty($borrowerId)) {
                    $seq = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'Equipment Custodian'")->fetchColumn() + 1;
                    $borrowerId = sprintf('CST-%s-%04d', date('Y'), $seq);
                }
                $userId = 'USR-CST-' . substr(md5(uniqid()), 0, 6);
            } else {
                // Administrator
                if (empty($borrowerId)) {
                    $seq = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'Administrator'")->fetchColumn() + 1;
                    $borrowerId = sprintf('ADM-%s-%04d', date('Y'), $seq);
                }
                $userId = 'USR-ADM-' . substr(md5(uniqid()), 0, 6);
            }

            $hash = password_hash($password, PASSWORD_BCRYPT);

            $stmt = $pdo->prepare("INSERT INTO users (id,name,email,password,role,department,borrower_id,phone) VALUES (?,?,?,?,?,?,?,?)");
            $stmt->execute([$userId, $name, $email, $hash, $role, $department, $borrowerId, $phone]);

            $log = $pdo->prepare("INSERT INTO activity_logs (action,details,performed_by) VALUES (?,?,?)");
            $log->execute(['USER_REGISTERED', "New {$role}: {$name} ({$borrowerId})", $name]);

            sendJsonResponse(['success' => true, 'user' => ['id'=>$userId,'name'=>$name,'email'=>$email,'role'=>$role,'department'=>$department,'borrower_id'=>$borrowerId,'phone'=>$phone], 'token' => bin2hex(random_bytes(24))], 201);
        }

        sendJsonResponse(['error' => 'Invalid action.'], 400);
    }

    sendJsonResponse(['error' => 'Method not allowed'], 405);
} catch (Exception $e) {
    sendJsonResponse(['error' => 'Server Error: ' . $e->getMessage()], 500);
}
