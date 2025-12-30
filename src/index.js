import 'dotenv/config';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import { initializeDatabase } from './db/database.js';
import { analyzeMessageWithLLM } from './services/llm.js';
import { storeMessage, storeAlert } from './db/queries.js';
import { isRelevantMessage, formatAlert, formatExternalAlert } from './utils/helpers.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const SERVER_NAME = 'ClientAcquisition.io';
const MONITORED_CHANNELS = ['truth-engine', 'cookai-test-kitchen'];
const ALERT_CHANNEL_NAME = '❗║error-handling';

let db;

client.once('clientReady', async () => {
    console.log('-----------------------------------------');
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📅 Date: ${new Date().toLocaleString()}`);

    const guilds = client.guilds.cache.map(guild => guild.name);
    console.log(`🏠 Connected to ${guilds.length} servers: ${guilds.join(', ')}`);

    // Initialize database
    try {
        db = await initializeDatabase();
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }

    console.log(`📡 Monitoring channels named: ${MONITORED_CHANNELS.join(', ')}`);
    console.log(`📢 Alerts will be sent to: #${ALERT_CHANNEL_NAME}`);
    console.log('🚀 Bot is now live and listening for messages...');
    console.log('-----------------------------------------');

    // Start monitoring database for external entries
    startDatabaseMonitor();
});

let lastBugId = 0;
let lastFeatureId = 0;

async function startDatabaseMonitor() {
    console.log('🔍 Database monitor started (checking for external bugs/features)...');

    try {
        // Initialize last IDs to current max to avoid spamming old entries on startup
        const bugRes = await db.execute('SELECT MAX(id) as maxId FROM bug_reports');
        const featRes = await db.execute('SELECT MAX(id) as maxId FROM feature_suggestions');

        lastBugId = bugRes.rows[0]?.maxId || 0;
        lastFeatureId = featRes.rows[0]?.maxId || 0;

        console.log(`ℹ️ Initialized monitor: Last Bug ID=${lastBugId}, Last Feature ID=${lastFeatureId}`);
    } catch (error) {
        console.error('❌ Error initializing database monitor:', error);
    }

    // Poll every 30 seconds
    setInterval(async () => {
        try {
            // Check for new bugs
            const newBugs = await db.execute({
                sql: 'SELECT * FROM bug_reports WHERE id > ? ORDER BY id ASC',
                args: [lastBugId]
            });

            for (const bug of newBugs.rows) {
                lastBugId = Math.max(lastBugId, bug.id);

                // Skip if it was created by the bot (we already alerted for those)
                if (bug.subject.startsWith('[Discord]')) continue;

                console.log(`🔔 New external bug detected: ${bug.subject}`);
                await broadcastExternalAlert(bug, 'bug');
            }

            // Check for new features
            const newFeatures = await db.execute({
                sql: 'SELECT * FROM feature_suggestions WHERE id > ? ORDER BY id ASC',
                args: [lastFeatureId]
            });

            for (const feat of newFeatures.rows) {
                lastFeatureId = Math.max(lastFeatureId, feat.id);

                // Skip if it was created by the bot
                if (feat.title.startsWith('[Discord]')) continue;

                console.log(`🔔 New external feature detected: ${feat.title}`);
                await broadcastExternalAlert(feat, 'feature');
            }
        } catch (error) {
            console.error('❌ Error polling database:', error);
        }
    }, 30000); // 30 second interval
}

async function broadcastExternalAlert(data, type) {
    const embed = formatExternalAlert(data, type);
    const guild = client.guilds.cache.find(g => g.name === SERVER_NAME);

    if (!guild) {
        console.warn(`⚠️ Server "${SERVER_NAME}" not found. Cannot broadcast alert.`);
        return;
    }

    try {
        // Route based on type: bugs → error-handling, features → feature-suggestions
        const targetChannelName = type === 'feature' ? FEATURE_CHANNEL_NAME : ALERT_CHANNEL_NAME;

        const channel = guild.channels.cache.find(
            c => c.name.toLowerCase() === targetChannelName.toLowerCase() && c.type === ChannelType.GuildText
        );

        if (channel) {
            await channel.send({ embeds: [embed] });
            console.log(`✅ Sent external alert to #${targetChannelName} in "${guild.name}"`);
        } else {
            console.warn(`⚠️ Channel #${targetChannelName} NOT FOUND in "${guild.name}".`);
        }
    } catch (error) {
        console.error('❌ Error broadcasting external alert:', error);
    }
}

