# Use Node.js 20 as the base image
FROM node:20-slim

# Install LibreOffice, Chromium, and all required system dependencies
RUN apt-get update && apt-get install -y \
    libreoffice \
    chromium \
    fontconfig \
    fonts-liberation \
    fonts-noto-core \
    poppler-utils \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && fc-cache -f \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip downloading its own Chromium (we use the system one)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install application dependencies
RUN npm i

# Copy the rest of your application's source code
COPY . .

# Build the application
RUN npm run build

# Expose the port that your application will run on
EXPOSE 5600

# Start the application
CMD [ "node", "build/index.js" ]
