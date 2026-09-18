FROM python:3.12-slim

WORKDIR /app

# Instalar dependências básicas
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar código do sistema
COPY . /app

# Garantir estrutura de pastas para uploads
RUN mkdir -p /app/UPLOADS/CONTRACHEQUES /app/UPLOADS/FOTOS

# Variáveis de ambiente
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python", "server.py"]
