# 🎵 MusiKa — Bot de Audio de Discord con Arquitectura Dual y Panel Web

Bot de música para Discord de alta disponibilidad desarrollado en Python (`discord.py` + `yt-dlp` + `FFmpeg`) con **Arquitectura Dual (Raspberry Pi Maestro + Render Respaldo)** y **Panel Web Interactivo 24/7** alojado en Cloudflare Workers + Cloudflare D1 ([musika.luisjourney.xyz](https://musika.luisjourney.xyz)).

---

## 🏛️ Arquitectura del Sistema

```
                      ┌──────────────────────────┐
                      │    Discord Interaction   │
                      │       Endpoint URL       │
                      └─────────────┬────────────┘
                                    │ HTTP Slash Commands
                                    ▼
                      ┌──────────────────────────┐
                      │    Cloudflare Worker     │
                      │ musika.luisjourney.xyz   │
                      └─────────────┬────────────┘
                                    │
                         Transacciones SQL (D1)
                                    │
                                    ▼
                      ┌──────────────────────────┐
                      │      Cloudflare D1       │
                      │       (musika-db)        │
                      │  • commands queue        │
                      │  • kv state cache        │
                      └─────────────┬────────────┘
                                    │
                     Polling & Heartbeat (cada 2s)
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
   🍓 RASPBERRY PI 4 B                             ☁️ RENDER CLOUD
       (INSTANCIA MAESTRA)                             (RESPALDO STANDBY)
  • Conexión IP Residencial                     • En reposo automático (0h gastadas)
  • 0 Bloqueos de YouTube                       • Toma el control solo si la Pi
  • 24/7 con servicio systemd                     lleva >45s inactiva
  • Precarga de audio en background             • Fallback secundario a SoundCloud
```

---

## ✨ Características Principales

- **Arquitectura Dual Inteligente**:
  - **Instancia Primaria (Raspberry Pi)**: Ejecuta el bot 24/7 desde tu red local residencial. Al no usar IPs de centros de datos, **YouTube nunca bloquea el streaming (403 Forbidden / bot detection)**.
  - **Instancia de Respaldo (Render)**: Permanece desplegada en la nube en reposo absoluto. Si la Raspberry Pi se apaga o se corta la luz (> 45 segundos sin latido), Render asume el control automáticamente.
  - **Blindaje de Horas Gratis**: Mientras la Raspberry Pi está activa, Cloudflare Worker **bloquea cualquier petición HTTP hacia Render**, garantizando que Render permanezca dormido consumiendo **0 horas** del plan gratuito.
- **Reproducción Sin Silencios (Preloading en Background)**:
  - Cuando una canción empieza a sonar, el bot resuelve la siguiente pista de la cola en segundo plano (`trigger_preload`) para que la transición entre canciones sea instantánea.
- **Cola de Comandos Robusta con Cloudflare D1**:
  - Migrado de Cloudflare KV a **Cloudflare D1 (SQLite distribuido)**, eliminando las restricciones de cuota de escritura y soportando colas atómicas de órdenes de Discord y la web.
- **Panel Web Interactivo ([musika.luisjourney.xyz](https://musika.luisjourney.xyz))**:
  - Control en tiempo real (Play, Pausa, Skip, Stop).
  - Gestor de playlists en la nube con buscador autocompletado y un botón para reproducir listas enteras en el canal de voz.
  - Indicador de estado del bot en Discord.

---

## 🎮 Comandos de Discord (`/`)

| Comando | Descripción |
| :--- | :--- |
| `/play <busqueda>` | Busca por nombre o enlace (YouTube / SoundCloud) y lo reproduce o añade a la cola. |
| `/playlist <nombre> [aleatorio]` | Reproduce cualquiera de las listas guardadas en la web (con autocompletado y modo aleatorio). |
| `/ytplaylist <url> [aleatorio] [guardar]` | Carga una lista de reproducción pública u oculta de YouTube en 1 segundo y opcionalmente la guarda en la web. |
| `/pause` / `/resume` | Pausa o reanuda la pista actual. |
| `/skip` | Pasa inmediatamente a la siguiente pista de la cola. |
| `/queue` | Muestra la pista en reproducción y las próximas canciones en espera. |
| `/stop` | Detiene el audio, vacía la cola y desconecta al bot del canal de voz. |
| `/web` | Muestra el hipervínculo directo al panel web [musika.luisjourney.xyz](https://musika.luisjourney.xyz). |
| `/info` | Muestra la guía interactiva completa con todos los comandos y enlaces. |

---

## 🍓 Despliegue en Raspberry Pi (Instancia Maestra)

Para desplegar el bot en una Raspberry Pi (Raspberry Pi OS Lite 64-bit recomendado):

```bash
# 1. Clonar el repositorio
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/luisprada96-cloud/musika-discord-bot.git musika
cd musika

# 2. Crear entorno virtual e instalar dependencias
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Configurar variables de entorno (.env)
cat << 'EOF' > .env
DISCORD_TOKEN=tu_token_de_discord
PUBLIC_WEB_URL=https://musika.luisjourney.xyz
WEB_PORT=8080
BOT_INSTANCE_NAME=raspiluis
EOF
chmod 600 .env

# 4. Instalar y arrancar el servicio systemd 24/7
sudo bash -c 'cat << "EOF" > /etc/systemd/system/musika.service
[Unit]
Description=MusiKa Discord Audio Bot (Residential Instance)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=luis
WorkingDirectory=/home/luis/projects/musika
ExecStart=/home/luis/projects/musika/venv/bin/python bot.py
Restart=always
RestartSec=5
KillMode=process
TimeoutStopSec=10
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/home/luis/projects/musika/.env

LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable musika
sudo systemctl start musika

# Ver logs en vivo
journalctl -u musika -f
```

---

## ☁️ Despliegue de Cloudflare Worker (Web & D1 Database)

```bash
cd cloudflare-worker

# Crear base de datos D1 (si es la primera vez)
npx wrangler d1 create musika-db

# Ejecutar esquema de tablas
npx wrangler d1 execute musika-db --remote --command="
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
"

# Desplegar Worker
npx wrangler deploy
```

---

## ☁️ Despliegue en Render (Instancia Respaldo)

1. Conecta este repositorio en **Render.com** (tipo *Web Service* usando el `Dockerfile` incluido).
2. Configura las variables de entorno en Render:
   - `DISCORD_TOKEN`: Tu token de bot de Discord.
   - `PUBLIC_WEB_URL`: `https://musika.luisjourney.xyz`
   - `BOT_INSTANCE_NAME`: `render`
3. Copia la URL de Render (ej. `https://musika-discord-bot.onrender.com`) y añádela como secreto `BOT_PING_URL` en Cloudflare Worker.

---

## 🛠️ Tecnologías

- **Python 3.13** (`discord.py`, `yt-dlp`, `PyNaCl`, `aiohttp`, `python-dotenv`)
- **FFmpeg 7.x** (Transcodificación de audio PCM a 48kHz estéreo)
- **Cloudflare Workers** (Edge Serverless en JavaScript)
- **Cloudflare D1** (Base de datos SQLite distribuida globalmente)
- **Linux systemd** (Demonio 24/7 con recuperación automática de caídas)

---
Desarrollado con ❤️ para el servidor de Discord de Luis.
