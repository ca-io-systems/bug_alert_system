/**
 * Example Usage & Integration Patterns
 * Shows how to use the feedback system in various scenarios
 */

// ============================================================================
// 1. CUSTOM ALERT ROUTING
// ============================================================================

// Route critical bugs to specific channel
async function handleCriticalBug(analysis, message) {
    if (analysis.severity === 'critical' && analysis.category === 'bug') {
        const devChannel = message.guild.channels.cache.find(
            ch => ch.name === 'dev-critical-alerts'
        );

        await devChannel.send({
            content: '@here CRITICAL BUG REPORTED',
            embeds: [formatAlert(analysis, message)]
        });
    }
}

// ============================================================================
// 2. AUTO-TICKET CREATION
// ============================================================================

// Create a support ticket for each alert
async function createSupportTicket(analysis, message, db) {
    if (!['bug', 'complaint'].includes(analysis.category)) return;

    const ticketData = {
        title: analysis.summary,
        description: message.content,
        category: analysis.category,
        severity: analysis.severity,
        reportedBy: message.author.username,
        messageLink: message.url,
        createdAt: new Date()
    };

    // Insert into tickets table
    await db.execute(`
    INSERT INTO support_tickets (title, description, category, severity, reported_by, message_link)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
        ticketData.title,
        ticketData.description,
        ticketData.category,
        ticketData.severity,
        ticketData.reportedBy,
        ticketData.messageLink
    ]);
}

// ============================================================================
// 3. TEAM NOTIFICATIONS
// ============================================================================

// Send DM to product manager for feature requests
async function notifyProductTeam(analysis, message, client) {
    if (analysis.category !== 'feature_request') return;

    const productManagerId = '123456789'; // Your PM's Discord ID
    const user = await client.users.fetch(productManagerId);

    await user.send({
        content: `New feature request: ${analysis.summary}`,
        embeds: [formatAlert(analysis, message)]
    });
}

// ============================================================================
// 4. SENTIMENT ANALYSIS EXPANSION
// ============================================================================

// Enhanced analysis with sentiment tracking
async function advancedAnalysis(message) {
    // Get LLM analysis
    const analysis = await analyzeMessageWithLLM(message.content);

    // Add sentiment score (0-1)
    const sentimentResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'user',
            content: `Rate sentiment 0-1 (0=negative, 1=positive): "${message.content}"`
        }],
        max_tokens: 10
    });

    const sentiment = parseFloat(sentimentResponse.choices[0].message.content);

    return {
        ...analysis,
        sentiment
    };
}

// ============================================================================
// 5. ANALYTICS DASHBOARD
// ============================================================================

// Generate weekly insights report
async function generateWeeklyReport(db) {
    // Total feedback
    const totalAlerts = await db.execute(`
    SELECT COUNT(*) as count FROM alerts
    WHERE timestamp > datetime('now', '-7 days')
  `);

    // By category
    const byCategoryResult = await db.execute(`
    SELECT category, COUNT(*) as count
    FROM alerts
    WHERE timestamp > datetime('now', '-7 days')
    GROUP BY category
  `);

    // By severity
    const bySeverityResult = await db.execute(`
    SELECT severity, COUNT(*) as count
    FROM alerts
    WHERE timestamp > datetime('now', '-7 days')
    GROUP BY severity
  `);

    // Top contributors
    const topContributorsResult = await db.execute(`
    SELECT author_name, COUNT(*) as count
    FROM discord_messages m
    LEFT JOIN alerts a ON m.message_id = a.message_id
    WHERE m.timestamp > datetime('now', '-7 days')
    AND a.id IS NOT NULL
    GROUP BY author_id
    ORDER BY count DESC
    LIMIT 5
  `);

    return {
        total: totalAlerts.rows[0].count,
        byCategory: Object.fromEntries(
            byCategoryResult.rows.map(r => [r.category, r.count])
        ),
        bySeverity: Object.fromEntries(
            bySeverityResult.rows.map(r => [r.severity, r.count])
        ),
        topContributors: topContributorsResult.rows
    };
}

// ============================================================================
// 6. TRENDING TOPICS
// ============================================================================

// Find what users are talking about most
async function getTrendingTopics(db, hours = 24) {
    const result = await db.execute(`
    WITH word_freq AS (
      SELECT 
        LOWER(SUBSTR(content, 1, 20)) as keyword,
        COUNT(*) as frequency
      FROM discord_messages
      WHERE timestamp > datetime('now', ? || ' hours')
      GROUP BY SUBSTR(content, 1, 20)
    )
    SELECT keyword, frequency
    FROM word_freq
    WHERE frequency > 2
    ORDER BY frequency DESC
    LIMIT 10
  `, [`-${hours}`]);

    return result.rows;
}

// ============================================================================
// 7. DUPLICATE DETECTION
// ============================================================================

// Find similar bug reports to prevent duplicates
async function findDuplicateBugs(db, newBugSummary) {
    const result = await db.execute(`
    SELECT a.*, m.content
    FROM alerts a
    JOIN discord_messages m ON a.message_id = m.message_id
    WHERE a.category = 'bug'
    AND a.timestamp > datetime('now', '-30 days')
  `);

    // Use LLM to find similar issues
    const analysis = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'user',
            content: `Are any of these bugs similar to: "${newBugSummary}"?\n${result.rows.map(r => r.summary).join('\n')
                }\nRespond with indices of similar ones or "none".`
        }]
    });

    return analysis.choices[0].message.content;
}

// ============================================================================
// 8. TEAM PERFORMANCE METRICS
// ============================================================================

// Track team response and resolution metrics
async function getTeamMetrics(db) {
    const result = await db.execute(`
    SELECT
      a.category,
      COUNT(*) as alerts_created,
      AVG(CAST(
        (CASE 
          WHEN strftime('%s', 'now') - strftime('%s', a.timestamp) < 3600 THEN 1
          ELSE 0
        END) AS FLOAT
      )) as response_within_1hr,
      COUNT(DISTINCT m.author_id) as unique_reporters
    FROM alerts a
    JOIN discord_messages m ON a.message_id = m.message_id
    WHERE a.timestamp > datetime('now', '-30 days')
    GROUP BY a.category
  `);

    return result.rows;
}

// ============================================================================
// 9. FEEDBACK LOOP CLOSURE
// ============================================================================

// Mark feedback as resolved with a reaction or command
async function markFeedbackResolved(message, resolutionNote) {
    // Add checkmark emoji
    await message.react('✅');

    // Store resolution
    await db.execute(`
    UPDATE alerts
    SET resolved = 1, resolution_note = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE message_id = ?
  `, [resolutionNote, message.id]);

    // Notify original author
    await message.author.send(
        `✅ Your feedback has been addressed: ${resolutionNote}`
    );
}

// ============================================================================
// 10. INTEGRATION WITH EXTERNAL TOOLS
// ============================================================================

// Post critical bugs to GitHub issues automatically
async function createGitHubIssue(analysis, message) {
    if (analysis.severity === 'critical' && analysis.category === 'bug') {
        const response = await fetch(
            'https://api.github.com/repos/yourorg/yourrepo/issues',
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: analysis.summary,
                    body: `\`\`\`\nOriginal Message: ${message.content}\nReported by: ${message.author.username}\nDiscord Link: ${message.url}\n\`\`\``,
                    labels: ['bug', 'discord-feedback'],
                    priority: 'critical'
                })
            }
        );

        const issue = await response.json();
        return issue.html_url;
    }
}

