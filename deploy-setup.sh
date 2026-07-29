#!/bin/bash
# Discord Bot VPS Setup Script
# Run this on your VPS after uploading your bot files

echo "🤖 Setting up Discord Bot for 24/7 operation..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create logs directory
mkdir -p logs

# Install bot dependencies
npm install

# Set up environment variables
echo "📝 Please create your .env file with your bot token and settings"
echo "Example .env file:"
echo "DISCORD_TOKEN=your_bot_token_here"
echo "SHOP_USER_ID=your_user_id_here"
echo "ECONOMY_BOT_ID=567703512763334685"

# Make PM2 start on boot
pm2 startup
echo "⚠️  Run the command shown above to enable PM2 auto-start"

echo "🚀 Setup complete! To start your bot:"
echo "1. Create/update your .env file"
echo "2. Run: pm2 start ecosystem.config.js"
echo "3. Run: pm2 save"
echo "4. Your bot will now run 24/7!"