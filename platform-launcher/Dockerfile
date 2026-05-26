FROM nginx:alpine

RUN apk add --no-cache gettext

COPY index.html       /usr/share/nginx/html/index.html
COPY styles.css       /usr/share/nginx/html/styles.css
COPY launcher.js      /usr/share/nginx/html/launcher.js
COPY nginx.conf       /etc/nginx/conf.d/default.conf
COPY entrypoint.sh    /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
