/**
 * Advanced Analytics Module
 * Provides insights and statistics on collected feedback
 */

export async function generateDailyReport(db) {
    const result = await db.execute(`
    SELECT
      DATE(timestamp) as date,
      category,
      COUNT(*) as count,
      GROUP_CONCAT(DISTINCT channel_name) as channels
    FROM alerts
    WHERE timestamp > datetime('now', '-1 day')
    GROUP BY DATE(timestamp), category
    ORDER BY date DESC, count DESC
  `);

    return result.rows;
}

export async function getHotTopics(db, hours = 24) {
    const result = await db.execute(`
    SELECT
      category,
      severity,
      COUNT(*) as count,
      AVG(LENGTH(summary)) as avg_summary_length
    FROM alerts
    WHERE timestamp > datetime('now', ? || ' hours')
    GROUP BY category, severity
    ORDER BY count DESC
  `, [`-${hours}`]);

    return result.rows;
}

export async function getChannelStats(db) {
    const result = await db.execute(`
    SELECT
      channel_name,
      COUNT(*) as message_count,
      COUNT(DISTINCT author_id) as unique_authors,
      COUNT(CASE WHEN alerts.id IS NOT NULL THEN 1 END) as alert_count
    FROM discord_messages m
    LEFT JOIN alerts ON m.message_id = alerts.message_id
    GROUP BY channel_name
    ORDER BY message_count DESC
  `);

    return result.rows;
}

export async function searchAlerts(db, query, filters = {}) {
    let sql = `
    SELECT a.*, m.author_name, m.content, m.channel_name
    FROM alerts a
    JOIN discord_messages m ON a.message_id = m.message_id
    WHERE 1=1
  `;

    const args = [];

    if (query) {
        sql += ` AND (m.content LIKE ? OR a.summary LIKE ?)`;
        args.push(`%${query}%`, `%${query}%`);
    }

    if (filters.category) {
        sql += ` AND a.category = ?`;
        args.push(filters.category);
    }

    if (filters.severity) {
        sql += ` AND a.severity = ?`;
        args.push(filters.severity);
    }

    if (filters.channel) {
        sql += ` AND m.channel_name = ?`;
        args.push(filters.channel);
    }

    if (filters.startDate) {
        sql += ` AND a.timestamp >= ?`;
        args.push(filters.startDate);
    }

    if (filters.endDate) {
        sql += ` AND a.timestamp <= ?`;
        args.push(filters.endDate);
    }

    sql += ` ORDER BY a.timestamp DESC LIMIT 100`;

    const result = await db.execute({ sql, args });
    return result.rows;
}
