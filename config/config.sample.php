<?php
return [
    'app' => [
        'name' => 'SoulMate',
        'base_url' => 'https://example.com/soulmate',
        'timezone' => 'Asia/Tehran',
        'max_upload_bytes' => 12 * 1024 * 1024,
        'poll_ms' => 2200,
        'encryption_key' => '',
        'version' => '3.2.2',
    ],
    'db' => [
        'host' => 'localhost',
        'name' => 'database_name',
        'user' => 'database_user',
        'pass' => 'database_password',
    ],
    'vapid' => [
        'subject' => 'mailto:you@example.com',
        'public_key' => '',
        'private_key_pem' => '',
    ],
];
