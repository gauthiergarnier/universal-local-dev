# Official PostgreSQL base + official PGDG PostGIS packages, native on arm64/amd64.
FROM postgres:16-bookworm
RUN apt-get update \
    && apt-get install --no-install-recommends -y postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
    && rm -rf /var/lib/apt/lists/*