client.on('messageCreate', async (message) => {
    try {
        // Skip bot messages and own messages
        if (message.author.bot) return;

        // Only listen to ClientAcquisition Server
        if (message.guild.name !== SERVER_NAME) {
            return;
        }

        // Check if message is in monitored channel
        const isMonitored = MONITORED_CHANNELS.some(
            channelName => message.channel.name.toLowerCase().includes(channelName.toLowerCase())
        );

        if (!isMonitored) {
            // Optional: Log skipped messages from other channels for debugging
            // console.log(`ℹ️ Skipping message from #${message.channel.name} (not monitored)`);
            return;
        }

        // Check message relevance (e.g., length, content)
        if (!isRelevantMessage(message)) {
            console.log(`ℹ️ Skipping irrelevant message from ${message.author.username} in #${message.channel.name}`);
            return;
        }

        console.log(`📩 [${new Date().toLocaleTimeString()}] New message in #${message.channel.name} from ${message.author.username}`);
        console.log(`📝 Content: "${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}"`);

        // Store original message
        await storeMessage(db, {
            messageId: message.id,
            channelId: message.channelId,
            channelName: message.channel.name,
            authorId: message.author.id,
            authorName: message.author.username,
            content: message.content,
            timestamp: new Date(message.createdTimestamp),
            url: message.url,
        });

        // Analyze with LLM
        const analysis = await analyzeMessageWithLLM(message.content);

        if (analysis.requiresAlert) {
            console.log(`🚨 Alert triggered: ${analysis.category} (${analysis.severity || 'N/A'})`);

            // Store alert
            await storeAlert(db, {
                messageId: message.id,
                category: analysis.category,
                severity: analysis.severity,
                summary: analysis.summary,
                recommendation: analysis.recommendation,
                timestamp: new Date(),
            });

            // Send alert to designated channel with attachments
            await sendAlertToChannel(message.guild, analysis, message, message.attachments);
        } else {
            console.log(`ℹ️ No alert required for this message (Category: ${analysis.category})`);
        }

    } catch (error) {
        console.error('❌ Error processing message:', error);
    }
});

const FEATURE_CHANNEL_NAME = '⚙️║feature-suggestions';

async function sendAlertToChannel(guild, analysis, originalMessage, attachments) {
    try {
        console.log(`🔍 Routing alert for server: "${guild.name}"`);

        // Route based on category: bugs → error-handling, features → feature-suggestions
        let targetChannelNames = [];
        if (analysis.category === 'feature_request') {
            targetChannelNames = [FEATURE_CHANNEL_NAME];
        } else {
            targetChannelNames = [ALERT_CHANNEL_NAME];
        }

        const embed = formatAlert(analysis, originalMessage);

        // Prepare files from attachments
        const files = attachments && attachments.size > 0 ? Array.from(attachments.values()).map(att => att.url) : [];

        for (const name of targetChannelNames) {
            const channel = guild.channels.cache.find(
                c => c.name.toLowerCase() === name.toLowerCase() && c.type === ChannelType.GuildText
            );

            if (channel) {
                const messagePayload = { embeds: [embed] };
                if (files.length > 0) {
                    messagePayload.files = files;
                }

                await channel.send(messagePayload);
                console.log(`📢 Alert sent to #${name} in "${guild.name}"${files.length > 0 ? ` with ${files.length} attachment(s)` : ''}`);

                // If it was a bug or feature, send a follow-up confirmation
                if (analysis.category === 'bug' || analysis.category === 'feature_request') {
                    const type = analysis.category === 'bug' ? '🐛 Bug Report' : '💡 Feature Suggestion';
                    await channel.send(`✅ **System Update**: This ${type} has been automatically logged in the database for the product team.`);
                }
            } else {
                console.warn(`⚠️ Alert channel "${name}" not found in guild "${guild.name}"`);
                if (name === ALERT_CHANNEL_NAME) {
                    console.log(`ℹ️ Available text channels: ${guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => c.name).join(', ')}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error sending alert:', error);
    }
}

client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    client.destroy();
    if (db) db.close?.();
    process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);
