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
        if (data.active_instance === 'raspiluis') {
          badge.textContent = '🟢 Bot Activo en Discord [🍓 Raspberry Pi]';
        } else {
          badge.textContent = '🟢 Bot Activo en Discord [☁️ Render Respaldo]';
        }
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

    let isWaking = false;
    async function wakeBot() {
      if (isWaking) return;
      isWaking = true;
      const wakeBtn = document.getElementById('wakeBtn');
      if (wakeBtn) {
        wakeBtn.disabled = true;
        wakeBtn.textContent = '⏳ Despertando (~40s)...';
      }
      showToast('⚡ Enviando señal de arranque a Render...');
      try {
        await fetch('/api/bot/wake', { method: 'POST' });
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const res = await fetch('/api/state');
          const data = await res.json();
          if (data.bot_awake) {
            showToast('✅ ¡El bot ha despertado y está listo en Discord!');
            fetchState();
            break;
          }
        }
      } catch (e) {
        showToast('⚠️ Error al contactar con Render');
      } finally {
        isWaking = false;
        if (wakeBtn) {
          wakeBtn.disabled = false;
          wakeBtn.textContent = '⚡ Despertar Bot';
        }
      }
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

// Almacenamiento en D1 (100k escrituras/día gratis) en lugar de KV (solo 1000/día).
// KV se usa únicamente como fuente de lectura para migrar las playlists antiguas.
async function getPlaylists(env) {
  try {
    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'playlists'").first();
    if (row && row.v) return JSON.parse(row.v);
  } catch (_) {}
  // Migración única desde KV
  try {
    const raw = await env.PLAYLISTS_KV.get("playlists");
    if (raw) {
      const parsed = JSON.parse(raw);
      await savePlaylists(env, parsed);
      return parsed;
    }
  } catch (_) {}
  return {};
}

async function savePlaylists(env, playlists) {
  await env.DB.prepare(
    "INSERT INTO kv (k, v) VALUES ('playlists', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
  )
    .bind(JSON.stringify(playlists))
    .run();
}

async function pushCommand(env, cmd) {
  await env.DB.prepare("INSERT INTO commands (payload, created_at) VALUES (?1, ?2)")
    .bind(JSON.stringify({ ...cmd, ts: Date.now() }), Date.now())
    .run();
}

async function popCommands(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, payload FROM commands ORDER BY id LIMIT 20"
  ).all();
  if (!results || results.length === 0) return [];
  const maxId = results[results.length - 1].id;
  await env.DB.prepare("DELETE FROM commands WHERE id <= ?1").bind(maxId).run();
  // Descartar órdenes de más de 3 minutos (por si el bot tardó demasiado en despertar)
  const cutoff = Date.now() - 180000;
  return results
    .map((r) => {
      try { return JSON.parse(r.payload); } catch (_) { return null; }
    })
    .filter((c) => c && (!c.ts || c.ts > cutoff));
}

// Comprueba en directo si el contenedor de Render está despierto (sin despertarlo si tarda)
async function checkRenderAwake(env, timeoutMs) {
  if (!env.BOT_PING_URL) return null;
  try {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(env.BOT_PING_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "MusiKa-WebCheck/1.0" },
    });
    clearTimeout(tId);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

const DISCORD_PUBLIC_KEY = "5d9712c00d7613e94b42461e2753d368bcac18bf7f27e0c132bf42761f3fa4f1";

function hexToUint8Array(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

async function verifyDiscordRequest(request, rawBody) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(DISCORD_PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    const msg = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify("Ed25519", key, hexToUint8Array(signature), msg);
  } catch (_) {
    return false;
  }
}

let memoryBotState = { now_playing: null, queue_length: 0, updated_at: 0 };

async function getBotState(env) {
  try {
    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'bot_state'").first();
    if (row && row.v) return JSON.parse(row.v);
  } catch (_) {}
  return memoryBotState;
}

async function saveBotState(env, state) {
  memoryBotState = state;
  try {
    await env.DB.prepare(
      "INSERT INTO kv (k, v) VALUES ('bot_state', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
    )
      .bind(JSON.stringify(state))
      .run();
  } catch (_) {}
}

function isAwake(state) {
  return Boolean(state && state.updated_at && Date.now() - state.updated_at < 20000);
}

async function isRaspiActive(env) {
  try {
    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'last_raspi_seen'").first();
    if (row && row.v) {
      return (Date.now() - Number(row.v)) < 45000;
    }
  } catch (_) {}
  return false;
}

