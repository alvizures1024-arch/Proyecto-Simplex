<?php
declare(strict_types=1);

// PHP sirve la vista; JavaScript consulta la API de Python directamente.
// API_URL debe ser accesible desde el navegador del usuario.
$apiUrl = rtrim(getenv('API_URL') ?: 'http://localhost:8000', '/');
header('Content-Type: text/html; charset=utf-8');
$view = file_get_contents(__DIR__ . '/../views/page.html');
if ($view === false) {
    http_response_code(500);
    exit('No se pudo cargar la vista.');
}
echo str_replace('{{API_URL}}', htmlspecialchars($apiUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), $view);
