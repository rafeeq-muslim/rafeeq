# Rafeeq web (PWA). Build context: repository root.
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG VITE_VAPID_PUBLIC_KEY=""
ARG VITE_BUILD_ID="dev"
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY VITE_BUILD_ID=$VITE_BUILD_ID
RUN npm run build:app

FROM nginx:1.29-alpine
COPY infra/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/web.security-headers.inc /etc/nginx/snippets/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
