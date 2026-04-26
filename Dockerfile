FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:22-alpine

LABEL org.opencontainers.image.title="Doublcov"
LABEL org.opencontainers.image.description="Static LCOV coverage report generator"
LABEL org.opencontainers.image.source="https://github.com/doublesharp/doublcov"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /work
COPY --from=build /app/packages/cli/dist /opt/doublcov/dist
COPY --from=build /app/packages/cli/package.json /opt/doublcov/package.json

RUN printf '#!/bin/sh\nexec node /opt/doublcov/dist/index.js "$@"\n' > /usr/local/bin/doublcov \
  && chmod +x /usr/local/bin/doublcov

ENTRYPOINT ["doublcov"]
CMD ["--help"]
