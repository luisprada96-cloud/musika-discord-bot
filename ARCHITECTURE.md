# 🏛️ Manual de Arquitectura y Guía de Continuación — MusiKa

> **Para desarrolladores y agentes IA:** Este documento describe la arquitectura completa, el flujo de datos, la topología de red, las dependencias y los procedimientos operativos estándar para continuar el desarrollo, depurar o desplegar el proyecto **MusiKa** desde cualquier máquina o entorno.

---

## 📌 1. Visión General del Sistema

**MusiKa** es un bot de música para Discord de alta disponibilidad diseñado para resolver los dos mayores problemas de los bots de música modernos en la nube:
1. **Bloqueos de YouTube en centros de datos (HTTP 403 Forbidden / Bot Detection):** Servicios como Render, AWS, GCP u Hetzner sufren bloqueos periódicos de IP por parte de Google/YouTube.
2. **Consumo de horas en tiers gratuitos:** Los proveedores cloud como Render limitan los contenedores gratuitos a 750 horas/mes (aproximadamente un mes si corre 24/7 sin margen para otros servicios).

### La Solución: Arquitectura Dual Híbrida con Cloudflare Broker
- **Nodo Maestro 24/7 (Raspberry Pi 4 B en Red Residencial):** Ejecuta el motor de audio y Discord Gateway. Al emitir tráfico desde una IP residencial española (Movistar Fibra), **YouTube jamás bloquea el streaming ni exige cookies rotativas**.
- **Nodo Respaldo Standby (Render Cloud Web Service):** Duplicado exacto del bot desplegado en Docker en Render. Permanece en reposo (*sleeping*) consumiendo **0 horas/mes**. Solo despierta si la Raspberry Pi sufre un corte de luz o pierde conectividad durante más de 45 segundos.
- **Broker y Panel Web Edge (Cloudflare Workers + D1):** Actúa como API Gateway central global (`musika.luisjourney.xyz`). Recibe los comandos slash de Discord por webhook HTTP, aloja el panel web de control de playlists sin login, y coordina qué nodo atiende cada petición.

---

## 🗺️ 2. Diagrama de Arquitectura y Flujo de Datos

```
                          ┌──────────────────────────┐
                          │    Discord Interaction   │
                          │   (Slash Commands '/')   │
                          └─────────────┬────────────┘
                                        │ HTTP POST (Ed25519 Signed)
                                        ▼
                          ┌──────────────────────────┐
                          │    Cloudflare Worker     │
                          │  musika.luisjourney.xyz  │
                          │  • Valida firma Discord  │
                          │  • Sirve Web UI 24/7     │
                          │  • REST API & Control    │
                          └─────────────┬────────────┘
                                        │
                         Transacciones SQL atómicas
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │  Cloudflare D1 Database  │
                          │       (musika-db)        │
                          │  • Tabla `commands`      │
                          │  • Tabla `kv` (estado)   │
                          └─────────────┬────────────┘
                                        │
                         Polling HTTP (cada 2 seg)
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
   🍓 RASPBERRY PI 4 B                                    ☁️ RENDER CLOUD
   (Instancia: `raspiluis`)                               (Instancia: `render`)
   • IP Residencial (Fibra Movistar)                      • Docker Container en nube
   • Ejecuta 24/7 vía `systemd`                           • En reposo automático (0h gastadas)
   • Conexión Dual: Ethernet + Wi-Fi                      • Cloudflare suprime pings a Render
   • FFmpeg + Opus a 48 kHz                                 mientras Raspberry Pi esté viva
   • Preloading inteligente de canciones                  • Asume control solo tras >45s offline
```

---

## 📁 3. Anatomía del Repositorio y Componentes

