/**
 * Discord Commands Module
 * Provides slash commands for accessing analytics and managing the bot
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getRecentAlerts } from '../db/queries.js';
import { generateDailyReport, searchAlerts } from '../services/analytics.js';

export const commands = {
    recent_alerts: {
        data: new SlashCommandBuilder()
            .setName('recent_alerts')
            .setDescription('Show recent alerts from the feedback system')
            .addIntegerOption(option =>
                option.setName('hours')
                    .setDescription('Hours to look back (default: 24)')
                    .setRequired(false)
            ),

        async execute(interaction, db) {
            await interaction.deferReply();

            const hours = interaction.options.getInteger('hours') || 24;
            const alerts = await getRecentAlerts(db, hours);

            if (alerts.length === 0) {
                return interaction.editReply('No alerts found in the last ' + hours + ' hours.');
            }

            const embeds = alerts.slice(0, 10).map(alert =>
                new EmbedBuilder()
                    .setTitle(alert.category.replace(/_/g, ' ').toUpperCase())
                    .setDescription(alert.summary)
                    .addFields(
                        { name: 'Author', value: alert.author_name || 'Unknown', inline: true },
                        { name: 'Severity', value: alert.severity || 'N/A', inline: true },
                        { name: 'Message', value: alert.content.substring(0, 100) + '...', inline: false }
                    )
                    .setColor(alert.severity === 'critical' ? 0xFF0000 : 0x3498DB)
                    .setTimestamp(new Date(alert.timestamp))
            );

            interaction.editReply({ embeds });
        }
    },

    search: {
        data: new SlashCommandBuilder()
            .setName('search')
            .setDescription('Search alerts and messages')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('Search term')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('category')
                    .setDescription('Filter by category')
                    .addChoices(
                        { name: 'Bug', value: 'bug' },
                        { name: 'Feature Request', value: 'feature_request' },
                        { name: 'Complaint', value: 'complaint' }
                    )
                    .setRequired(false)
            ),

        async execute(interaction, db) {
            await interaction.deferReply();

            const query = interaction.options.getString('query');
            const category = interaction.options.getString('category');

            const results = await searchAlerts(db, query, { category });

            if (results.length === 0) {
                return interaction.editReply('No results found for your search.');
            }

            const embed = new EmbedBuilder()
                .setTitle(`Search Results (${results.length} found)`)
                .setDescription(results.slice(0, 5).map((r, i) =>
                    `${i + 1}. **${r.category}** - ${r.summary}`
                ).join('\n'))
                .setColor(0x3498DB);

            interaction.editReply({ embeds: [embed] });
        }
    },

    stats: {
        data: new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Show feedback system statistics'),

        async execute(interaction, db) {
            await interaction.deferReply();

            const report = await generateDailyReport(db);

            const embed = new EmbedBuilder()
                .setTitle('📊 Feedback Statistics')
                .setColor(0x3498DB);

            if (report.length > 0) {
                embed.setDescription(report.slice(0, 10).map(r =>
                    `**${r.category}**: ${r.count} alerts`
                ).join('\n'));
            } else {
                embed.setDescription('No data available');
            }

            interaction.editReply({ embeds: [embed] });
        }
    }
};
