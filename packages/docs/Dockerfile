# MIT License — DARE Method © 2026 Dewtech Technologies
# ui-dare-docs — MkDocs Material build → nginx:alpine

# Stage 1: build MkDocs site
FROM squidfunk/mkdocs-material:9 AS builder

WORKDIR /docs

# Copy all docs files
COPY mkdocs.yml     .
COPY docs/          docs/
COPY stylesheets/   stylesheets/

# Build static site
RUN mkdocs build --strict

# Stage 2: serve with nginx
FROM nginx:alpine

LABEL org.opencontainers.image.title="ui-dare-docs"
LABEL org.opencontainers.image.description="DARE Method MkDocs documentation site"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/dewtech-technologies/dare-method"

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /docs/site /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost/healthz || exit 1
