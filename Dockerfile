FROM node:22-alpine
RUN apk add --no-cache nginx

COPY dist/ /usr/share/nginx/html/
COPY default.conf /etc/nginx/http.d/default.conf
COPY server/ /app/server/
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
CMD ["/docker-entrypoint.sh"]
