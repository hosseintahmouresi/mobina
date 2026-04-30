<?php
if (!class_exists('Response', false)) {
final class Response
{
    public static function json($payload, $status = 200)
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error($message, $status = 400, $extra = [])
    {
        self::json(array_merge([
            'ok' => false,
            'error' => $message,
        ], $extra), $status);
    }
}
}
