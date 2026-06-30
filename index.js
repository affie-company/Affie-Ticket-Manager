require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is awake!'));
app.listen(port, () => console.log(`Keep-alive server listening on port ${port}!`));

const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionsBitField,
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Settings
const CATEGORY_NAME = '⏤Support & Feedback ⏤⏤⏤';
const MODERATOR_ROLE_NAME = 'Moderator';
const TICKET_CHANNEL_NAME = 'create-a-ticket';
const LOG_CHANNEL_NAME = 'ticket-logs';

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Advanced Ticket Bot is ready to manage tickets.');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !setup command to spawn the ticket dropdown
    if (command === '!setup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const ticketChannel = message.guild.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
        
        if (!ticketChannel) {
            return message.reply(`Could not find a channel named "${TICKET_CHANNEL_NAME}". Please create it first.`);
        }

        const embed = new EmbedBuilder()
            .setTitle('🎫 Support Tickets')
            .setDescription('Please select the reason for your ticket from the dropdown menu below.')
            .setColor('#2F3136');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_category_select')
                    .setPlaceholder('Select a category to open a ticket...')
                    .addOptions([
                        {
                            label: 'General Support',
                            description: 'Ask a general question',
                            value: 'general_support',
                            emoji: '💡'
                        },
                        {
                            label: 'Billing / Purchases',
                            description: 'Issues with payments or the store',
                            value: 'billing',
                            emoji: '💳'
                        },
                        {
                            label: 'Report a User',
                            description: 'Report a member for breaking the rules',
                            value: 'report',
                            emoji: '⚠️'
                        },
                    ]),
            );

        await ticketChannel.send({ embeds: [embed], components: [row] });
        await message.reply(`Setup complete! Sent the ticket dropdown to ${ticketChannel}`);
        return;
    }

    // Helper checks for moderator commands
    const category = message.guild.channels.cache.find(c => c.name === CATEGORY_NAME && c.type === ChannelType.GuildCategory);
    const inTicketChannel = category && message.channel.parentId === category.id;
    
    const modRole = message.guild.roles.cache.find(r => r.name === MODERATOR_ROLE_NAME);
    const isModerator = modRole && (message.member.roles.cache.has(modRole.id) || message.member.permissions.has(PermissionsBitField.Flags.Administrator));

    // !closeticket command
    if (command === '!closeticket') {
        if (!modRole) return message.reply(`Could not find a role named "${MODERATOR_ROLE_NAME}".`);
        if (!isModerator) return message.reply('You do not have permission to use this command. Only Moderators can close tickets.');
        if (!inTicketChannel) return message.reply('You can only use this command inside a ticket channel!');

        await message.channel.send('Generating transcript and closing ticket in 5 seconds...');
        
        setTimeout(async () => {
            try {
                // Generate HTML Transcript
                const attachment = await discordTranscripts.createTranscript(message.channel, {
                    limit: -1, // Fetches all messages
                    fileName: `${message.channel.name}-transcript.html`,
                    poweredBy: false,
                    saveImages: true
                });

                // Find the log channel
                let logChannel = message.guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🎫 Ticket Closed')
                        .addFields(
                            { name: 'Ticket Name', value: message.channel.name, inline: true },
                            { name: 'Closed By', value: `<@${message.author.id}>`, inline: true }
                        )
                        .setColor('#e74c3c')
                        .setTimestamp();
                        
                    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
                }

                // Delete the ticket channel
                await message.channel.delete().catch(console.error);
            } catch (error) {
                console.error('Error during ticket closure:', error);
            }
        }, 5000);
        return;
    }

    // !claim command
    if (command === '!claim') {
        if (!isModerator) return message.reply('Only Moderators can claim tickets.');
        if (!inTicketChannel) return message.reply('You can only use this command inside a ticket channel!');

        try {
            // Append the moderator's name to the channel name
            const cleanModName = message.author.username.replace(/[^a-z0-9-]/gi, '').toLowerCase();
            const currentName = message.channel.name;
            
            if (!currentName.endsWith(`-${cleanModName}`)) {
                await message.channel.setName(`${currentName}-${cleanModName}`);
            }
            
            const claimEmbed = new EmbedBuilder()
                .setDescription(`✅ **${message.author.username}** has claimed this ticket and will be assisting you shortly.`)
                .setColor('#f1c40f');
                
            await message.channel.send({ embeds: [claimEmbed] });
        } catch (error) {
            console.error('Error claiming ticket:', error);
            message.reply('Failed to rename the channel. Make sure I have the "Manage Channels" permission.');
        }
        return;
    }

    // !add @user command
    if (command === '!add') {
        if (!isModerator) return message.reply('Only Moderators can add users.');
        if (!inTicketChannel) return message.reply('You can only use this command inside a ticket channel!');

        const targetUser = message.mentions.users.first() || message.guild.members.cache.get(args[0])?.user;
        if (!targetUser) return message.reply(`Please mention a user to add (e.g., \`!add @username\`).`);

        try {
            await message.channel.permissionOverwrites.edit(targetUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
            await message.reply(`✅ Successfully added ${targetUser} to the ticket.`);
        } catch (error) {
            console.error('Error adding user:', error);
            message.reply('Failed to add the user to the ticket.');
        }
        return;
    }

    // !remove @user command
    if (command === '!remove') {
        if (!isModerator) return message.reply('Only Moderators can remove users.');
        if (!inTicketChannel) return message.reply('You can only use this command inside a ticket channel!');

        const targetUser = message.mentions.users.first() || message.guild.members.cache.get(args[0])?.user;
        if (!targetUser) return message.reply(`Please mention a user to remove (e.g., \`!remove @username\`).`);

        try {
            await message.channel.permissionOverwrites.edit(targetUser.id, {
                ViewChannel: false,
                SendMessages: false,
                ReadMessageHistory: false
            });
            await message.reply(`✅ Successfully removed ${targetUser} from the ticket.`);
        } catch (error) {
            console.error('Error removing user:', error);
            message.reply('Failed to remove the user from the ticket.');
        }
        return;
    }
});

