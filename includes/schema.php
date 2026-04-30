<?php
return [
    "CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
        setting_value TEXT NULL,
        updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS users (
        id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(32) NOT NULL UNIQUE,
        display_name VARCHAR(80) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_label VARCHAR(8) NOT NULL,
        avatar_path VARCHAR(255) NULL,
        accent VARCHAR(24) NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_users_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS user_devices (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id TINYINT UNSIGNED NOT NULL,
        device_id CHAR(48) NOT NULL UNIQUE,
        token_hash CHAR(64) NOT NULL,
        pin_hash VARCHAR(255) NULL,
        device_name VARCHAR(160) NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        last_used_at DATETIME NULL,
        INDEX idx_user_devices_user (user_id),
        CONSTRAINT fk_user_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id TINYINT UNSIGNED NOT NULL,
        credential_id VARCHAR(255) NOT NULL UNIQUE,
        public_key_pem TEXT NOT NULL,
        sign_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
        device_name VARCHAR(160) NULL,
        created_at DATETIME NOT NULL,
        last_used_at DATETIME NULL,
        INDEX idx_webauthn_user (user_id),
        CONSTRAINT fk_webauthn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS attachments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        uploader_id TINYINT UNSIGNED NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(120) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        public_path VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_attachments_uploader (uploader_id),
        CONSTRAINT fk_attachments_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        client_id VARCHAR(80) NOT NULL UNIQUE,
        sender_id TINYINT UNSIGNED NOT NULL,
        body TEXT NULL,
        kind VARCHAR(32) NOT NULL DEFAULT 'text',
        attachment_id BIGINT UNSIGNED NULL,
        reply_to_id BIGINT UNSIGNED NULL,
        open_at DATETIME NULL,
        created_at DATETIME NOT NULL,
        deleted_at DATETIME NULL,
        INDEX idx_messages_created (created_at),
        INDEX idx_messages_sender (sender_id),
        INDEX idx_messages_deleted_id (deleted_at, id),
        INDEX idx_messages_sender_created (sender_id, created_at),
        INDEX idx_messages_attachment (attachment_id),
        INDEX idx_messages_reply (reply_to_id),
        INDEX idx_messages_open_at (open_at),
        CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_messages_attachment FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL,
        CONSTRAINT fk_messages_reply FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS message_receipts (
        message_id BIGINT UNSIGNED NOT NULL,
        user_id TINYINT UNSIGNED NOT NULL,
        delivered_at DATETIME NULL,
        read_at DATETIME NULL,
        PRIMARY KEY (message_id, user_id),
        INDEX idx_receipts_user (user_id),
        CONSTRAINT fk_receipts_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        CONSTRAINT fk_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS message_reactions (
        message_id BIGINT UNSIGNED NOT NULL,
        user_id TINYINT UNSIGNED NOT NULL,
        reaction VARCHAR(24) NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (message_id, user_id),
        CONSTRAINT fk_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS message_search_tokens (
        token_hash CHAR(64) NOT NULL,
        message_id BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (token_hash, message_id),
        INDEX idx_message_search_message (message_id),
        CONSTRAINT fk_message_search_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS typing_status (
        user_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        expires_at DATETIME NOT NULL,
        CONSTRAINT fk_typing_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS push_subscriptions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id TINYINT UNSIGNED NOT NULL,
        endpoint_hash CHAR(64) NOT NULL UNIQUE,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        user_agent VARCHAR(255) NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_push_user (user_id, enabled),
        CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS memories (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(140) NOT NULL,
        note TEXT NULL,
        memory_date DATE NULL,
        emoji VARCHAR(16) NOT NULL DEFAULT '❤',
        attachment_id BIGINT UNSIGNED NULL,
        locked TINYINT(1) NOT NULL DEFAULT 0,
        created_by TINYINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_memories_date (memory_date),
        INDEX idx_memories_attachment (attachment_id),
        INDEX idx_memories_locked (locked),
        CONSTRAINT fk_memories_attachment FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL,
        CONSTRAINT fk_memories_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "CREATE TABLE IF NOT EXISTS love_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        item_type VARCHAR(32) NOT NULL,
        title VARCHAR(180) NOT NULL,
        note TEXT NULL,
        event_date DATE NULL,
        data_json TEXT NULL,
        attachment_id BIGINT UNSIGNED NULL,
        created_by TINYINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_love_items_type (item_type),
        INDEX idx_love_items_event_date (event_date),
        INDEX idx_love_items_attachment (attachment_id),
        CONSTRAINT fk_love_items_attachment FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL,
        CONSTRAINT fk_love_items_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
];
