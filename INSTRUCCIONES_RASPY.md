# 🚀 Instrucciones para Asistente AI en el Portátil

> **Repositorio de referencia con todos los scripts:** [github.com/luisprada96-cloud/raspiluis](https://github.com/luisprada96-cloud/raspiluis)

---

### Contexto para la IA del Portátil:
Estás asistiendo a Luis en su portátil. La tarjeta microSD de su Raspberry Pi está conectada a este portátil y **aún NO ha sido grabada ni formateada**.
El objetivo es guiarlo paso a paso para quemar el sistema operativo en modo **Headless** (sin monitor/teclado), arrancar la Raspberry Pi, conectarse por SSH y dejar el entorno listo.

---

## 📋 Fase 1: Descargar y Quemar la Tarjeta (Headless)

1. **Herramienta**: Asegurarse de tener instalado [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. **Selección en Raspberry Pi Imager**:
   - **Dispositivo**: El modelo de la Raspberry Pi de Luis (Raspberry Pi 3, 4 o 5).
   - **Sistema Operativo**: Seleccionar `Raspberry Pi OS (other)` ➔ **`Raspberry Pi OS Lite (64-bit)`** *(importante que sea la versión Lite sin entorno de escritorio)*.
   - **Almacenamiento**: La tarjeta microSD conectada.
3. **Personalización del SO (El paso crítico)**:
   - Al pulsar **Siguiente**, entrar en **EDITAR AJUSTES** (icono de engranaje ⚙️):
     - **Hostname**: `raspiluis`
     - **Usuario**: `luis`
     - **Contraseña**: La que Luis elija.
     - **Servicios**: Marcar **`Activar SSH`** y seleccionar **`Usar autenticación por contraseña`**.
     - **Wi-Fi** *(opcional)*: Si Luis la va a conectar por Wi-Fi, poner el nombre de la red y contraseña. Si va por cable de red directo al router, se puede dejar desmarcado.
4. **Grabar**: Confirmar y pulsar **Escribir / Grabar**. Esperar a que finalice la verificación.

---

## 🔌 Fase 2: Primer Arranque de la Raspberry Pi

1. Expulsar con seguridad la microSD del portátil.
2. Insertarla en la ranura de la Raspberry Pi.
3. Conectar el cable Ethernet al router (si no se configuró Wi-Fi) y el cable de alimentación USB.
4. Esperar **90 segundos** a que complete el primer booteo y redimensión del almacenamiento.

---

## 💻 Fase 3: Conexión SSH desde la Terminal

Probar la conexión desde PowerShell o Terminal del portátil:

```bash
ssh luis@raspiluis.local
```
*(Si no resuelve por nombre, escanear la red local del router o usar `arp -a` / `ping raspiluis.local` para obtener su IP, ej. `192.168.1.XX`)*.

---

## ⚡ Fase 4: Instalación Automática (One-Line Bootstrap)

Una vez conectados dentro de la Raspberry Pi por SSH, ejecutar:

```bash
curl -sSL https://raw.githubusercontent.com/luisprada96-cloud/raspiluis/main/bootstrap.sh | bash
```

Este script se encarga de instalar:
- Python 3, `pip`, `venv`, `ffmpeg` y `uv`
- Docker Engine y Docker Compose (con usuario añadido al grupo docker)
- Node.js LTS
- Firewall UFW (puerto 22) y Fail2ban
- Herramientas esenciales (`git`, `htop`, `tmux`, etc.)
- Estructura de carpetas en `~/projects`

---

## 🎵 Fase 5: Desplegar el Bot de Discord (MusiKa)

1. **Clonar el bot**:
   ```bash
   cd ~/projects
   git clone https://github.com/luisprada96-cloud/musika-discord-bot.git musika
   cd musika
   ```

2. **Crear entorno virtual e instalar dependencias**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Configurar el archivo `.env`**:
   ```bash
   nano .env
   ```
   Añadir:
   ```env
   DISCORD_TOKEN=tu_token_de_discord
   CLOUDFLARE_WORKER_URL=https://musika.luisjourney.xyz
   WORKER_AUTH_KEY=tu_worker_auth_key
   BOT_INSTANCE_NAME=raspiluis
   PORT=8080
   ```

4. **Activar como servicio 24/7 (systemd)**:
   ```bash
   sudo cp ~/projects/raspiluis/services/musika.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable musika
   sudo systemctl start musika
   sudo systemctl status musika
   ```

---

## 🏁 Fin de la Fase Portátil
Una vez que el servicio `musika` esté corriendo y la Raspberry esté accesible en la red local, Luis continuará el control y pruebas desde su PC de escritorio principal.