async function wakeRenderIfConfigured(env, ctx) {
  // ¡Regla de oro de ahorro!: Si la Raspberry Pi está activa en casa,
  // NUNCA enviamos peticiones HTTP a Render para que permanezca dormido (0 horas consumidas).
  if (await isRaspiActive(env)) return;

  if (env.BOT_PING_URL) {
    ctx.waitUntil(
      fetch(env.BOT_PING_URL, {
        headers: { "User-Agent": "MusiKa-Wakeup-Ping/1.0" },
      }).catch(() => {})
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Receptor 24/7 de comandos Slash de Discord (/play, /playlist, /ytplaylist, etc.)
    // Despierta automáticamente el contenedor de Render si estaba dormido
    if (request.method === "POST" && path === "/api/discord") {
      const rawBody = await request.text();
      const isValid = await verifyDiscordRequest(request, rawBody);
      if (!isValid) {
        return new Response("Invalid request signature", { status: 401 });
      }
      const interaction = JSON.parse(rawBody);

      // 1 = PING de verificación de Discord
      if (interaction.type === 1) {
        return Response.json({ type: 1 });
      }

      // 4 = Autocompletado en vivo de /playlist directamente desde Cloudflare KV
      if (interaction.type === 4) {
        const playlists = await getPlaylists(env);
        const focused = (interaction.data?.options || []).find((o) => o.focused);
        const current = (focused?.value || "").toLowerCase();
        const choices = Object.keys(playlists)
          .filter((name) => name.toLowerCase().includes(current))
          .slice(0, 25)
          .map((name) => ({
            name: `💿 ${name} (${playlists[name].length} canciones)`,
            value: name,
          }));
        return Response.json({ type: 8, data: { choices } });
      }

      // 2 = Ejecución de comando Slash (/play, /playlist, /ytplaylist, /skip, etc.)
      if (interaction.type === 2) {
        const cmdName = interaction.data?.name;
        const opts = {};
        for (const opt of interaction.data?.options || []) {
          opts[opt.name] = opt.value;
        }

        if (cmdName === "web") {
          return Response.json({
            type: 4,
            data: {
              embeds: [
                {
                  title: "🌐 Panel Web de Playlists — MusiKa",
                  description:
                    "Entra aquí para crear listas, añadir o borrar canciones y controlar el bot en vivo:\n\n👉 **[musika.luisjourney.xyz](https://musika.luisjourney.xyz)**\n\n*Haz clic en el enlace para abrir el panel interactivo.*",
                  color: 0x5865f2,
                },
              ],
            },
          });
        }

        // Despertar inmediatamente a Render
        wakeRenderIfConfigured(env, ctx);

        const botState = await getBotState(env);
        const botAwake = isAwake(botState);

        const userName =
          interaction.member?.nick ||
          interaction.member?.user?.global_name ||
          interaction.member?.user?.username ||
          "Discord";
        const userId = interaction.member?.user?.id || interaction.user?.id;

        const slashCmd = {
          type: "discord_slash",
          cmd: cmdName,
          options: opts,
          guild_id: interaction.guild_id,
          channel_id: interaction.channel_id,
          user_id: userId,
          user_name: userName,
        };
        if (cmdName === "info") {
          return Response.json({
            type: 4,
            data: {
              embeds: [
                {
                  title: "🎵 Guía de Funciones — MusiKa Bot",
                  color: 0x5865f2,
                  fields: [
                    {
                      name: "🎶 Reproducción",
                      value:
                        "`/play <nombre o link>` · `/pause` · `/resume` · `/skip` · `/stop` · `/queue`",
                    },
                    {
                      name: "💿 Playlists",
                      value:
                        "`/playlist <nombre> [aleatorio]` — listas de la web\n`/ytplaylist <url> [aleatorio] [guardar_en_web]` — playlist de YouTube",
                    },
                    {
                      name: "🌐 Panel Web Interactivo",
                      value:
                        "• `/web` — **[musika.luisjourney.xyz](https://musika.luisjourney.xyz)**\nControl remoto en vivo, creación de playlists con autocompletado y reproducción en 1 clic.",
                    },
                  ],
                  footer: { text: "Entra en un canal de voz antes de pedir música." },
                },
              ],
            },
          });
        }
        try {
          if (cmdName === "playlist" && opts.nombre) {
            slashCmd.tracks = (await getPlaylists(env))[opts.nombre] || [];
          }
          await pushCommand(env, slashCmd);
        } catch (err) {
          return Response.json({
            type: 4,
            data: { content: `⚠️ Error interno guardando la orden: \`${err}\`` },
          });
        }

        const wakeNotice = botAwake
          ? ""
          : "\n⚡ *(El bot estaba en reposo ahorrando horas en Render; tardará ~20s en entrar al canal de voz)*";

        let replyText = `🎶 Comando \`/${cmdName}\` enviado al bot.${wakeNotice}`;
        if (cmdName === "play") {
          replyText = `▶️ Buscando y cargando: **${opts.busqueda}**...${wakeNotice}`;
        } else if (cmdName === "playlist") {
          replyText = `💿 Cargando playlist **${opts.nombre}**...${wakeNotice}`;
        } else if (cmdName === "ytplaylist") {
          replyText = `📺 Cargando playlist de YouTube...${wakeNotice}`;
        } else if (cmdName === "skip") {
          replyText = `⏭️ Saltando a la siguiente canción...`;
        } else if (cmdName === "pause") {
          replyText = `⏸️ Pausando reproducción...`;
        } else if (cmdName === "resume") {
          replyText = `▶️ Reanudando reproducción...`;
        } else if (cmdName === "stop") {
          replyText = `⏹️ Deteniendo música y vaciando la cola...`;
        } else if (cmdName === "queue") {
          if (botState.now_playing) {
            replyText = `🔊 **Sonando ahora:** ${botState.now_playing.title} (\`${botState.now_playing.duration_str}\`)\n⏭️ Canciones en espera: **${botState.queue_length || 0}**`;
          } else {
            replyText = `📭 No hay nada sonando ahora mismo.`;
          }
        }

        return Response.json({
          type: 4,
          data: { content: replyText },
        });
      }
    }

    if (request.method === "GET" && path === "/") {
      // Al abrir la web, solo enviamos toque si la Raspberry Pi NO está en casa
      ctx.waitUntil(wakeRenderIfConfigured(env, ctx));
      return new Response(HTML_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (request.method === "POST" && path === "/api/bot/wake") {
      if (await isRaspiActive(env)) {
        return Response.json({
          ok: true,
          awake: true,
          active_instance: "raspiluis",
          message: "El bot ya está activo en tu Raspberry Pi (0 horas consumidas)",
        });
      }
      // Solo si la Raspberry está apagada, despertamos a Render:
      const data = await checkRenderAwake(env, 25000);
      return Response.json({
        ok: true,
        awake: Boolean(data),
        message: data ? "Bot despierto en Render" : "Render está arrancando...",
      });
    }

    if (request.method === "GET" && (path === "/api/state" || path === "/api/playlists")) {
      const playlists = await getPlaylists(env);
      // El bot sincroniza cada 2-3s: si su último latido es reciente está despierto
      const botState = await getBotState(env);
      const botAwake = isAwake(botState);
      return Response.json({
        bot_name: "MusiKa",
        bot_awake: botAwake,
        active_instance: botAwake ? (botState.active_instance || "render") : null,
        playlists,
        now_playing: botAwake ? botState.now_playing || null : null,
        queue_length: botAwake ? botState.queue_length || 0 : 0,
      });
    }

    // Endpoint de latido del bot: guarda estado y le entrega las órdenes pendientes (D1)
    if (request.method === "POST" && path === "/api/bot/sync") {
      const body = await request.json();
      const instance = body.instance || "render";
      const now = Date.now();

      // Si la señal viene de la Raspberry Pi, actualizamos su último latido en D1
      if (instance === "raspiluis") {
        await env.DB.prepare(
          "INSERT INTO kv (k, v) VALUES ('last_raspi_seen', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
        ).bind(String(now)).run().catch(() => {});
      }

      // Comprobamos si la Raspberry Pi está activa (latido en los últimos 45 segundos)
      let raspiActive = false;
      try {
        const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'last_raspi_seen'").first();
        if (row && row.v) {
          raspiActive = (now - Number(row.v)) < 45000;
        }
      } catch (_) {}

      // Si quien llama es Render pero la Raspberry está viva:
      // Render se pone en modo standby y NO se le entregan comandos para que no colisionen.
      if (instance !== "raspiluis" && raspiActive) {
        return Response.json({
          ok: true,
          standby: true,
          active_instance: "raspiluis",
          commands: [],
          playlists: body.want_playlists ? await getPlaylists(env) : undefined,
        });
      }

      await saveBotState(env, {
        now_playing: body.now_playing || null,
        queue_length: body.queue_length || 0,
        updated_at: now,
        active_instance: instance,
      });
      const commands = await popCommands(env);
      const resp = { ok: true, commands, active_instance: instance, standby: false };
      if (body.want_playlists) resp.playlists = await getPlaylists(env);
      return Response.json(resp);
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
      await pushCommand(env, {
        type: "play_playlist",
        name,
        shuffle: !!body.shuffle,
        tracks: (await getPlaylists(env))[name] || [],
      });
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
