#!/bin/bash

# Install Node dependencies
npm install

# Install yt-dlp binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Install ffmpeg
apt-get update
apt-get install -y ffmpeg

# Verify installation
yt-dlp --version || echo "yt-dlp not found, but continuing..."

echo "✅ Build completed"