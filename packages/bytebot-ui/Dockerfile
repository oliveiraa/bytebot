# Base image
FROM node:20-alpine

# Declare build arguments
ARG BYTEBOT_AGENT_BASE_URL
ARG BYTEBOT_DESKTOP_VNC_URL

# Set environment variables for the build process
ENV BYTEBOT_AGENT_BASE_URL=${BYTEBOT_AGENT_BASE_URL}
ENV BYTEBOT_DESKTOP_VNC_URL=${BYTEBOT_DESKTOP_VNC_URL}

# Update npm to latest version
RUN npm install -g npm@latest

# Create app directory
WORKDIR /app

# Copy app source
COPY ./shared ./shared
COPY ./bytebot-ui/ ./bytebot-ui

WORKDIR /app/bytebot-ui

# Configure npm for better reliability
RUN npm config set fetch-timeout 60000 && \
    npm config set fetch-retries 3 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000

# Install dependencies
RUN npm install

RUN npm run build

# Run the application
CMD ["npm", "run", "start"] 


