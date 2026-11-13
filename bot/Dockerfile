FROM node:22-alpine
WORKDIR /bot
COPY bot/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node bot/ ./
ENV NODE_ENV=production
USER node
CMD ["node", "index.js"]
