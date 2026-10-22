import asyncio
from collections import deque
from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import random
import shutil
from typing import Optional

from urllib.parse import parse_qs, quote, urlparse

import aiohttp
from aiohttp import web
import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv
import imageio_ffmpeg
import yt_dlp

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
WEB_PORT = int(os.getenv("WEB_PORT", "8080"))
PUBLIC_WEB_URL = os.getenv("PUBLIC_WEB_URL", "https://musika.luisjourney.xyz")

BASE_DIR = Path(__file__).parent
PLAYLISTS_FILE = BASE_DIR / "playlists.json"
WEB_INDEX_FILE = BASE_DIR / "web" / "index.html"

# Detecta FFmpeg en el sistema o usa el binario incluido automáticamente en imageio-ffmpeg
FFMPEG_EXECUTABLE = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()

FFMPEG_OPTIONS = {
    "before_options": (
        "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -nostdin"
    ),
    "options": "-vn",
}

import re
import urllib.request
from urllib.parse import parse_qs, urlparse

YTDL_OPTIONS = {
    "format": "bestaudio/best",
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
    "extractor_args": {
        "youtube": {
            "player_client": ["tv_embedded", "ios", "mweb", "android_vr"]
        }
    },
}

YTDL_PLAYLIST_OPTIONS = {
    "extract_flat": "in_playlist",
    "quiet": True,
    "no_warnings": True,
    "source_address": "0.0.0.0",
}

ytdl = yt_dlp.YoutubeDL(YTDL_OPTIONS)
ytdl_playlist = yt_dlp.YoutubeDL(YTDL_PLAYLIST_OPTIONS)


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "En vivo / Desconocido"
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


@dataclass
class Track:
    title: str
    webpage_url: str
    duration: Optional[int]
    thumbnail: Optional[str]
    requested_by: str
    stream_url: Optional[str] = None

    @property
    def duration_str(self) -> str:
        return format_duration(self.duration)

    def to_saved_dict(self) -> dict:
        return {
            "title": self.title,
            "webpage_url": self.webpage_url,
            "duration": self.duration,
            "duration_str": self.duration_str,
            "thumbnail": self.thumbnail,
        }


class PlaylistStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.playlists: dict[str, list[dict]] = {}
        self.load()

    def load(self) -> None:
        if self.path.exists():
            try:
                self.playlists = json.loads(
                    self.path.read_text(encoding="utf-8")
                )
            except Exception as exc:
                print(f"Error leyendo playlists.json: {exc}")
                self.playlists = {}
        else:
            self.playlists = {}

    def save(self) -> None:
        self.path.write_text(
            json.dumps(self.playlists, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


playlist_store = PlaylistStore(PLAYLISTS_FILE)


class GuildMusicState:
    def __init__(self) -> None:
        self.queue: deque[Track] = deque()
        self.current: Optional[Track] = None
        self.text_channel: Optional[discord.abc.Messageable] = None


def clean_song_title(raw_title: str) -> str:
    """Limpia etiquetas de vídeo como (Official Video), [4K], (Lyrics), etc. para búsquedas precisas."""
    cleaned = re.sub(
        r"[\(\[].*?(official|oficial|video|vídeo|audio|remaster|4k|hd|lyric|letra|visualizer|live|clip).*?[\)\]]",
        "",
        raw_title,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", cleaned).strip(" -|") or raw_title


def fetch_youtube_metadata(query: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Obtiene (title, webpage_url, thumbnail) de YouTube sin bloqueo de IP usando noembed o youtubei/v1/search."""
    if query.startswith(("http://", "https://")):
        try:
            req = urllib.request.Request(
                f"https://noembed.com/embed?url={quote(query, safe='')}",
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("title"):
                    author = data.get("author_name") or ""
                    title = data["title"]
                    if (
                        author
                        and author.lower() not in title.lower()
                        and " - " not in title
                    ):
                        title = f"{author} - {title}"
                    return title, query, data.get("thumbnail_url")
        except Exception:
            pass
        return None, query, None

    try:
        payload = json.dumps(
            {
                "context": {
                    "client": {
                        "clientName": "WEB",
                        "clientVersion": "2.20241010.01.00",
                        "hl": "es",
                        "gl": "ES",
                    }
                },
                "query": query,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        contents = (
            data.get("contents", {})
            .get("twoColumnSearchResultsRenderer", {})
            .get("primaryContents", {})
            .get("sectionListRenderer", {})
            .get("contents", [])
        )
        for section in contents:
            for item in section.get("itemSectionRenderer", {}).get(
                "contents", []
            ):
                v = item.get("videoRenderer")
                if v and v.get("videoId"):
                    vid = v["videoId"]
                    runs = v.get("title", {}).get("runs", [])
                    title = "".join(r.get("text", "") for r in runs) or query
                    return (
                        title,
                        f"https://www.youtube.com/watch?v={vid}",
                        f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                    )
    except Exception:
        pass
    return None, None, None


def extract_track(
    query: str, requested_by: str, fallback_title: Optional[str] = None
) -> Track:
    """Extrae el audio priorizando YouTube y evitando previews de 30s si la IP cloud está limitada."""
    yt_title, yt_url, yt_thumb = fetch_youtube_metadata(query)
    effective_title = fallback_title or yt_title or query
    search_query = (
        yt_url
        if yt_url and yt_url.startswith(("http://", "https://"))
        else (
            query
            if query.startswith(("http://", "https://"))
            else f"ytsearch1:{query}"
        )
    )

    info = None
    try:
        res = ytdl.extract_info(search_query, download=False)
        if "entries" in res:
            entries = [e for e in res["entries"] if e]
            if entries:
                info = entries[0]
        else:
            info = res
    except Exception:
        info = None

    # Si YouTube bloquea la IP de Render o devuelve un preview corto, buscamos el audio completo (>45s)
    if not info or not info.get("url"):
        sc_term = clean_song_title(effective_title)
        res = ytdl.extract_info(f"scsearch8:{sc_term}", download=False)
        entries = [e for e in (res.get("entries") or []) if e and e.get("url")]
        # Filtrar previews de 30 segundos de SoundCloud Go+ (elegir pista completa > 45s)
        full_entries = [
            e for e in entries if (e.get("duration") or 0) > 45
        ]
        chosen = (
            full_entries[0]
            if full_entries
            else (entries[0] if entries else None)
        )
        if not chosen:
            raise ValueError(
                f"No se encontraron resultados reproducibles para: {effective_title}"
            )
        info = chosen

    return Track(
        title=yt_title or fallback_title or info.get("title", "Canción"),
        webpage_url=yt_url
        or info.get("webpage_url")
        or info.get("original_url")
        or query,
        duration=info.get("duration"),
        thumbnail=yt_thumb or info.get("thumbnail"),
        requested_by=requested_by,
        stream_url=info.get("url"),
    )


def normalize_youtube_playlist_url(url: str) -> str:
    """Si recibe un link con watch?v=...&list=..., lo convierte en link directo de playlist."""
    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        if "list" in qs and qs["list"]:
            return f"https://www.youtube.com/playlist?list={qs['list'][0]}"
    except Exception:
        pass
    return url


def extract_youtube_playlist(
    url_or_query: str, requested_by: str
) -> tuple[str, list[Track]]:
    """Extrae rápidamente todas las canciones de una playlist pública de YouTube/SoundCloud."""
    target = normalize_youtube_playlist_url(url_or_query.strip())
    info = ytdl_playlist.extract_info(target, download=False)

    if not info or "entries" not in info:
        raise ValueError(
            "El enlace no parece ser una playlist válida o es privada."
        )

    playlist_title = info.get("title") or "Playlist de YouTube"
    tracks: list[Track] = []

    for entry in info["entries"]:
        if not entry:
            continue
        video_id = entry.get("id")
        entry_url = entry.get("url") or entry.get("webpage_url")
        if entry_url and not entry_url.startswith(("http://", "https://")):
            entry_url = f"https://www.youtube.com/watch?v={video_id or entry_url}"
        elif not entry_url and video_id:
            entry_url = f"https://www.youtube.com/watch?v={video_id}"

        if not entry_url:
            continue

        title = entry.get("title") or "Canción"
        if title in ("[Deleted video]", "[Private video]"):
            continue

        thumbnails = entry.get("thumbnails") or []
        thumb = (
            entry.get("thumbnail")
            or (thumbnails[-1].get("url") if thumbnails else None)
        )

        tracks.append(
            Track(
                title=title,
                webpage_url=entry_url,
                duration=entry.get("duration"),
                thumbnail=thumb,
                requested_by=requested_by,
                stream_url=None,
            )
        )

    if not tracks:
        raise ValueError("No se encontraron canciones reproducibles en esa playlist.")

    return playlist_title, tracks


class MusicBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.voice_states = True
        super().__init__(command_prefix="!", intents=intents, help_command=None)
        self.music_states: dict[int, GuildMusicState] = {}
        self.web_runner: Optional[web.AppRunner] = None

    def get_state(self, guild_id: int) -> GuildMusicState:
        if guild_id not in self.music_states:
            self.music_states[guild_id] = GuildMusicState()
        return self.music_states[guild_id]

    async def setup_hook(self) -> None:
        await self.start_web_server()
        self.loop.create_task(cloud_sync_loop())
        await self.tree.sync()
        print("Comandos Slash (/) sincronizados globalmente.")

    async def start_web_server(self) -> None:
        app = web.Application()
        app.router.add_get("/", handle_index)
        app.router.add_get("/api/state", handle_api_state)
        app.router.add_post("/api/playlists", handle_create_playlist)
        app.router.add_delete("/api/playlists/{name}", handle_delete_playlist)
        app.router.add_post(
            "/api/playlists/{name}/tracks", handle_add_track_to_playlist
        )
        app.router.add_delete(
            "/api/playlists/{name}/tracks/{index}",
            handle_remove_track_from_playlist,
        )
        app.router.add_post(
            "/api/playlists/{name}/play", handle_play_playlist_from_web
        )
        app.router.add_post("/api/player/play", handle_play_single_from_web)
        app.router.add_post("/api/player/{action}", handle_player_action)

        self.web_runner = web.AppRunner(app)
        await self.web_runner.setup()
        site = web.TCPSite(self.web_runner, "0.0.0.0", WEB_PORT)
        await site.start()
        print(f"Panel Web de Playlists activo en: http://localhost:{WEB_PORT}")

    async def on_ready(self) -> None:
        print(f"Bot conectado como {self.user} (ID: {self.user.id})")
        print(f"Usando FFmpeg en: {FFMPEG_EXECUTABLE}")
        for guild in self.guilds:
            try:
                self.tree.copy_global_to(guild=guild)
                await self.tree.sync(guild=guild)
            except Exception as exc:
                print(f"No se pudo sincronizar en {guild.name}: {exc}")


bot = MusicBot()


async def play_next_async(guild: discord.Guild) -> None:
    """Reproduce la siguiente canción de la cola resolviendo el stream si viene de una playlist."""
    state = bot.get_state(guild.id)
    voice_client = guild.voice_client

    if not voice_client or not voice_client.is_connected():
        state.current = None
        return

    if not state.queue:
        state.current = None
        return

    next_track = state.queue.popleft()

    # Si la canción viene de una playlist guardada, extraemos la URL de stream fresca al momento
    if not next_track.stream_url:
        try:
            fresh = await asyncio.to_thread(
                extract_track,
                next_track.webpage_url,
                next_track.requested_by,
                next_track.title,
            )
            next_track.stream_url = fresh.stream_url
            next_track.title = fresh.title or next_track.title
            next_track.duration = fresh.duration or next_track.duration
            next_track.thumbnail = fresh.thumbnail or next_track.thumbnail
        except Exception as exc:
            print(f"Error cargando pista de la cola ({next_track.title}): {exc}")
            await play_next_async(guild)
            return

    state.current = next_track

    source = discord.FFmpegPCMAudio(
        next_track.stream_url,
        executable=FFMPEG_EXECUTABLE,
        **FFMPEG_OPTIONS,
    )

    def after_playing(error: Optional[Exception]) -> None:
        if error:
            print(f"Error de reproducción: {error}")
        asyncio.run_coroutine_threadsafe(play_next_async(guild), bot.loop)

    voice_client.play(source, after=after_playing)

    if state.text_channel:
        embed = discord.Embed(
            title="🎶 Reproduciendo ahora",
            description=f"[{next_track.title}]({next_track.webpage_url})",
            color=discord.Color.blurple(),
        )
        embed.add_field(
            name="Duración", value=next_track.duration_str, inline=True
        )
        embed.add_field(
            name="Pedido por", value=next_track.requested_by, inline=True
        )
        if next_track.thumbnail:
            embed.set_thumbnail(url=next_track.thumbnail)
        try:
            await state.text_channel.send(embed=embed)
        except Exception:
            pass


async def find_or_connect_voice(
    preferred_guild: Optional[discord.Guild] = None,
    user_id: Optional[int] = None,
) -> tuple[Optional[discord.Guild], Optional[discord.VoiceClient], Optional[str]]:
    """Busca el canal de voz activo del bot o se une al canal del usuario o donde haya miembros."""
    guilds = [preferred_guild] if preferred_guild else list(bot.guilds)

    # 1. Si ya estamos conectados en este servidor y el cliente sigue activo, usarlo
    for guild in guilds:
        if not guild:
            continue
        if guild.voice_client and guild.voice_client.is_connected():
            return guild, guild.voice_client, None

    # 2. Si sabemos qué usuario ejecutó la orden, buscar en qué canal de voz está
    if user_id:
        for guild in guilds:
            if not guild:
                continue
            vs = guild.voice_states.get(user_id)
            if vs and vs.channel:
                try:
                    vc = await vs.channel.connect()
                    return guild, vc, None
                except discord.ClientException:
                    if guild.voice_client:
                        return guild, guild.voice_client, None
                except Exception as exc:
                    print(f"Error conectando al canal del usuario ({user_id}): {exc}")

    # 3. Fallback: buscar mediante guild.voice_states si hay algún humano en canales de voz
    for guild in guilds:
        if not guild:
            continue
        for uid, vs in guild.voice_states.items():
            if vs.channel and (not bot.user or uid != bot.user.id):
                try:
                    vc = await vs.channel.connect()
                    return guild, vc, None
                except discord.ClientException:
                    if guild.voice_client:
                        return guild, guild.voice_client, None
                except Exception:
                    pass

    # 4. Fallback clásico por vc.members
    for guild in guilds:
        if not guild:
            continue
        for vc in guild.voice_channels:
            humans = [m for m in vc.members if not m.bot]
            if humans:
                try:
                    voice_client = await vc.connect()
                    return guild, voice_client, None
                except discord.ClientException:
                    if guild.voice_client:
                        return guild, guild.voice_client, None

    return (
        None,
        None,
        "Debes estar dentro de un canal de voz en Discord para que el bot pueda unirse.",
    )


async def execute_remote_command(cmd: dict) -> None:
    """Ejecuta las acciones pulsadas en https://musika.luisjourney.xyz."""
    ctype = cmd.get("type")
    if ctype == "play_playlist":
        name = cmd.get("name")
        shuffle = bool(cmd.get("shuffle", False))
        tracks_data = list(playlist_store.playlists.get(name, []))
        if not tracks_data:
            return
        if shuffle:
            random.shuffle(tracks_data)
        guild, voice_client, err = await find_or_connect_voice()
        if err or not guild or not voice_client:
            return
        state = bot.get_state(guild.id)
        for item in tracks_data:
            state.queue.append(
                Track(
                    title=item["title"],
                    webpage_url=item["webpage_url"],
                    duration=item.get("duration"),
                    thumbnail=item.get("thumbnail"),
                    requested_by=f"Web ({name})",
                    stream_url=None,
                )
            )
        if not voice_client.is_playing() and not voice_client.is_paused():
            await play_next_async(guild)

    elif ctype == "play_single":
        query = cmd.get("query")
        if not query:
            return
        guild, voice_client, err = await find_or_connect_voice()
        if err or not guild or not voice_client:
            return
        try:
            track = await asyncio.to_thread(extract_track, query, "Web")
            state = bot.get_state(guild.id)
            state.queue.append(track)
            if not voice_client.is_playing() and not voice_client.is_paused():
                await play_next_async(guild)
        except Exception:
            pass

    elif ctype == "action":
        action = cmd.get("action")
        for guild in bot.guilds:
            vc = guild.voice_client
            if vc and vc.is_connected():
                state = bot.get_state(guild.id)
                if action == "pause_resume":
                    if vc.is_playing():
                        vc.pause()
                    elif vc.is_paused():
                        vc.resume()
                elif action == "skip":
                    if vc.is_playing() or vc.is_paused():
                        vc.stop()
                elif action == "stop":
                    state.queue.clear()
                    state.current = None
                    await vc.disconnect()

    elif ctype == "discord_slash":
        slash_cmd = cmd.get("cmd")
        opts = cmd.get("options") or {}
        guild_id = int(cmd["guild_id"]) if cmd.get("guild_id") else None
        channel_id = int(cmd["channel_id"]) if cmd.get("channel_id") else None
        user_name = cmd.get("user_name") or "Discord"
        user_id = int(cmd["user_id"]) if cmd.get("user_id") else None

        pref_guild = bot.get_guild(guild_id) if guild_id else None
        text_ch = (
            pref_guild.get_channel(channel_id)
            if (pref_guild and channel_id)
            else None
        )

        if slash_cmd in ("skip", "pause", "resume", "stop"):
            target_guilds = [pref_guild] if pref_guild else list(bot.guilds)
            for g in target_guilds:
                if not g or not g.voice_client:
                    continue
                vc = g.voice_client
                st = bot.get_state(g.id)
                if slash_cmd == "skip" and (vc.is_playing() or vc.is_paused()):
                    vc.stop()
                elif slash_cmd == "pause" and vc.is_playing():
                    vc.pause()
                elif slash_cmd == "resume" and vc.is_paused():
                    vc.resume()
                elif slash_cmd == "stop":
                    st.queue.clear()
                    st.current = None
                    await vc.disconnect()
            return

        guild, voice_client, err = await find_or_connect_voice(
            pref_guild, user_id=user_id
        )
        if err or not guild or not voice_client:
            if not text_ch and channel_id:
                try:
                    text_ch = await bot.fetch_channel(channel_id)
                except Exception:
                    pass
            if text_ch:
                try:
                    await text_ch.send(f"❌ {err}")
                except Exception:
                    pass
            return

        state = bot.get_state(guild.id)
        if text_ch:
            state.text_channel = text_ch

        if slash_cmd == "play":
            busqueda = opts.get("busqueda")
            if not busqueda:
                return
            try:
                track = await asyncio.to_thread(
                    extract_track, busqueda, user_name
                )
                state.queue.append(track)
                if not voice_client.is_playing() and not voice_client.is_paused():
                    await play_next_async(guild)
                elif text_ch:
                    await text_ch.send(
                        f"➕ Añadida a la cola: **{track.title}** (`{track.duration_str}`)"
                    )
            except Exception as exc:
                if text_ch:
                    await text_ch.send(f"⚠️ Error al cargar: `{exc}`")

        elif slash_cmd == "playlist":
            nombre = opts.get("nombre")
            aleatorio = bool(opts.get("aleatorio", False))
            tracks_data = list(playlist_store.playlists.get(nombre, []))
            if not tracks_data:
                if text_ch:
                    await text_ch.send(
                        f"❌ La lista **{nombre}** no existe o está vacía."
                    )
                return
            if aleatorio:
                random.shuffle(tracks_data)
            for item in tracks_data:
                state.queue.append(
                    Track(
                        title=item["title"],
                        webpage_url=item["webpage_url"],
                        duration=item.get("duration"),
                        thumbnail=item.get("thumbnail"),
                        requested_by=f"{user_name} ({nombre})",
                        stream_url=None,
                    )
                )
            if not voice_client.is_playing() and not voice_client.is_paused():
                await play_next_async(guild)

        elif slash_cmd == "ytplaylist":
            url_pl = opts.get("url")
            aleatorio = bool(opts.get("aleatorio", False))
            guardar = opts.get("guardar_en_web")
            if not url_pl:
                return
            try:
                pl_title, tracks = await asyncio.to_thread(
                    extract_youtube_playlist, url_pl, user_name
                )
                if guardar and str(guardar).strip():
                    save_name = str(guardar).strip()
                    saved_tracks = [t.to_saved_dict() for t in tracks]
                    playlist_store.playlists[save_name] = saved_tracks
                    playlist_store.save()
                    async with aiohttp.ClientSession() as session:
                        await session.put(
                            f"{PUBLIC_WEB_URL.rstrip('/')}/api/playlists/{quote(save_name)}",
                            json={"tracks": saved_tracks},
                        )
                if aleatorio:
                    random.shuffle(tracks)
                for t in tracks:
                    state.queue.append(t)
                if not voice_client.is_playing() and not voice_client.is_paused():
                    await play_next_async(guild)
            except Exception as exc:
                if text_ch:
                    await text_ch.send(
                        f"⚠️ Error cargando playlist de YouTube: `{exc}`"
                    )


async def cloud_sync_loop() -> None:
    """Sincroniza cada 3 segundos las playlists y botones de Cloudflare KV (musika.luisjourney.xyz)."""
    await bot.wait_until_ready()
    if "localhost" in PUBLIC_WEB_URL:
        return
    sync_url = f"{PUBLIC_WEB_URL.rstrip('/')}/api/bot/sync"
    async with aiohttp.ClientSession() as session:
        while not bot.is_closed():
            try:
                now_playing = None
                queue_len = 0
                for guild in bot.guilds:
                    st = bot.get_state(guild.id)
                    if st.current:
                        now_playing = st.current.to_saved_dict()
                        queue_len = len(st.queue)
                        break

                # Si está sonando música en Render, mantenemos despierto el contenedor hasta que termine la cola
                render_url = os.getenv("RENDER_EXTERNAL_URL")
                if render_url and now_playing is not None:
                    try:
                        await session.get(
                            render_url,
                            timeout=aiohttp.ClientTimeout(total=4),
                        )
                    except Exception:
                        pass

                async with session.post(
                    sync_url,
                    json={
                        "now_playing": now_playing,
                        "queue_length": queue_len,
                    },
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if "playlists" in data and isinstance(
                            data["playlists"], dict
                        ):
                            playlist_store.playlists = data["playlists"]
                            playlist_store.save()
                        for cmd in data.get("commands") or []:
                            await execute_remote_command(cmd)
            except Exception:
                pass
            await asyncio.sleep(3)


# ==================== ENDPOINTS WEB API ====================


async def handle_index(request: web.Request) -> web.Response:
    return web.FileResponse(WEB_INDEX_FILE)


async def handle_api_state(request: web.Request) -> web.Response:
    now_playing = None
    queue_len = 0
    for guild in bot.guilds:
        st = bot.get_state(guild.id)
        if st.current:
            now_playing = st.current.to_saved_dict()
            queue_len = len(st.queue)
            break

    return web.json_response(
        {
            "bot_name": str(bot.user) if bot.user else "MusiKa",
            "playlists": playlist_store.playlists,
            "now_playing": now_playing,
            "queue_length": queue_len,
        }
    )


async def handle_create_playlist(request: web.Request) -> web.Response:
    data = await request.json()
    name = (data.get("name") or "").strip()
    if not name:
        return web.json_response(
            {"error": "El nombre no puede estar vacío."}, status=400
        )
    if name in playlist_store.playlists:
        return web.json_response(
            {"error": "Ya existe una lista con ese nombre."}, status=400
        )
    playlist_store.playlists[name] = []
    playlist_store.save()
    return web.json_response({"ok": True, "name": name})


async def handle_delete_playlist(request: web.Request) -> web.Response:
    name = request.match_info["name"]
    if name not in playlist_store.playlists:
        return web.json_response(
            {"error": "La lista no existe."}, status=404
        )
    del playlist_store.playlists[name]
    playlist_store.save()
    return web.json_response({"ok": True})


async def handle_add_track_to_playlist(request: web.Request) -> web.Response:
    name = request.match_info["name"]
    if name not in playlist_store.playlists:
        return web.json_response(
            {"error": "La lista no existe."}, status=404
        )

    data = await request.json()
    query = (data.get("query") or "").strip()
    if not query:
        return web.json_response(
            {"error": "Escribe el nombre o URL de una canción."}, status=400
        )

    # Si pegan el link de una playlist entera de YouTube en la web, importamos todas sus canciones
    if query.startswith(("http://", "https://")) and "list=" in query:
        try:
            pl_title, tracks = await asyncio.to_thread(
                extract_youtube_playlist, query, "Web"
            )
            for t in tracks:
                playlist_store.playlists[name].append(t.to_saved_dict())
            playlist_store.save()
            return web.json_response(
                {
                    "ok": True,
                    "track": {
                        "title": f"{len(tracks)} canciones de '{pl_title}'"
                    },
                }
            )
        except Exception:
            pass

    try:
        track = await asyncio.to_thread(extract_track, query, "Web")
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=400)

    saved = track.to_saved_dict()
    playlist_store.playlists[name].append(saved)
    playlist_store.save()
    return web.json_response({"ok": True, "track": saved})


async def handle_remove_track_from_playlist(
    request: web.Request,
) -> web.Response:
    name = request.match_info["name"]
    idx = int(request.match_info["index"])
    if name not in playlist_store.playlists:
        return web.json_response({"error": "La lista no existe."}, status=404)
    tracks = playlist_store.playlists[name]
    if idx < 0 or idx >= len(tracks):
        return web.json_response({"error": "Índice inválido."}, status=400)
    tracks.pop(idx)
    playlist_store.save()
    return web.json_response({"ok": True})


async def handle_play_playlist_from_web(request: web.Request) -> web.Response:
    name = request.match_info["name"]
    if name not in playlist_store.playlists:
        return web.json_response({"error": "La lista no existe."}, status=404)
    tracks_data = list(playlist_store.playlists[name])
    if not tracks_data:
        return web.json_response(
            {"error": "Esta playlist está vacía."}, status=400
        )

    data = await request.json()
    shuffle = bool(data.get("shuffle", False))
    if shuffle:
        random.shuffle(tracks_data)

    guild, voice_client, err = await find_or_connect_voice()
    if err or not guild or not voice_client:
        return web.json_response({"error": err}, status=400)

    state = bot.get_state(guild.id)
    for item in tracks_data:
        state.queue.append(
            Track(
                title=item["title"],
                webpage_url=item["webpage_url"],
                duration=item.get("duration"),
                thumbnail=item.get("thumbnail"),
                requested_by=f"Playlist: {name}",
                stream_url=None,
            )
        )

    if not voice_client.is_playing() and not voice_client.is_paused():
        await play_next_async(guild)

    mode = "en modo aleatorio" if shuffle else "en orden"
    return web.json_response(
        {
            "ok": True,
            "message": f"Añadidas {len(tracks_data)} canciones de '{name}' ({mode})",
        }
    )


async def handle_play_single_from_web(request: web.Request) -> web.Response:
    data = await request.json()
    query = (data.get("query") or "").strip()
    if not query:
        return web.json_response({"error": "Falta la canción."}, status=400)

    guild, voice_client, err = await find_or_connect_voice()
    if err or not guild or not voice_client:
        return web.json_response({"error": err}, status=400)

    try:
        track = await asyncio.to_thread(extract_track, query, "Panel Web")
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=400)

    state = bot.get_state(guild.id)
    state.queue.append(track)

    if not voice_client.is_playing() and not voice_client.is_paused():
        await play_next_async(guild)
        return web.json_response(
            {"ok": True, "message": f"Reproduciendo: {track.title}"}
        )

    return web.json_response(
        {"ok": True, "message": f"Añadida a la cola: {track.title}"}
    )


async def handle_player_action(request: web.Request) -> web.Response:
    action = request.match_info["action"]
    for guild in bot.guilds:
        vc = guild.voice_client
        if vc and vc.is_connected():
            state = bot.get_state(guild.id)
            if action == "pause_resume":
                if vc.is_playing():
                    vc.pause()
                    return web.json_response(
                        {"ok": True, "message": "⏸️ Música pausada"}
                    )
                elif vc.is_paused():
                    vc.resume()
                    return web.json_response(
                        {"ok": True, "message": "▶️ Música reanudada"}
                    )
            elif action == "skip":
                if vc.is_playing() or vc.is_paused():
                    vc.stop()
                    return web.json_response(
                        {"ok": True, "message": "⏭️ Canción saltada"}
                    )
            elif action == "stop":
                state.queue.clear()
                state.current = None
                await vc.disconnect()
                return web.json_response(
                    {"ok": True, "message": "⏹️ Reproducción detenida"}
                )
    return web.json_response(
        {"error": "El bot no está reproduciendo nada ahora mismo."}, status=400
    )


# ==================== COMANDOS DE DISCORD ====================


@bot.hybrid_command(
    name="play",
    description="Busca y reproduce una canción o enlace (YouTube, SoundCloud, etc.)",
)
@app_commands.describe(
    busqueda="Nombre de la canción o URL que quieres reproducir"
)
async def play(ctx: commands.Context, *, busqueda: str) -> None:
    if not ctx.guild:
        await ctx.send("Este comando solo funciona dentro de un servidor.")
        return

    if not ctx.author.voice or not ctx.author.voice.channel:
        await ctx.send(
            "❌ Debes entrar primero a un canal de voz para pedir música."
        )
        return

    await ctx.defer()

    target_channel = ctx.author.voice.channel
    voice_client = ctx.guild.voice_client

    if not voice_client:
        voice_client = await target_channel.connect()
    elif voice_client.channel != target_channel:
        await voice_client.move_to(target_channel)

    try:
        track = await asyncio.to_thread(
            extract_track, busqueda, ctx.author.display_name
        )
    except Exception as exc:
        await ctx.send(f"⚠️ Error al buscar o cargar el audio: `{exc}`")
        return

    state = bot.get_state(ctx.guild.id)
    state.text_channel = ctx.channel
    state.queue.append(track)

    if not voice_client.is_playing() and not voice_client.is_paused():
        await ctx.send(f"▶️ Cargada: **{track.title}**")
        await play_next_async(ctx.guild)
    else:
        embed = discord.Embed(
            title="➕ Añadida a la cola",
            description=f"[{track.title}]({track.webpage_url})",
            color=discord.Color.green(),
        )
        embed.add_field(
            name="Posición en cola", value=f"#{len(state.queue)}", inline=True
        )
        embed.add_field(
            name="Duración", value=track.duration_str, inline=True
        )
        await ctx.send(embed=embed)


async def playlist_autocomplete(
    interaction: discord.Interaction, current: str
) -> list[app_commands.Choice[str]]:
    choices = []
    for name in playlist_store.playlists.keys():
        if current.lower() in name.lower():
            count = len(playlist_store.playlists[name])
            choices.append(
                app_commands.Choice(
                    name=f"💿 {name} ({count} canciones)", value=name
                )
            )
    return choices[:25]


@bot.hybrid_command(
    name="playlist",
    description="Reproduce una de las playlists creadas en la web",
)
@app_commands.describe(
    nombre="Elige la playlist que quieres reproducir",
    aleatorio="¿Mezclar las canciones en orden aleatorio (Shuffle)?",
)
@app_commands.autocomplete(nombre=playlist_autocomplete)
async def playlist_cmd(
    ctx: commands.Context, nombre: str, aleatorio: bool = False
) -> None:
    if not ctx.guild:
        return

    if not ctx.author.voice or not ctx.author.voice.channel:
        await ctx.send(
            "❌ Debes entrar primero a un canal de voz para poner una playlist."
        )
        return

    if nombre not in playlist_store.playlists:
        await ctx.send(
            f"❌ No existe la lista **{nombre}**. Créala desde el panel web (`/web`)."
        )
        return

    tracks_data = list(playlist_store.playlists[nombre])
    if not tracks_data:
        await ctx.send(
            f"📭 La lista **{nombre}** está vacía. Añádele canciones desde la web (`/web`)."
        )
        return

    await ctx.defer()

    if aleatorio:
        random.shuffle(tracks_data)

    target_channel = ctx.author.voice.channel
    voice_client = ctx.guild.voice_client
    if not voice_client:
        voice_client = await target_channel.connect()
    elif voice_client.channel != target_channel:
        await voice_client.move_to(target_channel)

    state = bot.get_state(ctx.guild.id)
    state.text_channel = ctx.channel

    for item in tracks_data:
        state.queue.append(
            Track(
                title=item["title"],
                webpage_url=item["webpage_url"],
                duration=item.get("duration"),
                thumbnail=item.get("thumbnail"),
                requested_by=f"{ctx.author.display_name} ({nombre})",
                stream_url=None,
            )
        )

    modo = "🔀 en modo aleatorio" if aleatorio else "▶️ en orden"
    await ctx.send(
        f"💿 Playlist **{nombre}** cargada ({len(tracks_data)} canciones {modo})."
    )

    if not voice_client.is_playing() and not voice_client.is_paused():
        await play_next_async(ctx.guild)


@bot.hybrid_command(
    name="ytplaylist",
    description="Reproduce cualquier playlist pública de YouTube o SoundCloud a partir de su URL",
)
@app_commands.describe(
    url="Enlace de la playlist de YouTube (ej. https://www.youtube.com/playlist?list=...)",
    aleatorio="¿Mezclar las canciones en orden aleatorio (Shuffle)?",
    guardar_en_web="Opcional: Si pones un nombre aquí, también se guardará en musika.luisjourney.xyz",
)
async def ytplaylist_cmd(
    ctx: commands.Context,
    url: str,
    aleatorio: bool = False,
    guardar_en_web: Optional[str] = None,
) -> None:
    if not ctx.guild:
        return

    if not ctx.author.voice or not ctx.author.voice.channel:
        await ctx.send(
            "❌ Debes entrar primero a un canal de voz para poner una playlist de YouTube."
        )
        return

    await ctx.defer()

    try:
        pl_title, tracks = await asyncio.to_thread(
            extract_youtube_playlist, url, ctx.author.display_name
        )
    except Exception as exc:
        await ctx.send(f"⚠️ No se pudo cargar la playlist: `{exc}`")
        return

    # Si el usuario pidió guardarla también en la web
    saved_msg = ""
    if guardar_en_web and guardar_en_web.strip():
        save_name = guardar_en_web.strip()
        saved_tracks = [t.to_saved_dict() for t in tracks]
        playlist_store.playlists[save_name] = saved_tracks
        playlist_store.save()
        if "localhost" not in PUBLIC_WEB_URL:
            try:
                async with aiohttp.ClientSession() as session:
                    await session.put(
                        f"{PUBLIC_WEB_URL.rstrip('/')}/api/playlists/{quote(save_name)}",
                        json={"tracks": saved_tracks},
                    )
            except Exception:
                pass
        saved_msg = f"\n💾 Guardada también en la web como **{save_name}**."

    if aleatorio:
        random.shuffle(tracks)

    target_channel = ctx.author.voice.channel
    voice_client = ctx.guild.voice_client
    if not voice_client:
        voice_client = await target_channel.connect()
    elif voice_client.channel != target_channel:
        await voice_client.move_to(target_channel)

    state = bot.get_state(ctx.guild.id)
    state.text_channel = ctx.channel

    for t in tracks:
        state.queue.append(t)

    modo = "🔀 en aleatorio" if aleatorio else "▶️ en orden"
    embed = discord.Embed(
        title=f"📺 Playlist de YouTube cargada: {pl_title}",
        description=(
            f"✅ Se han añadido **{len(tracks)} canciones** a la cola ({modo})."
            f"{saved_msg}"
        ),
        color=discord.Color.red(),
    )
    if tracks[0].thumbnail:
        embed.set_thumbnail(url=tracks[0].thumbnail)
    await ctx.send(embed=embed)

    if not voice_client.is_playing() and not voice_client.is_paused():
        await play_next_async(ctx.guild)


@bot.hybrid_command(
    name="web",
    description="Muestra el enlace a la página web para crear y editar playlists",
)
async def web_cmd(ctx: commands.Context) -> None:
    embed = discord.Embed(
        title="🌐 Panel Web de Playlists — MusiKa",
        description=(
            f"Entra aquí para crear listas, añadir o borrar canciones y controlar el bot:\n\n"
            f"👉 **[{PUBLIC_WEB_URL}]({PUBLIC_WEB_URL})**\n\n"
            f"*Puedes fijar (pinear) este mensaje en el canal para tenerlo siempre a mano.*"
        ),
        color=discord.Color.blurple(),
    )
    await ctx.send(embed=embed)


@bot.hybrid_command(
    name="skip", description="Salta a la siguiente canción de la cola"
)
async def skip(ctx: commands.Context) -> None:
    if not ctx.guild or not ctx.guild.voice_client:
        await ctx.send("❌ No estoy reproduciendo música en este momento.")
        return

    voice_client = ctx.guild.voice_client
    if voice_client.is_playing() or voice_client.is_paused():
        voice_client.stop()
        await ctx.send("⏭️ Canción saltada.")
    else:
        await ctx.send("❌ No hay ninguna canción sonando.")


@bot.hybrid_command(name="pause", description="Pausa la canción actual")
async def pause(ctx: commands.Context) -> None:
    if not ctx.guild or not ctx.guild.voice_client:
        await ctx.send("❌ No estoy en ningún canal de voz.")
        return

    voice_client = ctx.guild.voice_client
    if voice_client.is_playing():
        voice_client.pause()
        await ctx.send("⏸️ Música pausada.")
    else:
        await ctx.send("❌ La música no se está reproduciendo ahora mismo.")


@bot.hybrid_command(name="resume", description="Reanuda la canción pausada")
async def resume(ctx: commands.Context) -> None:
    if not ctx.guild or not ctx.guild.voice_client:
        await ctx.send("❌ No estoy en ningún canal de voz.")
        return

    voice_client = ctx.guild.voice_client
    if voice_client.is_paused():
        voice_client.resume()
        await ctx.send("▶️ Música reanudada.")
    else:
        await ctx.send("❌ La música no está en pausa.")


@bot.hybrid_command(
    name="queue", description="Muestra las canciones pendientes en la cola"
)
async def queue(ctx: commands.Context) -> None:
    if not ctx.guild:
        return
    state = bot.get_state(ctx.guild.id)

    if not state.current and not state.queue:
        await ctx.send("📭 La cola de reproducción está vacía.")
        return

    embed = discord.Embed(
        title="📜 Cola de Reproducción", color=discord.Color.gold()
    )
    if state.current:
        embed.add_field(
            name="🔊 Sonando ahora",
            value=f"[{state.current.title}]({state.current.webpage_url}) (`{state.current.duration_str}`)",
            inline=False,
        )

    if state.queue:
        upcoming = "\n".join(
            f"`{idx}.` [{t.title}]({t.webpage_url}) (`{t.duration_str}`) — *{t.requested_by}*"
            for idx, t in enumerate(list(state.queue)[:10], start=1)
        )
        if len(state.queue) > 10:
            upcoming += f"\n*...y {len(state.queue) - 10} más.*"
        embed.add_field(
            name="⏭️ Próximas canciones", value=upcoming, inline=False
        )

    await ctx.send(embed=embed)


@bot.hybrid_command(
    name="stop",
    description="Detiene la música, vacía la cola y desconecta al bot",
)
async def stop(ctx: commands.Context) -> None:
    if not ctx.guild or not ctx.guild.voice_client:
        await ctx.send("❌ No estoy conectado a ningún canal de voz.")
        return

    state = bot.get_state(ctx.guild.id)
    state.queue.clear()
    state.current = None
    await ctx.guild.voice_client.disconnect()
    await ctx.send("⏹️ Cola vaciada y desconectado del canal de voz.")


@bot.hybrid_command(
    name="info",
    aliases=["help", "ayuda", "comandos"],
    description="Muestra todas las funciones y comandos disponibles del bot",
)
async def info_cmd(ctx: commands.Context) -> None:
    embed = discord.Embed(
        title="🎵 Guía de Funciones — MusiKa Bot",
        description=(
            "¡Hola! Soy tu bot de música para Discord con **panel web integrado**.\n"
            "Puedes usar los comandos con barra diagonal (`/comando`) o prefijo (`!comando`)."
        ),
        color=discord.Color.blurple(),
    )

    embed.add_field(
        name="🎶 Reproducción y Control",
        value=(
            "• `/play <nombre o link>`: Reproduce una canción de YouTube, SoundCloud o búsqueda libre.\n"
            "• `/pause`: Pausa la reproducción actual.\n"
            "• `/resume`: Reanuda la canción pausada.\n"
            "• `/skip`: Pasa a la siguiente canción en la cola.\n"
            "• `/stop`: Detiene la música, limpia la cola y desconecta al bot.\n"
            "• `/queue`: Muestra la canción sonando y las siguientes en cola."
        ),
        inline=False,
    )

    embed.add_field(
        name="💿 Playlists",
        value=(
            "• `/playlist <nombre> [aleatorio]`: Reproduce una de tus listas guardadas en la web (con autocompletado y modo shuffle opcional).\n"
            "• `/ytplaylist <url> [aleatorio] [guardar_en_web]`: Carga una playlist pública u oculta de YouTube. Si indicas un nombre en `guardar_en_web`, se guardará en tu biblioteca de la web."
        ),
        inline=False,
    )

    embed.add_field(
        name="🌐 Panel Web en Tiempo Real",
        value=(
            f"• `/web`: Muestra el enlace al panel interactivo: [{PUBLIC_WEB_URL}]({PUBLIC_WEB_URL})\n"
            "  - **Control remoto**: Play, pausa, skip y stop en vivo desde tu navegador.\n"
            "  - **Gestor de playlists**: Crea listas, busca canciones con autocompletado y elimina pistas.\n"
            "  - **Un clic**: Pulsa reproducir en cualquier lista para mandarla directamente al canal de voz."
        ),
        inline=False,
    )

    embed.set_footer(
        text="Tip: Asegúrate de estar dentro de un canal de voz para que el bot se una."
    )
    if bot.user and bot.user.display_avatar:
        embed.set_thumbnail(url=bot.user.display_avatar.url)

    await ctx.send(embed=embed)


if __name__ == "__main__":
    if not DISCORD_TOKEN or DISCORD_TOKEN == "PEGA_AQUI_TU_TOKEN_DE_DISCORD":
        raise SystemExit(
            "❌ ERROR: Configura tu DISCORD_TOKEN válido en el archivo .env antes de iniciar el bot."
        )
    bot.run(DISCORD_TOKEN)
