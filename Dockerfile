FROM node:22-alpine AS web-builder
WORKDIR /build/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 STATIC_DIR=/app/static
WORKDIR /app
RUN useradd --create-home --uid 10001 ocultakey && mkdir -p /data/backups /app/static && chown -R ocultakey:ocultakey /data /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/ /app/backend/
COPY docker/start.sh /app/start.sh
COPY --from=web-builder /build/frontend/dist/ /app/static/
RUN chmod +x /app/start.sh && chown -R ocultakey:ocultakey /app /data
USER ocultakey
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3).read()" || exit 1
CMD ["/app/start.sh"]
