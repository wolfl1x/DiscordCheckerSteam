/*
Discord Steam Check Bot with structured Embed sections and monospaced lists
*/

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fetch = global.fetch || require('node-fetch');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const STEAM_API_KEY = process.env.STEAM_API_KEY;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID || !STEAM_API_KEY) {
  console.error('Please set DISCORD_TOKEN, CLIENT_ID, GUILD_ID and STEAM_API_KEY in environment.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function formatDate(unixSeconds) {
  if (!unixSeconds) return 'Unknown';
  const d = new Date(unixSeconds * 1000);
  return d.toUTCString();
}

function visibilityText(code) {
  switch (code) {
    case 1: return 'Private';
    case 2: return 'Friends Only';
    case 3: return 'Public';
    default: return `Unknown (${code})`;
  }
}

function personaStateText(code) {
  switch (code) {
    case 0: return 'Offline';
    case 1: return 'Online';
    case 2: return 'Busy';
    case 3: return 'Away';
    case 4: return 'Snooze';
    case 5: return 'Looking to Trade';
    case 6: return 'Looking to Play';
    default: return `Unknown (${code})`;
  }
}

function toBigIntSafe(s) {
  try { return BigInt(s.toString()); } catch (e) { return null; }
}

function steam64ToOther(steam64Str) {
  const steam64 = toBigIntSafe(steam64Str);
  if (!steam64) return null;
  const OFFSET = BigInt('76561197960265728');
  const accountId = steam64 - OFFSET;
  const auth = accountId % 2n;
  const account32 = (accountId - auth) / 2n;
  return {
    steam64: steam64.toString(),
    steam32: accountId.toString(),
    steam2: `STEAM_0:${auth.toString()}:${account32.toString()}`,
    steam3: `U:1:${accountId.toString()}`
  };
}

async function resolveProfileToSteam64(input) {
  input = input.trim();
  const p1 = input.match(/steamcommunity\.com\/profiles\/(\d{17,})/i);
  if (p1) return p1[1];

  const p2 = input.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/i);
  if (p2) return await resolveVanity(p2[1]);

  if (/^\d{17,}$/.test(input)) return input;

  const p5 = input.match(/^STEAM_\d:(\d):(\d+)$/i);
  if (p5) {
    const y = BigInt(p5[1]);
    const z = BigInt(p5[2]);
    const accountId = z * 2n + y;
    return (accountId + BigInt('76561197960265728')).toString();
  }

  const p6 = input.match(/^U:1:(\d+)$/i);
  if (p6) {
    const accountId = BigInt(p6[1]);
    return (accountId + BigInt('76561197960265728')).toString();
  }

  return await resolveVanity(input);
}

async function resolveVanity(vanity) {
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to resolve vanity URL');
  const j = await res.json();
  if (j.response && j.response.success === 1 && j.response.steamid) return j.response.steamid;
  throw new Error('Could not resolve vanity to steamid64');
}

async function getPlayerSummaries(steam64) {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steam64}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch player summaries');
  const j = await res.json();
  return j.response && j.response.players && j.response.players[0] ? j.response.players[0] : null;
}

async function getPlayerBans(steam64) {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${STEAM_API_KEY}&steamids=${steam64}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch player bans');
  const j = await res.json();
  return j.players && j.players[0] ? j.players[0] : null;
}

async function getFriendCount(steam64) {
  const url = `https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${STEAM_API_KEY}&steamid=${steam64}`;
  const res = await fetch(url);
  if (!res.ok) return '<Private>';
  const j = await res.json();
  if (!j.friendslist || !j.friendslist.friends) return '<Private>';
  return j.friendslist.friends.length.toString();
}