client.on('interactionCreate', async (interaction) => {
    // Check if the interaction is our dropdown menu
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'ticket_category_select') {
        const selectedValue = interaction.values[0];
        const guild = interaction.guild;
        
        // Find category
        const category = guild.channels.cache.find(c => c.name === CATEGORY_NAME && c.type === ChannelType.GuildCategory);
        if (!category) {
            return interaction.reply({ content: `Could not find the category "${CATEGORY_NAME}". Please ask an admin to create it.`, ephemeral: true });
        }

        // Find moderator role
        const modRole = guild.roles.cache.find(r => r.name === MODERATOR_ROLE_NAME);
        if (!modRole) {
            return interaction.reply({ content: `Could not find the "${MODERATOR_ROLE_NAME}" role. Please ask an admin to create it.`, ephemeral: true });
        }

        // Create base ticket name from user
        const baseUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const ticketName = `ticket-${baseUsername}`;

        // Check if user already has an open ticket (including claimed ones like ticket-user-mod)
        const existingChannel = guild.channels.cache.find(c => 
            c.name.startsWith(`ticket-${baseUsername}`) && 
            c.parentId === category.id
        );
        
        if (existingChannel) {
            return interaction.reply({ content: `You already have an open ticket: ${existingChannel}`, ephemeral: true });
        }

        // Create the channel
        try {
            const ticketChannel = await guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                    },
                    {
                        id: modRole.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                    },
                ],
            });

            await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });

            // Map the dropdown values to human-readable strings
            const categoryNames = {
                'general_support': 'General Support',
                'billing': 'Billing & Purchases',
                'report': 'Report a User'
            };

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`Welcome to your ticket, ${interaction.user.username}!`)
                .setDescription(`Support will be with you shortly.\n\n**Reason for ticket:** ${categoryNames[selectedValue]}\n\n**Moderator Commands:**\n\`!claim\` - Claim this ticket\n\`!add @user\` / \`!remove @user\` - Manage access\n\`!closeticket\` - Save transcript and close`)
                .setColor('#3498db');

            await ticketChannel.send({ content: `${interaction.user} <@&${modRole.id}>`, embeds: [welcomeEmbed] });

        } catch (error) {
            console.error(error);
            interaction.reply({ content: 'There was an error creating your ticket.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
