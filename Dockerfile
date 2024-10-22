# Use Node.js 20 as the base image
FROM node:20

# Install LibreOffice for document conversion
RUN apt-get update && apt-get install -y libreoffice && \
    apt-get clean

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./


# Copy the rest of your application's source code
COPY . .

# Expose the port that your application will run on
EXPOSE 5600

# Explicitly install docxtemplater (in case it's not in package.json)
RUN npm install docxtemplater

# Start the application
CMD [ "node", "build/index.js" ]