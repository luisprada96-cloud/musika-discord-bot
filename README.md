# 🎵 MusiKa — Bot de Audio de Discord + Panel Web 24/7

Bot de música personal para Discord en Python (`discord.py` + `yt-dlp` + `FFmpeg`) conectado en tiempo real con un Panel Web 24/7 alojado en Cloudflare Workers + KV (**[https://musika.luisjourney.xyz](https://musika.luisjourney.xyz)**).

## ✨ Características

- **Música ilimitada por nombre o URL:** Reproduce canciones individuales de YouTube o SoundCloud (con fallback automático a SoundCloud en servidores cloud).
- **Gestor de Playlists Web 24/7 sin login (`https://musika.luisjourney.xyz`):**
  - Alojado 100% en **Cloudflare Workers + Cloudflare KV** (`cloudflare-worker/`).
  - Cualquiera con el enlace puede crear listas, buscar y añadir canciones, borrar canciones o lanzar una lista directamente al canal de voz de Discord.
- **Soporte para Playlists públicas de YouTube (`/ytplaylist`):**
  - Carga listas enteras de YouTube en menos de 1 segundo (`extract_flat`) con opción de modo aleatorio (`Shuffle`) y opción de guardarlas en la web.

## 🎮 Comandos de Discord (`/`)

| Comando | Descripción |
| :--- | :--- |
| `/play <busqueda>` | Busca una canción por nombre o enlace y la reproduce o añade a la cola. |
| `/playlist <nombre> [aleatorio]` | Reproduce cualquiera de las listas creadas en `musika.luisjourney.xyz` (con autocompletado en vivo). |
| `/ytplaylist <url> [aleatorio] [guardar_en_web]` | Reproduce una playlist pública de YouTube por su URL y opcionalmente la importa a la web. |
| `/web` | Envía el enlace directo a `https://musika.luisjourney.xyz` para fijarlo (pinearlo) en el canal. |
| `/pause` / `/resume` | Pausa o reanuda la canción actual. |
| `/skip` | Salta a la siguiente canción de la cola. |
| `/queue` | Muestra la canción actual y las próximas en espera. |
| `/stop` | Vacía la cola y desconecta al bot del canal de voz. |

## ☁️ Despliegue 24/7 en la Nube (Gratis)

1. **Web + Base de datos (Cloudflare Workers + KV):**
   ```bash
   cd cloudflare-worker
   npx wrangler deploy
   ```
2. **Bot de Voz (Docker en Render.com / Koyeb):**
   - Conecta este repositorio de GitHub en **Render.com** (New -> Web Service -> Free) o **Koyeb**.
   - Añade la variable de entorno `DISCORD_TOKEN` con el token de tu bot.
   - Copia la URL pública que te dé Render/Koyeb y ponla como variable `BOT_PING_URL` en tu Cloudflare Worker para que el Cron cada 10 minutos mantenga el contenedor despierto 24/7.
