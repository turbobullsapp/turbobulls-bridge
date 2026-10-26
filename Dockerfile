# Build
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Run: no dependencies at runtime, so only the compiled code ships.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_PORT=47821
COPY --from=build /app/dist ./dist
COPY package.json LICENSE ./
USER node
EXPOSE 47821
# Publish the port to this computer only: docker run -p 127.0.0.1:47821:47821 ...
ENTRYPOINT ["node", "dist/cli.js"]
