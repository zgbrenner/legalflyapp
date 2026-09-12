FROM python:3.12-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md LICENSE ./
COPY research ./research
COPY apps/api ./apps/api
COPY data/demo ./data/demo
COPY models ./models
COPY results ./results

RUN pip install --no-cache-dir -e ".[dev]"

ENV LEGALFLY_DEMO_MODE=true
ENV LEGALFLY_ENCODER=hashing
ENV PYTHONPATH=/app

EXPOSE 8000
CMD ["uvicorn", "apps.api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]