// ============================================================================
// 11. BATCH PROCESSING FOR BACKLOG
// ============================================================================

// Process historical messages from a channel
async function processHistoricalMessages(channel, hoursBack = 24) {
    const messages = await channel.messages.fetch({ limit: 100 });

    for (const [, message] of messages) {
        if (new Date() - message.createdTimestamp > hoursBack * 3600000) break;

        // Store and analyze
        await storeMessage(db, message);
        const analysis = await analyzeMessageWithLLM(message.content);

        if (analysis.requiresAlert) {
            await storeAlert(db, analysis);
        }
    }

    console.log(`✅ Processed ${messages.size} historical messages`);
}

// ============================================================================
// 12. CONFIGURATION TEMPLATES
// ============================================================================

// Different configurations for different use cases
const CONFIG_TEMPLATES = {
    // Focus on bugs only
    BUG_TRACKING: {
        categories: ['bug'],
        minSeverity: 'medium',
        alertChannels: {
            bug: 'critical-bugs',
            feature_request: null,
            complaint: null
        }
    },

    // Focus on feature requests
    PRODUCT_FEEDBACK: {
        categories: ['feature_request', 'praise'],
        minSeverity: null,
        alertChannels: {
            feature_request: 'feature-ideas',
            praise: 'wins',
            bug: null
        }
    },

    // Monitor everything
    FULL_FEEDBACK: {
        categories: ['bug', 'feature_request', 'complaint', 'praise', 'documentation'],
        minSeverity: null,
        alertChannels: {
            bug: 'bugs',
            feature_request: 'feature-requests',
            complaint: 'complaints',
            praise: 'praise',
            documentation: 'docs'
        }
    }
};

export default {
    handleCriticalBug,
    createSupportTicket,
    notifyProductTeam,
    advancedAnalysis,
    generateWeeklyReport,
    getTrendingTopics,
    findDuplicateBugs,
    getTeamMetrics,
    markFeedbackResolved,
    createGitHubIssue,
    processHistoricalMessages,
    CONFIG_TEMPLATES
};
