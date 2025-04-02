FROM node:22-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

RUN npm ci --only=production

# Copy app source
COPY . .

# Set production environment
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD [ "node", "src/app.js" ]