(() => {
  const DISCORD_IDS = {
    KENCHIE: "444393598621057054",
    LEY: "1272573862004916338",
    SEN: "1216783275402596493"
  };

  const cards = [...document.querySelectorAll(".member-card")];

  const musicPlayer = document.getElementById("siteMusic");
  const backgroundMusic = document.getElementById("backgroundMusic");
  let activeMusicPath = "";

  function startCardMusic(card) {
    if (!musicPlayer || !card) return;

    // Card music takes priority while a card is hovered or focused.
    if (backgroundMusic) backgroundMusic.pause();
    const path = card.dataset.music;
    if (!path) return;

    const resolvedPath = new URL(path, document.baseURI).href;
    if (activeMusicPath !== resolvedPath) {
      activeMusicPath = resolvedPath;
      musicPlayer.src = resolvedPath;
      musicPlayer.load();
    }

    musicPlayer.volume = 0.55;
    const attempt = musicPlayer.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        // Browsers may block playback; hovering the card again retries it.
      });
    }
  }

  function stopCardMusic() {
    if (!musicPlayer) return;
    musicPlayer.pause();
    try { musicPlayer.currentTime = 0; } catch (_) {}
    activeMusicPath = "";

    // Return to the looping background track when no card is active.
    if (backgroundMusic && document.body.classList.contains("entrance-opened")) {
      const playback = backgroundMusic.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {
          // Playback may be blocked by browser settings.
        });
      }
    }
  }

  function noCardIsActive() {
    return !document.querySelector(".member-card:hover") &&
           !document.querySelector(".member-card:focus-within");
  }

  const siteBackground = document.querySelector(".page-bg");
  const originalBackground = siteBackground ? getComputedStyle(siteBackground).backgroundImage : "none";
  let backgroundResetTimer = null;

  function showMemberBackground(card) {
    if (!siteBackground || !card) return;
    if (backgroundResetTimer) {
      clearTimeout(backgroundResetTimer);
      backgroundResetTimer = null;
    }
    const image = card.dataset.bg;
    if (!image) return;
    const url = new URL(image, document.baseURI).href;
    siteBackground.style.backgroundImage = `url("${url.replace(/["\\]/g, "\\$&")}")`;
    siteBackground.style.opacity = "1";
    siteBackground.style.filter = "blur(2px) brightness(.42) saturate(.78)";
    siteBackground.style.transform = "scale(1.08)";
  }

  function resetSiteBackground() {
    if (!siteBackground) return;
    backgroundResetTimer = setTimeout(() => {
      siteBackground.style.backgroundImage = originalBackground;
      siteBackground.style.opacity = "";
      siteBackground.style.filter = "";
      siteBackground.style.transform = "";
      backgroundResetTimer = null;
    }, 100);
  }

  cards.forEach(card => {
    card.addEventListener("mouseenter", () => { showMemberBackground(card); startCardMusic(card); });
    card.addEventListener("focusin", () => { showMemberBackground(card); startCardMusic(card); });
    card.addEventListener("mouseleave", () => {
      if (!document.querySelector(".member-card:hover")) resetSiteBackground();
      if (noCardIsActive()) stopCardMusic();
    });
    card.addEventListener("focusout", () => {
      if (!document.querySelector(".member-card:focus-within")) resetSiteBackground();
      if (noCardIsActive()) stopCardMusic();
    });
  });
  const cardByMember = new Map(cards.map(card => [card.dataset.member, card]));
  let socket = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let retryDelay = 1500;

  function avatarUrl(user) {
    if (!user || !user.id) return null;
    if (user.avatar) {
      const ext = user.avatar.startsWith("a_") ? "gif" : "png";
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
    }
    const index = Number(BigInt(user.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  function setText(el, value) {
    if (el && value) el.textContent = value;
  }

  function activityAssetUrl(activity, assetKey) {
    const value = activity?.assets?.[assetKey];
    if (!value) return null;

    if (value.startsWith("spotify:")) {
      const imageId = value.slice("spotify:".length);
      return imageId ? `https://i.scdn.co/image/${imageId}` : null;
    }

    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("mp:external/")) {
      const externalPath = value.slice("mp:".length);
      return `https://media.discordapp.net/${externalPath}`;
    }

    if (activity.application_id) {
      const key = value.startsWith("mp:") ? value.slice(3) : value;
      if (!key) return null;
      return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${key}.png?size=256`;
    }
    return null;
  }

  function setActivityDisplay(activityEl, activities, status) {
    activityEl.replaceChildren();
    activityEl.classList.remove("has-activity");
    activityEl.removeAttribute("title");

    const typeLabels = {
      0: "Playing",
      1: "Streaming",
      2: "Listening to",
      3: "Watching",
      4: "Custom status",
      5: "Competing in"
    };
    const visibleActivities = (Array.isArray(activities) ? activities : [])
      .filter(a => a && a.name && a.name !== "Custom Status" && a.type !== 4);

    if (!visibleActivities.length) {
      activityEl.textContent = status === "offline"
        ? "Offline"
        : "Online — no current activity";
      return;
    }

    const list = document.createElement("span");
    list.className = "activity-list";

    visibleActivities.forEach((activity, index) => {
      const title = activity.name || "Current activity";
      const details = activity.details || "";
      const label = typeLabels[activity.type] || "Activity";
      const largeImage = activityAssetUrl(activity, "large_image");
      const smallImage = activityAssetUrl(activity, "small_image");

      const item = document.createElement("span");
      item.className = "activity-layout";

      const image = document.createElement("img");
      image.className = "activity-art";
      image.alt = `${title} activity artwork`;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.src = largeImage || "";
      if (!largeImage) {
        image.classList.add("activity-art-fallback");
        image.alt = `${title} artwork is not provided by Discord`;
        image.src = "data:image/svg+xml," + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="8" fill="#242424"/><path d="M18 48 36 18 54 48Z" fill="none" stroke="#666" stroke-width="2"/><circle cx="36" cy="40" r="4" fill="#888"/></svg>`
        );
      }
      image.onerror = () => {
        image.onerror = null;
        image.classList.add("activity-art-fallback");
        image.alt = `${title} artwork unavailable`;
        image.src = "data:image/svg+xml," + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="8" fill="#242424"/><path d="M18 48 36 18 54 48Z" fill="none" stroke="#666" stroke-width="2"/><circle cx="36" cy="40" r="4" fill="#888"/></svg>`
        );
      };
      item.appendChild(image);

      const copy = document.createElement("span");
      copy.className = "activity-copy";

      const heading = document.createElement("strong");
      heading.className = "activity-title";
      heading.textContent = `${label} ${title}`;
      copy.appendChild(heading);

      if (details) {
        const detailLine = document.createElement("span");
        detailLine.className = "activity-detail";
        detailLine.textContent = details;
        copy.appendChild(detailLine);
      }

      if (activity.state) {
        const stateLine = document.createElement("span");
        stateLine.className = "activity-state";
        stateLine.textContent = activity.state;
        copy.appendChild(stateLine);
      }
      if (activity.type === 2 && activity.name === "Spotify") {
        const spotifyMeta = document.createElement("span");
        spotifyMeta.className = "activity-meta";
        const track = activity.details || "";
        const artist = activity.state || "";
        const album = activity.assets?.large_text || "";
        spotifyMeta.textContent = [artist ? `by ${artist}` : "", album ? `Album: ${album}` : ""]
          .filter(Boolean).join(" · ");
        if (spotifyMeta.textContent) copy.appendChild(spotifyMeta);

        if (activity.timestamps?.start && activity.timestamps?.end) {
          const progress = document.createElement("span");
          progress.className = "activity-progress";
          const updateProgress = () => {
            const now = Date.now();
            const start = activity.timestamps.start;
            const end = activity.timestamps.end;
            const total = Math.max(1, end - start);
            const elapsed = Math.max(0, Math.min(total, now - start));
            const fmt = ms => {
              const seconds = Math.floor(ms / 1000);
              return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
            };
            progress.textContent = `${fmt(elapsed)} / ${fmt(total)}`;
            progress.style.setProperty("--progress", `${(elapsed / total) * 100}%`);
          };
          updateProgress();
          copy.appendChild(progress);
        }
      }

      if (activity.party?.size?.length) {
        const partyLine = document.createElement("span");
        partyLine.className = "activity-meta";
        partyLine.textContent = `Party: ${activity.party.size[0]}${activity.party.size[1] ? ` / ${activity.party.size[1]}` : " players"}`;
        copy.appendChild(partyLine);
      }

      if (activity.timestamps?.end && !activity.timestamps?.start) {
        const ending = document.createElement("span");
        ending.className = "activity-time";
        const remaining = Math.max(0, Math.floor((activity.timestamps.end - Date.now()) / 1000));
        ending.textContent = `Ends in ${Math.floor(remaining / 60)}m ${remaining % 60}s`;
        copy.appendChild(ending);
      }

      if (activity.timestamps?.start) {
        const elapsed = document.createElement("span");
        elapsed.className = "activity-time";
        const updateElapsed = () => {
          const seconds = Math.max(0, Math.floor((Date.now() - activity.timestamps.start) / 1000));
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const sec = seconds % 60;
          elapsed.textContent = `Elapsed ${h ? `${h}h ` : ""}${m}m ${sec}s`;
        };
        updateElapsed();
        copy.appendChild(elapsed);
      }

      if (smallImage) {
        const small = document.createElement("img");
        small.className = "activity-small-art";
        small.src = smallImage;
        small.alt = "Activity icon";
        small.loading = "lazy";
        small.onerror = () => small.remove();
        copy.appendChild(small);
      }

      item.appendChild(copy);
      list.appendChild(item);
    });

    activityEl.appendChild(list);
    activityEl.classList.add("has-activity");
    activityEl.title = visibleActivities.map(a => [a.name, a.details].filter(Boolean).join(" · ")).join(" | ");
  }

  function renderPresence(member, presence) {
    const card = cardByMember.get(member);
    if (!card) return;

    const activityEl = card.querySelector(".discord-activity");
    const statusEl = card.querySelector(".discord-status");
    const avatarEl = card.querySelector(".avatar");
    const nameEl = card.querySelector(".member-info h2");
    const handleEl = card.querySelector(".member-info p");
    if (!activityEl) return;

    if (!presence) {
      activityEl.textContent = "Discord ID not configured";
      return;
    }

    const user = presence.discord_user || presence.user || {};
    const username = user.username || "";
    const displayName = user.global_name || user.display_name || username;
    const profileUrl = user.id ? `https://discord.com/users/${user.id}` : "";

    if (avatarEl) {
      const url = avatarUrl(user);
      if (url) {
        avatarEl.src = url;
        avatarEl.alt = `${displayName || username || member} Discord avatar`;
      }
    }
    if (nameEl && displayName) nameEl.textContent = displayName;

    const guild = user.primary_guild || user.clan || user.guild || null;
    const serverTag = typeof guild === 'string'
      ? guild
      : (guild && (guild.tag || guild.identity_guild_tag || guild.name_tag || guild.identity_tag));
    const guildId = guild && (guild.identity_guild_id || guild.id || guild.guild_id);
    let tagEl = card.querySelector('.discord-server-tag');
    if (!tagEl && nameEl) {
      tagEl = document.createElement('span');
      tagEl.className = 'discord-server-tag';
      tagEl.setAttribute('aria-label', 'Discord server tag');
      tagEl.title = 'Discord server tag';
      nameEl.appendChild(tagEl);
    }
    if (tagEl) {
      tagEl.textContent = serverTag || '';
      tagEl.hidden = !serverTag;
      if (guildId && guild && guild.badge) {
        tagEl.style.setProperty('--server-badge', `url("https://cdn.discordapp.com/clan-badges/${guildId}/${guild.badge}.png")`);
        tagEl.classList.add('has-server-badge');
      } else {
        tagEl.style.removeProperty('--server-badge');
        tagEl.classList.remove('has-server-badge');
      }
    }

    const decoration = user.avatar_decoration_data;
    let decoEl = card.querySelector('.avatar-decoration');
    if (!decoEl && avatarEl) {
      decoEl = document.createElement('img');
      decoEl.className = 'avatar-decoration';
      decoEl.alt = '';
      decoEl.setAttribute('aria-hidden', 'true');
      avatarEl.insertAdjacentElement('afterend', decoEl);
    }
    if (decoEl) {
      if (decoration && decoration.asset) {
        const asset = decoration.asset;
        decoEl.src = `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=256`;
        decoEl.hidden = false;
        decoEl.onerror = () => { decoEl.hidden = true; };
      } else {
        decoEl.hidden = true;
        decoEl.removeAttribute('src');
      }
    }

    if (handleEl && username) {
      handleEl.textContent = `@${username}`;
      if (profileUrl) {
        handleEl.title = "Open Discord profile";
        handleEl.setAttribute("role", "link");
        handleEl.setAttribute("tabindex", "0");
        handleEl.onclick = event => {
          event.stopPropagation();
          window.open(profileUrl, "_blank", "noopener,noreferrer");
        };
        handleEl.onkeydown = event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            window.open(profileUrl, "_blank", "noopener,noreferrer");
          }
        };
      }
    }

    const activities = Array.isArray(presence.activities) ? presence.activities : [];
    setActivityDisplay(activityEl, activities, presence.discord_status || "offline");
  }

  function setUnconfiguredCards() {
    for (const [member, id] of Object.entries(DISCORD_IDS)) {
      if (!id) renderPresence(member, null);
    }
  }

  function updateFromPayload(payload) {
    if (!payload) return;

    for (const [member, id] of Object.entries(DISCORD_IDS)) {
      if (!id) continue;
      const presence = Array.isArray(payload)
        ? payload.find(item => String(item.user_id || item.discord_user?.id || "") === id)
        : payload[id];
      if (presence) renderPresence(member, presence);
    }

    const id = String(payload.user_id || payload.discord_user?.id || "");
    if (id) {
      const member = Object.keys(DISCORD_IDS).find(key => DISCORD_IDS[key] === id);
      if (member) renderPresence(member, payload);
    }
  }

  function connect() {
    clearTimeout(reconnectTimer);
    clearInterval(heartbeatTimer);
    try {
      socket = new WebSocket("wss://api.lanyard.rest/socket");
    } catch {
      reconnectTimer = setTimeout(connect, retryDelay);
      return;
    }

    socket.addEventListener("message", event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }

      if (message.op === 1) {
        const interval = message.d?.heartbeat_interval;
        if (interval) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ op: 3, d: null }));
            }
          }, interval);
        }
        const ids = Object.values(DISCORD_IDS).filter(Boolean);
        if (ids.length) {
          ids.forEach(id => socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } })));
        }
      } else if (message.op === 0 && message.t) {
        if (message.t === "INIT_STATE") updateFromPayload(message.d);
        else if (["PRESENCE_UPDATE", "ACTIVITY_START", "ACTIVITY_END"].includes(message.t)) {
          updateFromPayload(message.d);
        }
      }
    });

    socket.addEventListener("open", () => { retryDelay = 1500; });
    socket.addEventListener("close", () => {
      clearInterval(heartbeatTimer);
      reconnectTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(Math.round(retryDelay * 1.7), 20000);
    });
    socket.addEventListener("error", () => {
      try { socket.close(); } catch {}
    });
  }

  setUnconfiguredCards();
  connect();
})();
