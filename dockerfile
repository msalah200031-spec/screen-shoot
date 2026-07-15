# Use the official Puppeteer image with Chrome pre-installed
FROM ghcr.io/puppeteer/puppeteer:21.0.0

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY index.js .

# Create temp directory for screenshots
RUN mkdir -p /tmp/screenshots

# Run the app
CMD ["node", "index.js"]
