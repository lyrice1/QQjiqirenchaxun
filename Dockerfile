FROM node:22-alpine AS backend-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --production

FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY default.conf /etc/nginx/conf.d/default.conf

RUN apk add --no-cache nodejs
COPY --from=backend-deps /app/server/node_modules /app/server/node_modules
COPY server/index.js /app/server/index.js
COPY server/db.js /app/server/db.js

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
CMD ["/docker-entrypoint.sh"]
