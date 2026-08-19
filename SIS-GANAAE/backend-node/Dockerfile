# Dockerfile de desarrollo (docker-compose.yml)
FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
