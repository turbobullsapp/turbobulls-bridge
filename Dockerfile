# The image holds the npm package exactly as the release's build job made it: nothing is installed
# or compiled here, and the Connector app has no dependencies at runtime. To build it yourself,
# make the package first (`pnpm build && npm pack`), then run `docker build .` next to it.
# The base image is pinned by digest; Dependabot proposes updates.
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
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
