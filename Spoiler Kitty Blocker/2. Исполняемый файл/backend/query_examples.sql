SELECT phrase, language, kind, category, severity
FROM active_keywords
ORDER BY severity DESC, length(phrase) DESC;

SELECT matched_text, COUNT(*) AS hits, MAX(created_at) AS last_seen
FROM matches
GROUP BY normalized_match
ORDER BY hits DESC, last_seen DESC
LIMIT 20;

SELECT p.title, p.url, s.replacements_count, s.blocks_count, s.inline_count, s.images_count, s.scanned_at
FROM scans s
JOIN pages p ON p.id = s.page_id
ORDER BY s.replacements_count DESC, s.scanned_at DESC
LIMIT 20;

SELECT category, COUNT(*) AS words_count
FROM active_keywords
GROUP BY category
ORDER BY words_count DESC;

-- 5. Статистика проверок по дням
SELECT DATE(scanned_at) AS scan_day,
       COUNT(*) AS scans_count,
       SUM(replacements_count) AS total_replacements,
       SUM(images_count) AS hidden_images
FROM scans
GROUP BY DATE(scanned_at)
ORDER BY scan_day DESC;
