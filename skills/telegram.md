# Skill: Telegram Messaging

## When to Use

When the user asks you to send a message on Telegram, send a Telegram notification, or interact with a Telegram bot.

## How It Works

Use the **Telegram Bot API** via the `http_request` tool. The Bot API is a simple HTTP API — you just make GET/POST requests.

## Required Info from User

- **Bot Token**: The bot's API token (looks like `123456:ABCdefGHI...`)
- **Chat ID**: The recipient's chat ID (a number like `1927701329`)

Store these in memory using `write_memory` so the user doesn't have to repeat them.

## API Endpoint

```
https://api.telegram.org/bot<BOT_TOKEN>/sendMessage
```

## Sending a Message

Use `http_request` with:

- **url**: `https://api.telegram.org/bot<BOT_TOKEN>/sendMessage`
- **method**: `POST`
- **headers**: `{"Content-Type": "application/json"}`
- **body**: `{"chat_id": <CHAT_ID>, "text": "<YOUR_MESSAGE>", "parse_mode": "Markdown"}`

### Example

```json
{
  "url": "https://api.telegram.org/bot123456:ABCdef/sendMessage",
  "method": "POST",
  "headers": "{\"Content-Type\": \"application/json\"}",
  "body": "{\"chat_id\": 1927701329, \"text\": \"Hello from NexusAgent!\", \"parse_mode\": \"Markdown\"}"
}
```

## Response

A successful response looks like:

```json
{"ok": true, "result": {"message_id": 123, ...}}
```

## Tips

- Always save the bot token and chat ID to memory on first use
- On subsequent requests, read memory first to get stored credentials
- You can use `parse_mode: "Markdown"` for formatted messages
- To send to multiple users, make separate requests for each chat_id

## Other Useful Endpoints

- **Get updates**: `GET /bot<TOKEN>/getUpdates` — see incoming messages
- **Send photo**: `POST /bot<TOKEN>/sendPhoto` with `chat_id` and `photo` (URL)
- **Send document**: `POST /bot<TOKEN>/sendDocument` with `chat_id` and `document` (URL)
