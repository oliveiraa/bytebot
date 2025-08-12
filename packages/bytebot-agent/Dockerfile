# Base image
FROM node:20-alpine

# Update npm to latest version
RUN npm install -g npm@latest

# Create app directory
WORKDIR /app

# Copy app source
COPY ./shared ./shared
COPY ./bytebot-agent/ ./bytebot-agent/

WORKDIR /app/bytebot-agent

# Configure npm for better reliability
RUN npm config set fetch-timeout 60000 && \
    npm config set fetch-retries 3 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000

# Install dependencies
RUN npm install

RUN npm run build

# Run the application
CMD ["npm", "run", "start:prod"] 


