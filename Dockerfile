# Image générique (Railway, Fly.io, VPS…). Montez un volume sur /data.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV DATA_DIR=/data PORT=3001
EXPOSE 3001
CMD ["npm", "start"]
