import { EmbedBuilder } from 'discord.js';

const MIN_MESSAGE_LENGTH = parseInt(process.env.MIN_MESSAGE_LENGTH || '5', 10);
const TEAM_MEMBER_IDS = (process.env.TEAM_MEMBER_IDS || '').split(',').filter(Boolean);

export function isRelevantMessage(message) {
    // Filter by minimum length
    if (message.content.length < MIN_MESSAGE_LENGTH) {
        return false;
    }

    // Ignore bot messages
    if (message.author.bot) {
        return false;
    }

    // Ignore links-only messages
    if (!message.content.replace(/https?:\/\/[^\s]+/g, '').trim()) {
        return false;
    }

    return true;
}

export function formatAlert(analysis, originalMessage) {
    const severityColors = {
        critical: 0xFF0000, // Red
        high: 0xFF6600,      // Orange
        medium: 0xFFCC00,    // Yellow
        low: 0x00CC00,       // Green
    };

    const categoryEmojis = {
        bug: '🐛',
        feature_request: '✨',
        complaint: '⚠️',
        praise: '👍',
        documentation: '📚',
        other: '💬',
    };

    const color = severityColors[analysis.severity] || 0x3498DB;
    const emoji = categoryEmojis[analysis.category] || '💬';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} ${analysis.category.replace(/_/g, ' ').toUpperCase()}`)
        .addFields(
            {
                name: 'Summary',
                value: analysis.summary,
                inline: false,
            },
            {
                name: 'Original Message',
                value: originalMessage.content.substring(0, 1024) || 'No content',
                inline: false,
            },
            {
                name: 'From',
                value: `${originalMessage.author.username} in #${originalMessage.channel.name}`,
                inline: true,
            },
            {
                name: 'Severity',
                value: analysis.severity?.toUpperCase() || 'N/A',
                inline: true,
            },
            {
                name: 'Recommendation',
                value: analysis.recommendation || 'Review message',
                inline: false,
            }
        )
        .setFooter({
            text: 'Automated Feedback Analysis',
            iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
        })
        .setTimestamp();

    if (originalMessage.url) {
        embed.addFields({
            name: 'Message Link',
            value: `[Jump to message](${originalMessage.url})`,
            inline: false,
        });
    }

    return embed;
}

export function formatExternalAlert(data, type) {
    const severityColors = {
        critical: 0xFF0000,
        high: 0xFF6600,
        medium: 0xFFCC00,
        low: 0x00CC00,
    };

    const color = severityColors[data.severity || data.priority] || 0x3498DB;
    const emoji = type === 'bug' ? '🐛' : '💡';
    const title = type === 'bug' ? 'NEW BUG REPORT (EXTERNAL)' : 'NEW FEATURE SUGGESTION (EXTERNAL)';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} ${title}`)
        .addFields(
            {
                name: 'Subject/Title',
                value: data.subject || data.title || 'No title',
                inline: false,
            },
            {
                name: 'Description',
                value: (data.description || 'No description').substring(0, 1024),
                inline: false,
            },
            {
                name: 'Status',
                value: data.status?.toUpperCase() || 'OPEN',
                inline: true,
            },
            {
                name: 'Severity/Priority',
                value: (data.severity || data.priority || 'MEDIUM').toUpperCase(),
                inline: true,
            }
        )
        .setFooter({
            text: 'Database Monitor',
        })
        .setTimestamp(new Date(data.created_at * 1000 || Date.now()));

    if (data.url) {
        embed.addFields({ name: 'URL', value: data.url, inline: false });
    }

    return embed;
}

export function isTeamMember(userId) {
    return TEAM_MEMBER_IDS.includes(userId);
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
