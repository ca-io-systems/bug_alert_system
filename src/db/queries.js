/**
 * Database query operations for the Truth Discovery Feedback system.
 * All operations are additive and will NOT overwrite or delete existing table structures.
 */

export async function storeMessage(db, messageData) {
    try {
        await db.execute({
            sql: `
        INSERT INTO discord_messages 
        (message_id, channel_id, channel_name, author_id, author_name, content, timestamp, message_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
            args: [
                messageData.messageId,
                messageData.channelId,
                messageData.channelName,
                messageData.authorId,
                messageData.authorName,
                messageData.content,
                messageData.timestamp.toISOString(),
                messageData.url,
            ],
        });
        console.log('✅ Message stored in database');
    } catch (error) {
        if (error.message.includes('UNIQUE')) {
            console.log('ℹ️ Message already exists in database');
        } else {
            console.error('❌ Error storing message:', error);
            throw error;
        }
    }
}

export async function storeAlert(db, alertData) {
    try {
        await db.execute({
            sql: `
        INSERT INTO alerts 
        (message_id, category, severity, summary, recommendation, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
            args: [
                alertData.messageId,
                alertData.category,
                alertData.severity || null,
                alertData.summary,
                alertData.recommendation,
                alertData.timestamp.toISOString(),
            ],
        });
        console.log('✅ Alert stored in database');

        // Automatically route to specialized tables
        if (alertData.category === 'bug') {
            await insertBugReport(db, alertData);
        } else if (alertData.category === 'feature_request') {
            await insertFeatureSuggestion(db, alertData);
        }

    } catch (error) {
        console.error('❌ Error storing alert:', error);
        throw error;
    }
}

async function insertBugReport(db, alertData) {
    try {
        await db.execute({
            sql: `
        INSERT INTO bug_reports 
        (subject, description, severity, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
            args: [
                `[Discord] ${alertData.summary}`,
                `Original Message ID: ${alertData.messageId}\nRecommendation: ${alertData.recommendation}`,
                alertData.severity || 'medium',
                'open',
                Math.floor(Date.now() / 1000)
            ],
        });
        console.log('🐛 Bug report automatically created in bug_reports table');
    } catch (error) {
        console.error('❌ Error creating bug report:', error);
    }
}

async function insertFeatureSuggestion(db, alertData) {
    try {
        await db.execute({
            sql: `
        INSERT INTO feature_suggestions 
        (title, description, useCase, priority, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
            args: [
                `[Discord] ${alertData.summary}`,
                `Original Message ID: ${alertData.messageId}`,
                alertData.recommendation,
                'medium',
                'open',
                new Date().toISOString(),
                new Date().toISOString()
            ],
        });
        console.log('💡 Feature suggestion automatically created in feature_suggestions table');
    } catch (error) {
        console.error('❌ Error creating feature suggestion:', error);
    }
}

export async function getRecentAlerts(db, hours = 24) {
    try {
        const result = await db.execute({
            sql: `
        SELECT a.*, m.author_name, m.content, m.message_url
        FROM alerts a
        JOIN discord_messages m ON a.message_id = m.message_id
        WHERE a.timestamp > datetime('now', ? || ' hours')
        ORDER BY a.timestamp DESC
      `,
            args: [`-${hours}`],
        });
        return result.rows;
    } catch (error) {
        console.error('❌ Error fetching alerts:', error);
        throw error;
    }
}
