# Stage 1: Build
# Builds the React frontend and generates seed.json from fragments/
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN node cassandra/buildSeed.js

# Stage 2: Runtime
# Lean production image — no dev tooling, no fragments, no draft files
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY cassandra/ ./cassandra/
COPY thread/ ./thread/
COPY misc-resources/manuscript-text.txt ./misc-resources/manuscript-text.txt
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/cassandra/seed.json ./cassandra/seed.json
EXPOSE 8080
CMD ["node", "cassandra/server.js"]
