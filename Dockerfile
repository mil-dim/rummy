FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
ENV NODE_ENV=production
ENV PORT=8080
RUN mkdir -p /data/dice /data/feedback && chown -R node:node /data
USER node
EXPOSE 8080
CMD ["node", "server.js"]
