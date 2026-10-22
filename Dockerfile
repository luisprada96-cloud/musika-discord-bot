FROM python:3.12-slim

# Instalar FFmpeg nativo en el contenedor Linux para transmitir audio a Discord
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libopus0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUTF8=1
ENV WEB_PORT=8080
EXPOSE 8080

CMD ["python", "-u", "bot.py"]