| Archivo / Carpeta | Responsabilidad |
| :--- | :--- |
| [`bot.py`](file:///D:/BotAudioDiscord/bot.py) | **Demonio principal del bot de Discord.** Escucha la pasarela de Discord (`discord.py`), ejecuta el loop de polling de comandos contra Cloudflare D1, resuelve audios mediante `yt-dlp`, precarga en segundo plano la siguiente pista, transcodifica mediante `FFmpeg` a paquetes Opus UDP y reporta su *heartbeat* cada 4 segundos. |
| [`cloudflare-worker/worker.js`](file:///D:/BotAudioDiscord/cloudflare-worker/worker.js) | **Router Edge y Backend Serverless.** Maneja la verificación criptográfica Ed25519 de Discord (`/interactions`), la API REST (`/api/state`, `/api/commands`, `/api/playlists`, `/api/bot/heartbeat`), el panel web HTML5 responsivo y la lógica de conmutación por fallo (*failover*). |
| [`cloudflare-worker/wrangler.toml`](file:///D:/BotAudioDiscord/cloudflare-worker/wrangler.toml) | Configuración de despliegue de Cloudflare Workers, enlace con la base de datos D1 `musika-db` y variables de entorno. |
| [`Dockerfile`](file:///D:/BotAudioDiscord/Dockerfile) | Definición del contenedor Linux Debian con Python 3.13 y FFmpeg utilizado para el despliegue automático en Render. |
| [`render.yaml`](file:///D:/BotAudioDiscord/render.yaml) | Blueprint declarativo de infraestructura como código para Render.com. |
| [`requirements.txt`](file:///D:/BotAudioDiscord/requirements.txt) | Dependencias Python congeladas (`discord.py`, `yt-dlp`, `PyNaCl`, `aiohttp`, `python-dotenv`). |
| [`INSTRUCCIONES_RASPY.md`](file:///D:/BotAudioDiscord/INSTRUCCIONES_RASPY.md) | Guía de flasheo y bootstrap inicial del hardware Raspberry Pi. |

---

## 🍓 4. Configuración del Nodo Maestro (Raspberry Pi)

### 4.1. Información de Hardware y Red
- **Dispositivo:** Raspberry Pi 4 Model B (4 GB RAM, Quad-Core Cortex-A72 @ 1.8GHz).
- **Sistema Operativo:** Raspberry Pi OS Lite (64-bit, Debian 12 Bookworm, Linux kernel 6.6.x aarch64).
- **Hostname:** `raspiluis`
- **Usuario:** `luis` (con `sudo` sin contraseña configurado).
- **Acceso SSH:** Clave SSH pública ed25519 de la máquina de desarrollo autorizada en `~/.ssh/authorized_keys`.
- **Interfaces de Red (Failover Automático):**
  - **Ethernet (Primaria):** `192.168.1.119` (Gigabit full-duplex)
  - **Wi-Fi 5GHz (Respaldo sin cables):** `192.168.1.78` (conectada a `MOVISTAR_PLUS_5DDB`)
  *Nota: Si se desconecta el cable de red físico, la Raspberry Pi mantiene la conectividad instantáneamente por Wi-Fi sin reiniciar el bot.*

### 4.2. Repositorio de Soporte y Diagnóstico
Existe un repositorio complementario exclusivo para el aprovisionamiento de la Raspberry Pi:
👉 **[github.com/luisprada96-cloud/raspiluis](https://github.com/luisprada96-cloud/raspiluis)**

### 4.3. Servicio Systemd (`musika.service`)
El bot corre como demonio del sistema operativo gestionado por `systemd`, lo que garantiza que si el proceso muere por cualquier motivo o si la Raspberry Pi se reinicia, el bot arranca solo inmediatamente.

- **Ruta del servicio:** `/etc/systemd/system/musika.service`
- **Comandos operativos esenciales:**
  ```bash
  # Ver estado en tiempo real
  sudo systemctl status musika

  # Ver logs continuos del bot
  journalctl -u musika -f

  # Reiniciar el bot (ej. tras actualizar código)
  sudo systemctl restart musika

  # Detener el bot
  sudo systemctl stop musika
  ```

---

## ☁️ 5. Configuración de Cloudflare Workers & D1

### 5.1. Variables y Secretos en Worker
- `BOT_PING_URL`: URL del Web Service de Render (ej. `https://musika-discord-bot.onrender.com`).
- `DISCORD_PUBLIC_KEY`: Clave pública de la aplicación en el [Discord Developer Portal](https://discord.com/developers/applications).
- `PUBLIC_URL`: `https://musika.luisjourney.xyz`

### 5.2. Tablas en Cloudflare D1 (`musika-db`)
```sql
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
```

### 5.3. Cómo Desplegar Cambios en el Worker
```powershell
cd cloudflare-worker
npx wrangler deploy
```

---

## 🔄 6. Flujo de Trabajo para Continuar el Proyecto

Si tú (o un agente IA en otra sesión/máquina) necesitas hacer cambios en el bot, sigue estos pasos según el área que modifiques:

### Escenario A: Modificar lógica del bot Python (`bot.py`)
1. Trabaja y haz commit/push en tu entorno local:
   ```bash
   git add bot.py
   git commit -m "feat: nueva funcionalidad"
   git push origin main
   ```
2. Conéctate por SSH a la Raspberry Pi y actualiza el servicio:
   ```bash
   ssh luis@192.168.1.119
   cd ~/projects/musika
   git pull
   sudo systemctl restart musika
   journalctl -u musika -n 30 --no-pager
   ```
3. *(Opcional)* Render detectará el push a `main` y compilará la nueva imagen Docker automáticamente para mantener la instancia de respaldo sincronizada.

### Escenario B: Modificar el Panel Web o API (`worker.js`)
1. Edita [`cloudflare-worker/worker.js`](file:///D:/BotAudioDiscord/cloudflare-worker/worker.js).
2. Valida la sintaxis del script antes de desplegar:
   ```bash
   node -c cloudflare-worker/worker.js
   ```
3. Despliega a producción con Wrangler:
   ```bash
   cd cloudflare-worker
   npx wrangler deploy
   ```
4. Comprueba en tu navegador en [https://musika.luisjourney.xyz](https://musika.luisjourney.xyz).

---

## 🛡️ 7. Puntos Críticos y "Gotchas" a Recordar

1. **Extracción de YouTube y formatos:**
   - En `bot.py`, `ytdl_format_options` utiliza opciones estándar con `noplaylist: True`. **No forzar** clientes como `"tv_embedded"` o `"android_vr"` salvo que sea estrictamente necesario, ya que YouTube cambia sus firmas y puede devolver `HTTP 403` a FFmpeg.
   - En la Raspberry Pi con IP residencial, la tasa de éxito de streaming en YouTube es del 100%.
2. **Discord Voice y Gateway:**
   - Discord requiere transcodificación de paquetes UDP Opus a través de `PyNaCl`. Ambas bibliotecas (`libnacl` y `ffmpeg`) están instaladas de forma nativa en la Raspberry Pi.
3. **Protección de Horas de Render:**
   - En `cloudflare-worker/worker.js`, toda llamada a `/api/bot/wake` o a comandos de Discord comprueba primero `checkIsRaspiActive()`. Si la Raspberry Pi ha enviado latido en los últimos 45 segundos, **la llamada a Render se omite totalmente**, manteniendo Render 100% dormido.
4. **Permisos y Red Local:**
   - La Raspberry Pi tiene DHCP estático asignado en el router para las IPs `192.168.1.119` (ETH) y `192.168.1.78` (WLAN).

---
*Documento actualizado en Octubre de 2026. Proyecto mantenido por Luis Prada.*
