/* ECOC programme browser — grid/list views with a right-hand detail panel */

(function () {
  "use strict";

  const HOUR_H = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--hour-h")
  ) || 90;
  const SCHEDULE_KEY = "ecoc2026-schedule";

  const data = window.PROGRAMME;
  if (!data) {
    document.body.innerHTML =
      '<div style="padding:2rem;font-family:sans-serif">' +
      "<h2>No programme data</h2>" +
      "<p>Run <code>python -m webevents build-web ecoc2026</code> first.</p></div>";
    return;
  }

  const state = {
    day: data.meta.days[0],
    search: "",
    type: "",
    track: "",
    room: "",
    view: "grid",
    selectedId: null,
  };

  const schedule = new Set(JSON.parse(localStorage.getItem(SCHEDULE_KEY) || "[]"));
  let scheduleView = localStorage.getItem("ecoc2026-schedule-view") || "list";

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sessionById(id) {
    return data.sessions.find((s) => s.id === id);
  }

  function haystack(s) {
    const parts = [
      s.title, s.ref, s.kind, s.track, s.room,
      ...(s.chairs || []),
      ...(s.talks || []).flatMap((t) => [
        t.title, t.ref, ...(t.speakers || []), ...(t.authors || []), t.abstract,
      ]),
    ];
    return parts.join(" ").toLowerCase();
  }

  function filteredSessions() {
    const q = state.search.trim().toLowerCase();
    return data.sessions.filter((s) => {
      if (s.day !== state.day) return false;
      if (state.type && s.kind !== state.type) return false;
      if (state.track && s.track !== state.track) return false;
      if (state.room && s.room !== state.room) return false;
      if (q && !haystack(s).includes(q)) return false;
      return true;
    });
  }

  function dayBounds(sessions) {
    if (!sessions.length) return { start: 8 * 60, end: 19 * 60 };
    let start = Math.min(...sessions.map((s) => s.startMin));
    let end = Math.max(...sessions.map((s) => s.endMin));
    start = Math.floor(start / 60) * 60 - 30;
    end = Math.ceil(end / 60) * 60 + 30;
    return { start: Math.max(0, start), end: Math.min(24 * 60, end) };
  }

  function roomsForDay(sessions) {
    const seen = new Set();
    const rooms = [];
    for (const s of sessions) {
      if (s.room && !seen.has(s.room)) {
        seen.add(s.room);
        rooms.push(s.room);
      }
    }
    return rooms.sort();
  }

  function saveSchedule() {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify([...schedule]));
    updateScheduleBadge();
  }

  function updateScheduleBadge() {
    const badge = $("#schedule-count");
    badge.textContent = schedule.size;
    badge.classList.toggle("hidden", schedule.size === 0);
  }

  function isMobile() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function updateFiltersButton() {
    const btn = $("#btn-filters");
    if (!btn) return;
    const active = state.type || state.track || state.room;
    const open = $("#filters-panel").classList.contains("open");
    btn.textContent = active ? "Filters ●" : "Filters";
    btn.classList.toggle("active", active || open);
    btn.setAttribute("aria-expanded", open);
  }

  function markSelected() {
    document.querySelectorAll(".session-block, .list-item").forEach((node) => {
      node.classList.toggle("selected", node.dataset.id === state.selectedId);
    });
  }

  function openPanel(id) {
    state.selectedId = id;
    $("#workspace").classList.add("panel-open");
    $("#panel").setAttribute("aria-hidden", "false");
    renderPanel(id);
    markSelected();
  }

  function closePanel() {
    state.selectedId = null;
    $("#workspace").classList.remove("panel-open");
    $("#panel").setAttribute("aria-hidden", "true");
    markSelected();
  }

  function renderPanel(id) {
    const s = sessionById(id);
    if (!s) return;

    const saved = schedule.has(id);
    const saveBtn = $("#panel-save");
    saveBtn.textContent = saved ? "Remove from schedule" : "Add to my schedule";
    saveBtn.classList.toggle("btn-primary", !saved);
    saveBtn.classList.toggle("btn-ghost", saved);

    $("#panel-meta").innerHTML =
      `<span class="kind-pill" style="background:${escapeHtml(s.color)}">${escapeHtml(s.kind)}</span>` +
      `<h2>${escapeHtml(s.title)}</h2>` +
      `<p class="meta-line"><strong>${escapeHtml(s.start)}–${escapeHtml(s.end)}</strong> · ${escapeHtml(s.dayLabel)}</p>` +
      `<p class="meta-line">${escapeHtml(s.room)}</p>` +
      (s.track ? `<p class="meta-line">${escapeHtml(s.track)}</p>` : "") +
      (s.chairs?.length ? `<p class="meta-line">Chairs: ${escapeHtml(s.chairs.join(", "))}</p>` : "");

    const body = $("#panel-body");
    body.innerHTML = "";

    if (s.talks?.length) {
      const sec = el("div", "panel-section");
      sec.appendChild(el("h3", null, `Presentations (${s.talks.length})`));
      for (const t of s.talks) {
        const card = el("div", "talk-card");
        card.innerHTML =
          (t.start ? `<div class="talk-time">${escapeHtml(t.start)}${t.end ? "–" + escapeHtml(t.end) : ""}</div>` : "") +
          `<div class="talk-title">${escapeHtml(t.title)}</div>` +
          (t.speakers?.length ? `<div class="talk-speakers">Speaker: ${escapeHtml(t.speakers.join(", "))}</div>` : "") +
          (t.authors?.length ? `<div class="talk-authors">Authors: ${escapeHtml(t.authors.join(" / "))}</div>` : "") +
          (t.abstract ? `<div class="talk-abstract">${escapeHtml(t.abstract)}</div>` : "");
        sec.appendChild(card);
      }
      body.appendChild(sec);
    } else {
      body.appendChild(el("p", "muted", "No individual presentations listed for this session."));
    }

    if (s.url) {
      const link = el("p", "panel-section");
      link.innerHTML = `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">Open on conference website ↗</a>`;
      body.appendChild(link);
    }
  }

  function renderGrid() {
    const sessions = filteredSessions();
    const grid = $("#grid");
    grid.innerHTML = "";
    $("#empty").classList.toggle("hidden", sessions.length > 0);
    if (!sessions.length) return;

    const bounds = dayBounds(sessions);
    const rooms = roomsForDay(sessions);
    const totalH = ((bounds.end - bounds.start) / 60) * HOUR_H;

    const wrap = el("div", "schedule-grid");

    const axis = el("div", "time-axis");
    for (let min = bounds.start; min < bounds.end; min += 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      axis.appendChild(el("div", "time-label", `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`));
    }
    wrap.appendChild(axis);

    const scroll = el("div", "rooms-scroll");
    const byRoom = Object.fromEntries(rooms.map((r) => [r, []]));
    for (const s of sessions) {
      if (byRoom[s.room]) byRoom[s.room].push(s);
    }

    for (const room of rooms) {
      const col = el("div", "room-column");
      const short = data.meta.roomShort?.[room] || room;
      const header = el("div", "room-header", escapeHtml(short));
      header.title = room;
      col.appendChild(header);

      const track = el("div", "room-track");
      track.style.height = `${totalH}px`;

      for (const s of byRoom[room]) {
        const top = ((s.startMin - bounds.start) / 60) * HOUR_H + 2;
        const height = Math.max(((s.endMin - s.startMin) / 60) * HOUR_H - 4, 44);
        const block = el("div", "session-block" + (state.selectedId === s.id ? " selected" : ""));
        block.dataset.id = s.id;
        block.style.background = s.color;
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
        block.innerHTML =
          `<div class="sb-time">${escapeHtml(s.start)}–${escapeHtml(s.end)}</div>` +
          `<div class="sb-title">${escapeHtml(s.title)}</div>` +
          `<div class="sb-kind">${escapeHtml(s.kind)}</div>`;
        block.addEventListener("click", (e) => {
          e.preventDefault();
          openPanel(s.id);
        });
        track.appendChild(block);
      }
      col.appendChild(track);
      scroll.appendChild(col);
    }

    wrap.appendChild(scroll);
    grid.appendChild(wrap);
  }

  function renderList() {
    const sessions = filteredSessions().sort((a, b) => a.startMin - b.startMin);
    const list = $("#list");
    list.innerHTML = "";
    $("#empty").classList.toggle("hidden", sessions.length > 0);
    if (!sessions.length) return;

    for (const s of sessions) {
      const item = el("div", "list-item" + (state.selectedId === s.id ? " selected" : ""));
      item.dataset.id = s.id;
      item.innerHTML =
        `<div class="list-time">${escapeHtml(s.start)}<br>${escapeHtml(s.end)}</div>` +
        `<div><div class="list-title">${escapeHtml(s.title)}</div>` +
        `<div class="list-meta">${escapeHtml(s.room)}${s.track ? " · " + escapeHtml(s.track) : ""}</div></div>` +
        `<span class="list-kind" style="background:${escapeHtml(s.color)}">${escapeHtml(s.kind)}</span>`;
      item.addEventListener("click", () => openPanel(s.id));
      list.appendChild(item);
    }
  }

  function render() {
    if (state.view === "grid") {
      $("#grid-wrap").classList.remove("hidden");
      $("#list-wrap").classList.add("hidden");
      renderGrid();
    } else {
      $("#grid-wrap").classList.add("hidden");
      $("#list-wrap").classList.remove("hidden");
      renderList();
    }
  }

  function buildDayTabs() {
    const nav = $("#day-tabs");
    nav.innerHTML = "";
    for (const day of data.meta.days) {
      const btn = el("button", "day-tab" + (day === state.day ? " active" : ""));
      const label = data.meta.dayLabels[day] || day;
      btn.textContent = label.split(",")[0];
      btn.title = label;
      btn.addEventListener("click", () => {
        state.day = day;
        closePanel();
        document.querySelectorAll(".day-tab").forEach((t) => t.classList.remove("active"));
        btn.classList.add("active");
        render();
      });
      nav.appendChild(btn);
    }
  }

  function fillFilters() {
    for (const t of data.meta.types) $("#filter-type").appendChild(new Option(t, t));
    for (const t of data.meta.tracks) $("#filter-track").appendChild(new Option(t, t));
    for (const r of data.meta.rooms) $("#filter-room").appendChild(new Option(r, r));
  }

  function toIcs(sessions) {
    const tz = data.meta.tz || "Europe/Madrid";
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//webevents//ECOC programme//EN",
      "CALSCALE:GREGORIAN", "X-WR-CALNAME:ECOC 2026 selection",
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    for (const s of sessions) {
      const start = s.day.replace(/-/g, "") + "T" + s.start.replace(":", "") + "00";
      const end = s.day.replace(/-/g, "") + "T" + s.end.replace(":", "") + "00";
      lines.push(
        "BEGIN:VEVENT", `UID:ecoc2026-s${s.id}@webevents`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${tz}:${start}`, `DTEND;TZID=${tz}:${end}`,
        `SUMMARY:${icsEscape(s.title)}`,
        `LOCATION:${icsEscape(s.room + (data.meta.venue ? ", " + data.meta.venue : ""))}`,
        `DESCRIPTION:${icsEscape([s.kind, s.track, s.url].filter(Boolean).join("\\n"))}`,
        "END:VEVENT"
      );
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;")
      .replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function downloadIcs(sessions, filename) {
    const blob = new Blob([toIcs(sessions)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function scheduledSessions() {
    return [...schedule].map(sessionById).filter(Boolean)
      .sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin);
  }

  function openScheduledSession(s) {
    $("#schedule-modal").classList.add("hidden");
    state.day = s.day;
    buildDayTabs();
    render();
    openPanel(s.id);
  }

  function renderScheduleList(items) {
    const list = $("#schedule-list");
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = '<p class="muted">No sessions saved yet. Click a session and use “Add to my schedule”.</p>';
      return;
    }
    for (const s of items) {
      const row = el("div", "schedule-item");
      row.innerHTML =
        `<div class="list-time">${escapeHtml(s.start)}</div>` +
        `<div><div class="list-title">${escapeHtml(s.title)}</div>` +
        `<div class="list-meta">${escapeHtml(s.dayLabel)} · ${escapeHtml(s.room)}</div></div>`;
      row.addEventListener("click", () => openScheduledSession(s));
      list.appendChild(row);
    }
  }

  function renderScheduleCalendar(items) {
    const container = $("#schedule-calendar");
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = '<p class="muted">No sessions saved yet. Click a session and use “Add to my schedule”.</p>';
      return;
    }

    const days = data.meta.days.filter((d) => items.some((s) => s.day === d));
    const bounds = dayBounds(items);
    const totalH = ((bounds.end - bounds.start) / 60) * HOUR_H;
    const byDay = Object.fromEntries(days.map((d) => [d, items.filter((s) => s.day === d)]));

    const wrap = el("div", "schedule-week-wrap");
    const grid = el("div", "schedule-week");

    const axis = el("div", "time-axis");
    for (let min = bounds.start; min < bounds.end; min += 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      axis.appendChild(el("div", "time-label",
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`));
    }
    grid.appendChild(axis);

    const scroll = el("div", "rooms-scroll");
    for (const day of days) {
      const col = el("div", "cal-day-column");
      const label = data.meta.dayLabels[day] || day;
      const parts = label.split(", ");
      const header = el("div", "cal-day-header");
      header.innerHTML =
        `<div class="cal-weekday">${escapeHtml(parts[0] || "")}</div>` +
        `<div class="cal-date">${escapeHtml(parts.slice(1).join(", ") || day)}</div>`;
      col.appendChild(header);

      const track = el("div", "cal-day-track");
      track.style.height = `${totalH}px`;

      for (const s of byDay[day]) {
        const top = ((s.startMin - bounds.start) / 60) * HOUR_H + 2;
        const height = Math.max(((s.endMin - s.startMin) / 60) * HOUR_H - 4, 36);
        const block = el("div", "cal-event-block");
        block.style.background = s.color;
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
        block.innerHTML =
          `<div class="sb-time">${escapeHtml(s.start)}–${escapeHtml(s.end)}</div>` +
          `<div class="sb-title">${escapeHtml(s.title)}</div>` +
          `<div class="sb-room">${escapeHtml(s.room)}</div>`;
        block.addEventListener("click", () => openScheduledSession(s));
        track.appendChild(block);
      }
      col.appendChild(track);
      scroll.appendChild(col);
    }

    grid.appendChild(scroll);
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  function renderScheduleModal() {
    const items = scheduledSessions();
    const card = $("#schedule-modal").querySelector(".modal-card");
    const isCal = scheduleView === "calendar";

    card.classList.toggle("calendar-mode", isCal);
    $("#schedule-view-list").classList.toggle("active", !isCal);
    $("#schedule-view-calendar").classList.toggle("active", isCal);
    $("#schedule-list").classList.toggle("hidden", isCal);
    $("#schedule-calendar").classList.toggle("hidden", !isCal);

    if (isCal) renderScheduleCalendar(items);
    else renderScheduleList(items);
  }

  function init() {
    $("#conf-title").textContent = data.meta.title || "Conference Programme";
    $("#conf-venue").textContent = data.meta.venue || "";
    buildDayTabs();
    fillFilters();
    updateScheduleBadge();

    if (isMobile()) {
      state.view = "list";
      $("#view-list").classList.add("active");
      $("#view-grid").classList.remove("active");
    }

    render();
    updateFiltersButton();

    $("#search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
    $("#filter-type").addEventListener("change", (e) => {
      state.type = e.target.value;
      render();
      updateFiltersButton();
    });
    $("#filter-track").addEventListener("change", (e) => {
      state.track = e.target.value;
      render();
      updateFiltersButton();
    });
    $("#filter-room").addEventListener("change", (e) => {
      state.room = e.target.value;
      render();
      updateFiltersButton();
    });
    $("#btn-clear").addEventListener("click", () => {
      state.search = state.type = state.track = state.room = "";
      $("#search").value = "";
      $("#filter-type").value = $("#filter-track").value = $("#filter-room").value = "";
      render();
      updateFiltersButton();
    });
    $("#btn-filters").addEventListener("click", () => {
      $("#filters-panel").classList.toggle("open");
      updateFiltersButton();
    });

    $("#view-grid").addEventListener("click", () => {
      state.view = "grid";
      $("#view-grid").classList.add("active");
      $("#view-list").classList.remove("active");
      render();
    });
    $("#view-list").addEventListener("click", () => {
      state.view = "list";
      $("#view-list").classList.add("active");
      $("#view-grid").classList.remove("active");
      render();
    });

    $("#panel-close").addEventListener("click", closePanel);
    $("#panel-save").addEventListener("click", () => {
      if (!state.selectedId) return;
      if (schedule.has(state.selectedId)) schedule.delete(state.selectedId);
      else schedule.add(state.selectedId);
      saveSchedule();
      renderPanel(state.selectedId);
    });
    $("#panel-export").addEventListener("click", () => {
      const s = sessionById(state.selectedId);
      if (s) downloadIcs([s], `ecoc-${s.ref || s.id}.ics`);
    });

    $("#btn-schedule").addEventListener("click", () => {
      renderScheduleModal();
      $("#schedule-modal").classList.remove("hidden");
    });
    $("#schedule-view-list").addEventListener("click", () => {
      scheduleView = "list";
      localStorage.setItem("ecoc2026-schedule-view", scheduleView);
      renderScheduleModal();
    });
    $("#schedule-view-calendar").addEventListener("click", () => {
      scheduleView = "calendar";
      localStorage.setItem("ecoc2026-schedule-view", scheduleView);
      renderScheduleModal();
    });
    $("#schedule-modal").querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => $("#schedule-modal").classList.add("hidden"));
    });
    $("#schedule-export-all").addEventListener("click", () => {
      const items = [...schedule].map(sessionById).filter(Boolean);
      if (items.length) downloadIcs(items, "ecoc-my-schedule.ics");
    });
    $("#schedule-clear").addEventListener("click", () => {
      schedule.clear();
      saveSchedule();
      renderScheduleModal();
      render();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#schedule-modal").classList.contains("hidden")) $("#schedule-modal").classList.add("hidden");
      else closePanel();
    });
  }

  init();
})();
