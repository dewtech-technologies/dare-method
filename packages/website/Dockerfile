# MIT License — DARE Method © 2026 Dewtech Technologies
# ui-dare-landing — static site served by nginx:alpine

FROM nginx:alpine

LABEL org.opencontainers.image.title="ui-dare-landing"
LABEL org.opencontainers.image.description="DARE Method marketing landing page"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/dewtech-technologies/dare-method"

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy site files
COPY index.html     /usr/share/nginx/html/
COPY consulting.html /usr/share/nginx/html/
COPY assets/        /usr/share/nginx/html/assets/
COPY content/       /usr/share/nginx/html/content/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/healthz || exit 1
