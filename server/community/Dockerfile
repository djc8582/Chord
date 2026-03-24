FROM node:20-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/schema.sql ./
ENV NODE_ENV=production
ENV PORT=3847
EXPOSE 3847
CMD ["node", "dist/index.js"]
