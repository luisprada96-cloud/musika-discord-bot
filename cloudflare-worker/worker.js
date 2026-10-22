// Cloudflare Worker 24/7 para https://musika.luisjourney.xyz
// Almacena las playlists en Cloudflare KV 24/7 y coordina acciones en vivo con el bot.

const HTML_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MusiKa — Gestor de Playlists 24/7</title>
  <style>
    :root {
      --bg: #0f1117;
      --panel: #181b24;
      --panel-hover: #212634;
      --border: #2a3042;
      --accent: #5865f2;
      --accent-hover: #4752c4;
      --green: #23a55a;
      --red: #f23f43;
      --text: #f2f3f5;
      --muted: #949ba4;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .status-badge {
      font-size: 0.85rem;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(74, 222, 128, 0.12);
      border: 1px solid rgba(74, 222, 128, 0.35);
      color: #4ade80;
    }
    .container {
      max-width: 1150px;
      width: 100%;
      margin: 24px auto;
      padding: 0 16px;
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
      flex: 1;
    }
    @media (max-width: 820px) {
      .container { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    h2 {
      font-size: 1.05rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .input-row {
      display: flex;
      gap: 8px;
    }
    input[type="text"] {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.92rem;
      outline: none;
    }
    input[type="text"]:focus {
      border-color: var(--accent);
    }
    button {
      background: var(--accent);
      color: white;
      border: none;
      padding: 9px 14px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    button:hover { background: var(--accent-hover); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.btn-green { background: var(--green); }
    button.btn-green:hover { background: #1a8245; }
    button.btn-red { background: rgba(242, 63, 67, 0.15); color: #ff6b6e; border: 1px solid rgba(242, 63, 67, 0.3); }
    button.btn-red:hover { background: var(--red); color: white; }
    button.btn-secondary { background: #262b3b; color: var(--text); }
    button.btn-secondary:hover { background: #32394e; }

    .playlist-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .playlist-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--bg);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
    }
    .playlist-item:hover { background: var(--panel-hover); }
    .playlist-item.active {
      background: rgba(88, 101, 242, 0.18);
      border-color: var(--accent);
    }
    .playlist-name { font-weight: 600; font-size: 0.95rem; }
    .playlist-count { font-size: 0.8rem; color: var(--muted); }

    .now-playing-bar {
      background: linear-gradient(90deg, rgba(88,101,242,0.16), rgba(35,165,90,0.12));
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .np-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .np-thumb {
      width: 46px;
      height: 46px;
      border-radius: 6px;
      object-fit: cover;
      background: #222;
    }
    .np-title {
      font-weight: 600;
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 420px;
    }
    .np-sub { font-size: 0.8rem; color: var(--muted); }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    .track-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .track-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }
    .track-num {
      color: var(--muted);
      font-size: 0.85rem;
      width: 22px;
      text-align: right;
    }
    .track-thumb {
      width: 48px;
      height: 36px;
      border-radius: 5px;
      object-fit: cover;
      background: #1c202b;
      flex-shrink: 0;
    }
    .track-meta { min-width: 0; flex: 1; }
    .track-title {
      font-weight: 500;
      font-size: 0.93rem;
      color: var(--text);
      text-decoration: none;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .track-title:hover { text-decoration: underline; color: #939bf8; }
    .track-duration { font-size: 0.78rem; color: var(--muted); }
    .empty-state {
      text-align: center;
      padding: 36px 16px;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1e2330;
      border: 1px solid var(--accent);
      color: var(--text);
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      font-size: 0.9rem;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s;
      pointer-events: none;
      z-index: 999;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <header>
    <div class="brand">🎵 MusiKa — Panel de Playlists</div>
    <div style="display:flex; align-items:center; gap:10px;">
      <div id="botStatus" class="status-badge">☁️ Conectando...</div>
      <button id="wakeBtn" class="btn-secondary" style="display:none; padding:6px 12px; font-size:0.82rem;" onclick="wakeBot()">⚡ Despertar Bot</button>
    </div>
  </header>

  <div class="container">
    <div class="card">
      <h2>📂 Tus Playlists</h2>
      <form id="createPlaylistForm" class="input-row">
        <input type="text" id="newPlaylistName" placeholder="Nombre de nueva lista..." required />
        <button type="submit">➕ Crear</button>
      </form>
      <div id="playlistList" class="playlist-list"></div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div class="now-playing-bar">
        <div class="np-info">
          <img id="npThumb" class="np-thumb" src="" alt="" style="display:none;" />
          <div>
            <div id="npTitle" class="np-title">Nada sonando ahora mismo</div>
            <div id="npSub" class="np-sub">Usa /play o /playlist en Discord o lanza una lista desde aquí</div>
          </div>
        </div>
        <div class="controls">
          <button class="btn-secondary" onclick="playerAction('pause_resume')">⏯️ Pausar/Reanudar</button>
          <button class="btn-secondary" onclick="playerAction('skip')">⏭️ Saltar</button>
          <button class="btn-red" onclick="playerAction('stop')">⏹️ Parar</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 id="currentPlaylistTitle">Selecciona o crea una playlist</h2>
            <div id="currentPlaylistSub" style="font-size:0.82rem; color:var(--muted); margin-top:2px;"></div>
          </div>
          <div class="controls" id="playlistActions" style="display:none;">
            <button class="btn-green" onclick="playCurrentPlaylist(false)">▶️ Sonar en Discord</button>
            <button class="btn-secondary" onclick="playCurrentPlaylist(true)">🔀 Shuffle</button>
            <button class="btn-red" onclick="deleteCurrentPlaylist()">🗑️ Borrar Lista</button>
          </div>
        </div>

        <form id="addSongForm" class="input-row" style="display:none;">
          <input type="text" id="songQueryInput" placeholder="Escribe el nombre de una canción o pega un link de YouTube..." required />
          <button type="submit" id="addSongBtn">➕ Añadir Canción</button>
        </form>

        <div id="trackList" class="track-list">
          <div class="empty-state">👈 Elige una playlist de la izquierda o crea una nueva para empezar a meter temazos.</div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    let playlists = {};
    let selectedPlaylist = null;

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3200);
    }

    async function fetchState() {
      const res = await fetch('/api/state');
      const data = await res.json();
      playlists = data.playlists || {};

      const badge = document.getElementById('botStatus');
      const wakeBtn = document.getElementById('wakeBtn');
      if (data.bot_awake) {
        badge.textContent = '🟢 Bot Despierto en Discord';
        badge.style.color = '#4ade80';
        wakeBtn.style.display = 'none';
      } else {
        badge.textContent = '💤 Bot en Reposo (Ahorrando horas)';
        badge.style.color = '#fbbf24';
        wakeBtn.style.display = 'inline-flex';
      }

      const npTitle = document.getElementById('npTitle');
      const npSub = document.getElementById('npSub');
      const npThumb = document.getElementById('npThumb');
      if (data.now_playing) {
        npTitle.textContent = \`🎶 \${data.now_playing.title}\`;
        npSub.textContent = \`Duración: \${data.now_playing.duration_str} • En cola: \${data.queue_length || 0} más\`;
        if (data.now_playing.thumbnail) {
          npThumb.src = data.now_playing.thumbnail;
          npThumb.style.display = 'block';
        } else {
          npThumb.style.display = 'none';
        }
      } else {
        npTitle.textContent = 'Nada sonando ahora mismo';
        npSub.textContent = 'Entra a un canal de voz en Discord y dale a ▶️ Sonar en Discord';
        npThumb.style.display = 'none';
      }

      renderPlaylists();
      if (selectedPlaylist && playlists[selectedPlaylist]) {
        renderTracks(selectedPlaylist);
      } else if (!selectedPlaylist && Object.keys(playlists).length > 0) {
        selectedPlaylist = Object.keys(playlists)[0];
        renderPlaylists();
        renderTracks(selectedPlaylist);
      } else if (selectedPlaylist && !playlists[selectedPlaylist]) {
        selectedPlaylist = null;
        renderTracks(null);
      }
    }

    function renderPlaylists() {
      const container = document.getElementById('playlistList');
      const names = Object.keys(playlists);
      if (names.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:18px 8px;">No hay listas todavía. ¡Crea la primera arriba!</div>';
        return;
      }
      container.innerHTML = names.map(name => {
        const count = playlists[name].length;
        const active = name === selectedPlaylist ? 'active' : '';
        return \`
          <div class="playlist-item \${active}" onclick="selectPlaylist('\${name.replace(/'/g, "\\\\'")}')">
            <span class="playlist-name">🎵 \${escapeHtml(name)}</span>
            <span class="playlist-count">\${count} \${count === 1 ? 'canción' : 'canciones'}</span>
          </div>
        \`;
      }).join('');
    }

    function selectPlaylist(name) {
      selectedPlaylist = name;
      renderPlaylists();
      renderTracks(name);
    }

    function renderTracks(name) {
      const titleEl = document.getElementById('currentPlaylistTitle');
      const subEl = document.getElementById('currentPlaylistSub');
      const actionsEl = document.getElementById('playlistActions');
      const addForm = document.getElementById('addSongForm');
      const listEl = document.getElementById('trackList');

      if (!name || !playlists[name]) {
        titleEl.textContent = 'Selecciona o crea una playlist';
        subEl.textContent = '';
        actionsEl.style.display = 'none';
        addForm.style.display = 'none';
        listEl.innerHTML = '<div class="empty-state">👈 Elige una playlist de la izquierda o crea una nueva.</div>';
        return;
      }

      const tracks = playlists[name];
      titleEl.textContent = \`💿 \${name}\`;
      subEl.textContent = \`\${tracks.length} \${tracks.length === 1 ? 'canción guardada' : 'canciones guardadas'} • También disponible en Discord con /playlist \${name}\`;
      actionsEl.style.display = 'flex';
      addForm.style.display = 'flex';

      if (tracks.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Esta lista está vacía. Escribe arriba el nombre de cualquier canción o pega un link para añadirla.</div>';
        return;
      }

      listEl.innerHTML = tracks.map((t, idx) => \`
        <div class="track-row">
          <div class="track-left">
            <span class="track-num">\${idx + 1}.</span>
            \${t.thumbnail ? \`<img class="track-thumb" src="\${escapeHtml(t.thumbnail)}" alt="" />\` : '<div class="track-thumb"></div>'}
            <div class="track-meta">
              <a class="track-title" href="\${escapeHtml(t.webpage_url)}" target="_blank" rel="noopener">\${escapeHtml(t.title)}</a>
              <span class="track-duration">⏱️ \${escapeHtml(t.duration_str || '')}</span>
            </div>
          </div>
          <div class="controls">
            <button class="btn-secondary" title="Reproducir en Discord" onclick="playSingleTrack('\${escapeJs(t.webpage_url)}')">▶️ Sonar</button>
            <button class="btn-red" title="Quitar de la lista" onclick="removeTrack(\${idx})">✖</button>
          </div>
        </div>
      \`).join('');
    }

    document.getElementById('createPlaylistForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('newPlaylistName');
      const name = input.value.trim();
      if (!name) return;
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (res.ok) {
        input.value = '';
        selectedPlaylist = name;
        showToast(\`✅ Lista "\${name}" creada\`);
        await fetchState();
      } else {
        showToast(\`⚠️ \${data.error || 'Error'}\`);
      }
    });

    document.getElementById('addSongForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedPlaylist) return;
      const input = document.getElementById('songQueryInput');
      const btn = document.getElementById('addSongBtn');
      const query = input.value.trim();
      if (!query) return;

      btn.disabled = true;
      btn.textContent = '⏳ Buscando...';
      try {
        const res = await fetch(\`/api/playlists/\${encodeURIComponent(selectedPlaylist)}/tracks\`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ query })
        });
        const data = await res.json();
        if (res.ok) {
          input.value = '';
          showToast(\`➕ Añadida: \${data.track.title}\`);
          await fetchState();
        } else {
          showToast(\`⚠️ \${data.error || 'Error'}\`);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '➕ Añadir Canción';
      }
    });

    async function removeTrack(index) {
      if (!selectedPlaylist) return;
      const res = await fetch(\`/api/playlists/\${encodeURIComponent(selectedPlaylist)}/tracks/\${index}\`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('🗑️ Canción eliminada');
        await fetchState();
      }
    }

    async function deleteCurrentPlaylist() {
      if (!selectedPlaylist) return;
      if (!confirm(\`¿Seguro que quieres borrar la lista "\${selectedPlaylist}"?\`)) return;
      const name = selectedPlaylist;
      const res = await fetch(\`/api/playlists/\${encodeURIComponent(name)}\`, {
        method: 'DELETE'
      });
      if (res.ok) {
        selectedPlaylist = null;
        showToast(\`🗑️ Lista "\${name}" borrada\`);
        await fetchState();
      }
    }

    async function playCurrentPlaylist(shuffle) {
      if (!selectedPlaylist) return;
      const res = await fetch(\`/api/playlists/\${encodeURIComponent(selectedPlaylist)}/play\`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ shuffle })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(\`🎶 \${data.message}\`);
      } else {
        showToast(\`⚠️ \${data.error}\`);
      }
    }

    async function playSingleTrack(url) {
      const res = await fetch('/api/player/play', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ query: url })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(\`▶️ \${data.message}\`);
      } else {
        showToast(\`⚠️ \${data.error}\`);
      }
    }

    async function playerAction(action) {
      const res = await fetch(\`/api/player/\${action}\`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Enviado al bot');
      } else {
        showToast(\`⚠️ \${data.error || 'No disponible'}\`);
      }
    }

    async function wakeBot() {
      showToast('⚡ Despertando al bot en Render (tarda ~25s)...');
      await fetch('/api/bot/wake', { method: 'POST' });
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[s]));
    }
    function escapeJs(str) {
      return String(str || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
    }

    fetchState();
    setInterval(fetchState, 4000);
  </script>
</body>
</html>`;

function parseDurationString(str) {
  if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

async function searchYouTubeEdge(query) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: {
        client: { clientName: "WEB", clientVersion: "2.20241010.01.00", hl: "es", gl: "ES" },
      },
      query,
    }),
  });
  const data = await res.json();
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item.videoRenderer;
      if (v && v.videoId) {
        const title = v.title?.runs?.map((r) => r.text).join("") || query;
        const durationStr = v.lengthText?.simpleText || "3:30";
        const duration = parseDurationString(durationStr);
        const thumbnail = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        return {
          title,
          webpage_url: `https://www.youtube.com/watch?v=${v.videoId}`,
          duration,
          duration_str: durationStr,
          thumbnail,
        };
      }
    }
  }
  return null;
}

async function resolveTrackMetadata(query) {
  if (query.startsWith("http://") || query.startsWith("https://")) {
    try {
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(query)}`);
      const info = await res.json();
      if (info && info.title) {
        return {
          title: info.title,
          webpage_url: query,
          duration: null,
          duration_str: info.author_name || "Enlace directo",
          thumbnail: info.thumbnail_url || null,
        };
      }
    } catch (_) {}
    return { title: query, webpage_url: query, duration: null, duration_str: "Enlace", thumbnail: null };
  }

  try {
    const yt = await searchYouTubeEdge(query);
    if (yt) return yt;
  } catch (_) {}

  return { title: query, webpage_url: query, duration: null, duration_str: "Canción", thumbnail: null };
}

async function getPlaylists(env) {
  const raw = await env.PLAYLISTS_KV.get("playlists");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

async function savePlaylists(env, playlists) {
  await env.PLAYLISTS_KV.put("playlists", JSON.stringify(playlists));
}

async function pushCommand(env, cmd) {
  const raw = await env.PLAYLISTS_KV.get("bot_commands");
  const list = raw ? JSON.parse(raw) : [];
  list.push({ ...cmd, ts: Date.now() });
  await env.PLAYLISTS_KV.put("bot_commands", JSON.stringify(list.slice(-20)));
}

function wakeRenderIfConfigured(env, ctx) {
  if (env.BOT_PING_URL) {
    ctx.waitUntil(fetch(env.BOT_PING_URL).catch(() => {}));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/") {
      // Al abrir la web, enviamos un toque automático a Render por si estaba dormido
      wakeRenderIfConfigured(env, ctx);
      return new Response(HTML_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (request.method === "POST" && path === "/api/bot/wake") {
      wakeRenderIfConfigured(env, ctx);
      return Response.json({ ok: true, message: "Despertando bot..." });
    }

    if (request.method === "GET" && (path === "/api/state" || path === "/api/playlists")) {
      const [playlists, botStateRaw] = await Promise.all([
        getPlaylists(env),
        env.PLAYLISTS_KV.get("bot_state"),
      ]);
      const botState = botStateRaw ? JSON.parse(botStateRaw) : {};
      const botAwake = Boolean(botState.updated_at && Date.now() - botState.updated_at < 15000);
      return Response.json({
        bot_name: "MusiKa",
        bot_awake: botAwake,
        playlists,
        now_playing: botAwake ? botState.now_playing || null : null,
        queue_length: botAwake ? botState.queue_length || 0 : 0,
      });
    }

    // Endpoint para sincronización bidireccional del Bot de Discord con Cloudflare KV
    if (request.method === "POST" && path === "/api/bot/sync") {
      const body = await request.json();
      await env.PLAYLISTS_KV.put(
        "bot_state",
        JSON.stringify({
          now_playing: body.now_playing || null,
          queue_length: body.queue_length || 0,
          updated_at: Date.now(),
        })
      );
      const cmdsRaw = await env.PLAYLISTS_KV.get("bot_commands");
      const commands = cmdsRaw ? JSON.parse(cmdsRaw) : [];
      if (commands.length > 0) {
        await env.PLAYLISTS_KV.delete("bot_commands");
      }
      const playlists = await getPlaylists(env);
      return Response.json({ ok: true, commands, playlists });
    }

    if (request.method === "PUT" && path.startsWith("/api/playlists/")) {
      const name = decodeURIComponent(path.replace("/api/playlists/", ""));
      const body = await request.json();
      const playlists = await getPlaylists(env);
      playlists[name] = body.tracks || [];
      await savePlaylists(env, playlists);
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && path === "/api/playlists") {
      const body = await request.json();
      const name = (body.name || "").trim();
      if (!name) return Response.json({ error: "Nombre vacío" }, { status: 400 });
      const playlists = await getPlaylists(env);
      if (playlists[name]) return Response.json({ error: "Ya existe esa lista" }, { status: 400 });
      playlists[name] = [];
      await savePlaylists(env, playlists);
      return Response.json({ ok: true, name });
    }

    const matchTracks = path.match(/^\/api\/playlists\/([^/]+)\/tracks$/);
    if (request.method === "POST" && matchTracks) {
      const name = decodeURIComponent(matchTracks[1]);
      const playlists = await getPlaylists(env);
      if (!playlists[name]) return Response.json({ error: "No existe la lista" }, { status: 404 });
      const body = await request.json();
      const query = (body.query || "").trim();
      if (!query) return Response.json({ error: "Canción vacía" }, { status: 400 });

      const track = await resolveTrackMetadata(query);
      playlists[name].push(track);
      await savePlaylists(env, playlists);
      return Response.json({ ok: true, track });
    }

    const matchDeleteTrack = path.match(/^\/api\/playlists\/([^/]+)\/tracks\/(\d+)$/);
    if (request.method === "DELETE" && matchDeleteTrack) {
      const name = decodeURIComponent(matchDeleteTrack[1]);
      const idx = parseInt(matchDeleteTrack[2], 10);
      const playlists = await getPlaylists(env);
      if (!playlists[name]) return Response.json({ error: "No existe la lista" }, { status: 404 });
      playlists[name].splice(idx, 1);
      await savePlaylists(env, playlists);
      return Response.json({ ok: true });
    }

    const matchDeletePlaylist = path.match(/^\/api\/playlists\/([^/]+)$/);
    if (request.method === "DELETE" && matchDeletePlaylist) {
      const name = decodeURIComponent(matchDeletePlaylist[1]);
      const playlists = await getPlaylists(env);
      delete playlists[name];
      await savePlaylists(env, playlists);
      return Response.json({ ok: true });
    }

    const matchPlayPlaylist = path.match(/^\/api\/playlists\/([^/]+)\/play$/);
    if (request.method === "POST" && matchPlayPlaylist) {
      const name = decodeURIComponent(matchPlayPlaylist[1]);
      const body = await request.json();
      wakeRenderIfConfigured(env, ctx);
      await pushCommand(env, { type: "play_playlist", name, shuffle: !!body.shuffle });
      return Response.json({ ok: true, message: `Orden enviada al bot: reproducir "${name}"` });
    }

    if (request.method === "POST" && path === "/api/player/play") {
      const body = await request.json();
      wakeRenderIfConfigured(env, ctx);
      await pushCommand(env, { type: "play_single", query: body.query });
      return Response.json({ ok: true, message: "Canción enviada a la cola del bot" });
    }

    const matchAction = path.match(/^\/api\/player\/([^/]+)$/);
    if (request.method === "POST" && matchAction) {
      const action = matchAction[1];
      wakeRenderIfConfigured(env, ctx);
      await pushCommand(env, { type: "action", action });
      return Response.json({ ok: true, message: `Acción enviada: ${action}` });
    }

    return new Response("Not Found", { status: 404 });
  },
};
