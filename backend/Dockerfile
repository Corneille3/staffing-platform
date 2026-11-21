FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app
RUN chmod +x /app/docker-entrypoint.sh
# The commit this image was built from — Sentry's release. The deploy script
# passes it (--build-arg GIT_SHA=…); "unknown" until it does. Declared late so
# a new commit does not invalidate the dependency layer above.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