async function getCS2Hours(steam64) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steam64}&include_appinfo=1&include_played_free_games=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return '<Private>';
    const j = await res.json();
    if (!j.response || !j.response.games) return '<Private>';
    const cs2 = j.response.games.find(g => g.appid === 730);
    if (!cs2 || !cs2.playtime_forever) return '<Private>';
    const hours = (cs2.playtime_forever / 60).toFixed(1);
    return `${hours} hours`;
  } catch {
    return '<Private>';
  }
}

async function getGameCount(steam64) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steam64}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return '<Private>';
    const j = await res.json();
    if (!j.response || !j.response.game_count) return '<Private>';
    return j.response.game_count.toString();
  } catch {
    return '<Private>';
  }
}

const commands = [{
  name: 'check',
  description: 'Check a Steam profile and show bans/info',
  options: [
    { name: 'profile', description: 'Steam profile link, vanity, or id', type: 3, required: true }
  ]
}];

(async () => {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    console.log('Registering guild command...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Command registered.');
  } catch (err) {
    console.error('Failed to register commands', err);
  }
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'check') return;

  await interaction.deferReply();
  const input = interaction.options.getString('profile', true);
  try {
    const steam64 = await resolveProfileToSteam64(input);
    const summary = await getPlayerSummaries(steam64);
    const bans = await getPlayerBans(steam64);
    const friends = await getFriendCount(steam64);
    const cs2hours = await getCS2Hours(steam64);
    const gameCount = await getGameCount(steam64);

    if (!summary) return interaction.editReply('Could not fetch Steam profile (maybe private or not found).');

    const ids = steam64ToOther(steam64) || { steam64, steam32: 'N/A', steam2: 'N/A', steam3: 'N/A' };
    const steamIdBlock = `Steam2   ${ids.steam2}\nSteam3   ${ids.steam3}\nSteam32  ${ids.steam32}\nSteam64  ${ids.steam64}`;
    const accountDetailsBlock = `Country   ${summary.loccountrycode || '—'}\nCreated   ${summary.timecreated ? formatDate(summary.timecreated) : '—'}\nVisibility ${visibilityText(summary.communityvisibilitystate)}`;
    const activityBlock = `Status     ${personaStateText(summary.personastate)}\nLast Online ${summary.lastlogoff ? formatDate(summary.lastlogoff) : '—'}`;
    const otherBlock = `CS2 Hours  ${cs2hours}\nGames      ${gameCount}\nFriends    ${friends}`;

    const vac = bans && bans.VACBanned ? `❌ VAC Banned ( ${bans.NumberOfVACBans || 0} bans )` : '✔ VAC';
    const community = bans && bans.CommunityBanned ? '❌ Community Banned' : '✔ Community';
    const economy = bans && bans.EconomyBan && bans.EconomyBan !== 'none' ? `❌ Economy: ${bans.EconomyBan}` : '✔ Trade';

    const embed = new EmbedBuilder()
      .setTitle(summary.personaname || 'Unknown')
      .setURL(summary.profileurl || `https://steamcommunity.com/profiles/${steam64}`)
      .setThumbnail(summary.avatarfull || summary.avatar || null)
      .setDescription(`**Real Name:** ${summary.realname || '—'}`)
      .addFields([
        { name: 'Account Details', value: `\`\`\`${accountDetailsBlock}\`\`\``, inline: false },
        { name: 'Activity', value: `\`\`\`${activityBlock}\`\`\``, inline: false },
        { name: 'Other', value: `\`\`\`${otherBlock}\`\`\``, inline: false },
        { name: 'Bans / Trade / Community', value: `${vac} • ${economy} • ${community}`, inline: false },
        { name: 'Steam IDs', value: `\`\`\`${steamIdBlock}\`\`\``, inline: false },
        { name: 'Profile URL', value: summary.profileurl || `https://steamcommunity.com/profiles/${steam64}`, inline: false }
      ])
      .setColor(0x1b2838)
      .setFooter({ text: 'Steam Check • steamid.xyz', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    await interaction.editReply(`Error: ${err.message}`);
  }
});

client.login(DISCORD_TOKEN);
