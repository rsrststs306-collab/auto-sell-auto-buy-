# Dynamic Embeds System

This folder contains JSON files that define Discord embeds for the bot. You can add, modify, or remove embed files here without touching the bot code.

## How to Add New Embeds

1. Create a new `.json` file in this folder
2. Use the format shown in the examples below
3. The bot will automatically load it on restart

## File Format

Each JSON file should contain an object with embed definitions:

```json
{
  "embedName": {
    "title": "Embed Title",
    "description": "Embed description with {variable} support",
    "color": "#5865F2",
    "fields": [
      {
        "name": "Field Name",
        "value": "Field value with {variable}",
        "inline": true
      }
    ],
    "footer": {
      "text": "Footer text"
    },
    "thumbnail": {
      "url": "https://example.com/image.png"
    },
    "image": {
      "url": "https://example.com/banner.png"
    }
  }
}
```

## Variable Support

You can use variables in your embeds that will be replaced when the embed is used:

- `{user}` - User mention
- `{username}` - Username
- `{server}` - Server name
- `{channel}` - Channel name
- `{item}` - Item name
- `{price}` - Item price
- `{amount}` - Credit amount
- `{command}` - ProBot command
- `{shop}` - Shop mention
- `{order}` - Order ID

## Examples

See the example files in this folder for reference.

## Usage in Code

The bot automatically loads all embeds from this folder. Use them like:

```javascript
const embed = getEmbed('embedName', { user: '@username', price: '500' });
```