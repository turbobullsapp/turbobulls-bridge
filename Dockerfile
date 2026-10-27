# Build. The base image is pinned by digest; Dependabot proposes updates.
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Run: no dependencies at runtime, so only the compiled code ships.
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
WORKDIR /app
ENV NODE_ENV=production \
    TURBOBULLS_BRIDGE_HOST=0.0.0.0 \
    TURBOBULLS_BRIDGE_PORT=47821
COPY --from=build /app/dist ./dist
COPY package.json LICENSE ./
USER node
# Publish the port to this computer only, never to every interface:
#   docker run -p 127.0.0.1:47821:47821 --env-file <file> ghcr.io/turbobullsapp/turbobulls-bridge
ENTRYPOINT ["node", "dist/cli.js"]
