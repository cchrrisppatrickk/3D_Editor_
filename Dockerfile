FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
# We use a wild card to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Expose port
EXPOSE 3000

# Run in development mode
CMD ["npm", "run", "dev"]
