# Discord Steam Check Bot

A Discord bot that provides detailed Steam profile information and ban status in a clean, structured embed format. Inspired by [steamid.xyz](https://steamid.xyz).

## Features

* Fetches Steam profile details without revealing sensitive info.
* Shows bans, trade, and community status.
* Displays Steam IDs (Steam2, Steam3, Steam32, Steam64).
* Displays last online activity and CS2 hours (if available).
* Lists total games and friends.
* Structured embed with sections: **Account Details**, **Activity**, **Other**, **Bans**, **Steam IDs**.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/your-repo.git
cd your-repo
```

### 2. Install dependencies

Make sure you have **Node.js 18+** installed.

```bash
npm install
```

### 3. Set up environment variables

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Open `.env` and fill in your credentials:

```dotenv
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_guild_id_here
STEAM_API_KEY=your_steam_api_key_here
```

### 4. Run the bot

```bash
node index.js
```

## Usage

Use the slash command in your Discord server:

```
/check profile:<steam profile link, vanity, or ID>
```
<img width="478" height="539" alt="image" src="https://github.com/user-attachments/assets/4df42f9f-fe8e-4055-9a2f-b762a5c980fb" />


**Examples:**

```
/check profile:https://steamcommunity.com/id/wolfl1x/
/check profile:76561199274987618
/check profile:STEAM_0:0:657360945
/check profile:U:1:1314721890
/check profile:wolfl1x
```
