<?php
require_once 'api/functions_utils.php';
$ps = @shell_exec('ps aux | grep ffmpeg | grep -v grep');
echo "PS AUX OUTPUT:\n" . $ps . "\n";
if ($ps) {
    $lines = explode("\n", trim($ps));
    foreach ($lines as $line) {
        echo "LINE: $line\n";
        // ps aux format is usually: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
        if (preg_match('/^\S+\s+(\d+)\s+.*?\s+.*?\s+.*?\s+.*?\s+.*?\s+.*?\s+.*?\s+(.*)$/', trim($line), $matches)) {
            $pid = $matches[1];
            $fullCmd = $matches[2];
            echo "PID: $pid, CMD: $fullCmd\n";
            $tempPath = "";
            $normCmd = str_replace('\\', '/', $fullCmd);
            if (preg_match_all('/[\'"]?([^\'"]+?\_t\.[a-z0-9]+)[\'"]?/i', $normCmd, $m)) {
                $tempPath = end($m[1]);
                echo "DETECTED TEMP PATH: $tempPath\n";
                $resolved = resolve_video_path($tempPath);
                echo "RESOLVED PATH: " . ($resolved ?: 'NULL') . "\n";
                if ($resolved && file_exists($resolved)) {
                    echo "FILE EXISTS! SIZE: " . filesize($resolved) . "\n";
                } else {
                    echo "FILE NOT FOUND OR NULL\n";
                }
            }
        }
    }
}
