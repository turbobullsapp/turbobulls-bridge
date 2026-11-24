# The image holds the npm package exactly as the release's build job made it: nothing is installed
# or compiled here, and the Connector app has no dependencies at runtime. To build it yourself,
# make the package first (`pnpm build && npm pack`), then run `docker build .` next to it.
# The base image is pinned by digest; Dependabot proposes updates.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
# ADD unpacks the package into /app/package.
ADD turbobulls-bridge-*.tgz /app/
WORKDIR /app/package
ENV NODE_ENV=production \
    TURBOBULLS_BRIDGE_HOST=0.0.0.0 \
    TURBOBULLS_BRIDGE_PORT=47821
USER node
# Publish the port to this computer only, never to every interface:
#   docker run -p 127.0.0.1:47821:47821 --env-file <file> ghcr.io/turbobullsapp/turbobulls-bridge
ENTRYPOINT ["node", "dist/cli.js"]
