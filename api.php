<?php
// Configuración de cabeceras para permitir peticiones desde el frontend
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Configuración de la base de datos
$host = 'localhost';
$db_name = 'afemec_db';
$username = 'root'; // Cambiar por tu usuario de BD en el hosting
$password = '';     // Cambiar por tu contraseña de BD en el hosting

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERR_MODE, PDO::ERR_MODE_EXCEPTION);
} catch(PDOException $e) {
    die(json_encode(["error" => "Fallo de conexión: " . $e->getMessage()]));
}

// Determinar la acción a realizar
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'registro') {
    // Leer los datos JSON enviados desde app.js
    $input = json_decode(file_get_contents("php://input"), true);
    
    if (!empty($input['ci']) && !empty($input['nombre'])) {
        $sql = "INSERT INTO atletas (ci, nombre, edad, tipo, parentesco) VALUES (?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        
        try {
            $stmt->execute([
                $input['ci'],
                $input['nombre'],
                $input['edad'],
                $input['tipo'],
                $input['parentesco']
            ]);
            echo json_encode(["message" => "Atleta guardado en la base de datos correctamente"]);
        } catch(PDOException $e) {
            http_response_code(500);
            echo json_encode(["error" => "Error al guardar: " . $e->getMessage()]);
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'atletas') {
    $stmt = $pdo->query("SELECT * FROM atletas ORDER BY fecha DESC");
    $atletas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($atletas);
} else {
    http_response_code(404);
    echo json_encode(["error" => "Acción no válida"]);
}
?>