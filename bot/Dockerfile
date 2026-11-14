FROM node:22-alpine
WORKDIR /app
COPY bot/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node bot/ ./bot/
COPY --chown=node:node lib/rummy.js ./lib/rummy.js
ENV NODE_ENV=production
USER node
CMD ["node", "bot/index.js"]
