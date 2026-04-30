<?php
require_once __DIR__ . '/MobinaMessageFormatter.php';

if (!class_exists('MessageFormatter', false) && class_exists('MobinaMessageFormatter', false)) {
    class_alias('MobinaMessageFormatter', 'MessageFormatter');
}
