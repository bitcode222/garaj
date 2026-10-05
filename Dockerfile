# syntax=docker/dockerfile:1
# Garaj is a static export (Next.js `output: "export"`), so the runtime image is
# just nginx serving `out/`. All data lives in each visitor's browser (IndexedDB).
#
#   docker build --target test .      run `npm test` + `npm run lint` (fails the build on error)
#   docker build -t garaj-web .       production image (default target)

FROM node:22-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS test
COPY . .
RUN npm test && npm run lint

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
