FROM node:24-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production DB_FILE=/data/votacao.db
EXPOSE 3000
CMD ["node","src/server.js"]
