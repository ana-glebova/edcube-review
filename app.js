(async () => {
  const SB_URL = "https://wfjhismpvbcxdhcoslho.supabase.co";
  const SB_KEY = "sb_publishable_4aCRhVvin3qEsMZB-URi8Q_U34pJPeg";
  const params = new URLSearchParams(location.search);
  const TOKEN = params.get("t") || "";
  const listEl = document.getElementById("list");
  if (!/^[0-9a-f-]{36}$/i.test(TOKEN)) {
    listEl.innerHTML = `<p class="empty">Откройте форму по персональной ссылке, которую вам прислали.</p>`;
    return;
  }
  // Данные урока — статика (GitHub Pages / Vercel public); доступ и ответы — через Supabase.
  // Так анкета не зависит от vercel.app, который в РФ часто не открывается без VPN.
  const RUN_Q = params.get("run") || "docx-clean-2026-10-15";
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(RUN_Q)) {
    listEl.innerHTML = `<p class="empty">Ссылка недействительна. Напишите, кто её прислал.</p>`;
    return;
  }
  let DATA;
  try {
    const whoRes = await fetch(`${SB_URL}/rest/v1/rpc/review_load`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: TOKEN, p_run: RUN_Q }),
    });
    if (whoRes.status === 400 || whoRes.status === 401 || whoRes.status === 403) {
      listEl.innerHTML = `<p class="empty">Ссылка недействительна. Напишите, кто её прислал.</p>`;
      return;
    }
    if (!whoRes.ok) throw new Error(whoRes.status);
    const who = await whoRes.json();
    const dataRes = await fetch(`data/${encodeURIComponent(RUN_Q)}.json`, { cache: "no-store" });
    if (dataRes.status === 404) {
      listEl.innerHTML = `<p class="empty">Этот прогон ещё не выложен в форму. Напишите, кто прислал ссылку.</p>`;
      return;
    }
    if (!dataRes.ok) throw new Error(dataRes.status);
    const payload = await dataRes.json();
    DATA = { ...payload, run: RUN_Q, reviewer: who.reviewer, verdicts: who.verdicts || {} };
  } catch (e) {
    listEl.innerHTML = `<p class="empty">Не удалось загрузить форму. Обновите страницу через минуту.</p>`;
    return;
  }
  const RUN = DATA.run;
  const CODES = [
    ["", "— код ошибки —"],
    ["TYPE", "TYPE — не тот шаблон"],
    ["KEY", "KEY — неверный или пустой ключ"],
    ["LEAK", "LEAK — ученик видит ответ или заметку учителю"],
    ["LOST", "LOST — текст или задание потеряно"],
    ["SPLIT", "SPLIT — задание разрезано или склеено неверно"],
    ["SECTION", "SECTION — не та секция / секции разбиты неверно"],
    ["INSTR-BODY", "INSTR-BODY — граница инструкция / текст"],
    ["NOTE", "NOTE — заметка учителю не там или не так"],
    ["MEDIA", "MEDIA — нет картинки / аудио"],
    ["TABLE", "TABLE — таблица потеряла структуру"],
    ["FORMAT", "FORMAT — разметка, лишние символы"],
    ["OTHER", "OTHER — другое (опишите)"],
  ];
  const VLABEL = { ok: "Верно", partial: "Частично", bad: "Неверно" };
  const state = { lesson: DATA.lessons[0].key, filter: "all", v: {} };
  const QKEY = `review-pending:${RUN}`;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Жирное, курсив, подчёркивание, зачёркивание и перенос — как оформление, остальные теги остаются текстом.
  const formatRe = () => /&lt;(\/?)(strong|em|u|s|b|i|del|strike)\s*\/?&gt;|&lt;(br)\s*\/?&gt;/gi;
  const asFormat = (_, slash, tag, br) => (br ? "<br>" : `<${slash || ""}${tag.toLowerCase()}>`);
  const rich = s => esc(s).replace(formatRe(), asFormat);
  const showHtml = html => String(html ?? "").replace(formatRe(), asFormat);
  const docId = id => id.replace(/[^A-Za-z0-9_-]/g, "-");
  const local = {
    pending() { try { return JSON.parse(localStorage.getItem(QKEY) || "{}"); } catch { return {}; } },
    setPending(p) { try { localStorage.setItem(QKEY, JSON.stringify(p)); } catch {} },
  };
  const splitKey = lesson => `split:${lesson}`;
  const lessonOf = key => DATA.lessons.find(l => l.key === key);
  const keysOf = lesson => [splitKey(lesson), ...DATA.items.filter(i => i.lesson === lesson).map(i => i.id)];
  const hintMismatch = i => {
    const want = i.expected.filter(x => !x.startsWith("?"));
    if (!want.length) return false;
    const got = new Set(i.parts.map(p => p.tpl));
    return !want.every(x => got.has(x));
  };

  function tabs() {
    document.getElementById("tabs").innerHTML = DATA.lessons.map(l => {
      const ks = keysOf(l.key), done = ks.filter(k => state.v[k]?.verdict).length;
      return `<button class="tab" data-l="${esc(l.key)}" aria-pressed="${l.key === state.lesson}">${esc(l.name)} · ${done}/${ks.length}</button>`;
    }).join("");
  }

  function stats() {
    const ks = keysOf(state.lesson), c = { ok: 0, partial: 0, bad: 0 };
    ks.forEach(k => { const v = state.v[k]?.verdict; if (v) c[v]++; });
    const n = ks.length || 1, todo = ks.length - c.ok - c.partial - c.bad;
    document.getElementById("stats").innerHTML =
      `<span>Всего <b>${ks.length}</b></span><span>Верно <b>${c.ok}</b></span><span>Частично <b>${c.partial}</b></span><span>Неверно <b>${c.bad}</b></span><span>Не проверено <b>${todo}</b></span>`;
    document.getElementById("bar").innerHTML =
      `<i style="width:${c.ok / n * 100}%;background:var(--ok)"></i><i style="width:${c.partial / n * 100}%;background:var(--part)"></i><i style="width:${c.bad / n * 100}%;background:var(--bad)"></i>`;
  }

  function visible(i) {
    if (i.lesson !== state.lesson) return false;
    const v = state.v[i.id]?.verdict;
    if (state.filter === "todo") return !v;
    if (state.filter === "issues") return v === "partial" || v === "bad";
    if (state.filter === "hint") return hintMismatch(i);
    return true;
  }

  function verdictRow(key, withCode = true) {
    const v = state.v[key] || {};
    const opts = CODES.map(([k, t]) => `<option value="${k}" ${v.code === k ? "selected" : ""}>${esc(t)}</option>`).join("");
    const detail = v.verdict === "partial" || v.verdict === "bad";
    return `<div class="vrow" data-k="${esc(key)}" data-v="${v.verdict || ""}">
        <div class="row">
          <div class="seg" role="group" aria-label="Оценка">
            ${["ok", "partial", "bad"].map(k => `<button data-v="${k}" aria-pressed="${v.verdict === k}">${VLABEL[k]}</button>`).join("")}
          </div>
          ${withCode ? `<select aria-label="Код ошибки" ${detail ? "" : "hidden"}>${opts}</select>` : ""}
          <span class="saved" id="st-${docId(key)}"></span>
        </div>
        <textarea placeholder="${detail ? "Что не так и как должно быть" : "Комментарий (необязательно)"}">${esc(v.comment || "")}</textarea>
      </div>`;
  }

  function splitCard() {
    const l = lessonOf(state.lesson), v = state.v[splitKey(l.key)] || {};
    const secs = l.split.map((s, n) => `<h3>${n + 1}. ${esc(s.name)}</h3>
      <ol>${s.rows.map(r => `<li>${rich(r.label)} <span>· ${r.tpls.map(esc).join(" + ")}</span></li>`).join("") || "<li class='miss'>заданий нет</li>"}</ol>
      ${s.left.length ? `<details><summary class="diff">Не вошло в урок: ${s.left.length} строк</summary><div class="src">${s.left.map(x => `<p>${esc(x)}</p>`).join("")}</div></details>` : ""}`).join("");
    const extra = [
      l.outside.length ? `Текст вне всех секций: ${l.outside.length} строк` : "",
      l.lost.length ? `Задание не выделилось: ${l.lost.map(esc).join("; ")}` : "",
    ].filter(Boolean).map(x => `<div>${x}</div>`).join("");
    return `<article class="card split" data-v="${v.verdict || ""}">
      <div class="head"><span class="stl">Секции урока</span></div>
      <p class="sub">Названий секций в исходнике нет — конструктор разбил урок и назвал секции сам. Проверьте: логично ли разбито, понятны ли названия, те ли задания в каждой секции, ничего ли не потеряно. «Не вошло в урок» — строки исходника, которых нет ни в одном задании.</p>
      ${extra ? `<div class="tplbox" style="display:block">${extra}</div>` : ""}
      <div class="scol">${secs}</div>
      <div class="verdict">${verdictRow(splitKey(l.key), false)}</div>
    </article>`;
  }

  function card(i) {
    const v = state.v[i.id] || {};
    const got = i.parts.map((p, n) => `${n + 1}. ${esc(p.tpl)}`).join(" &nbsp; ") || "<i>пусто</i>";
    const hint = i.hint ? `${esc(i.hint)} → ${i.expected.map(esc).join(" + ")}` : "<i>не указан</i>";
    const parts = i.parts.map((p, n) => `<div class="part"><div class="tpl">Шаблон ${n + 1} · ${esc(p.tpl)}</div>${p.title ? `<div class="ptitle">${rich(p.title)}</div>` : ""}<div class="tbl">${p.html ? showHtml(p.html) : "<i>пусто</i>"}</div></div>`).join("") || "<p class='miss'>пусто</p>";
    return `<article class="card" data-id="${esc(i.id)}" data-v="${v.verdict || ""}">
      <div class="head"><span class="label">${rich(i.label)}</span>${hintMismatch(i) ? `<span class="chip flag">шаблон не как в оригинале</span>` : ""}</div>
      <dl class="tplbox">
        <dt>Шаблон в оригинале</dt><dd>${hint}</dd>
        <dt>Выбрано</dt><dd><b>${got}</b></dd>
        <dt>Почему</dt><dd>${esc(i.why) || "—"}</dd>
      </dl>
      <div class="cols">
        <div><div class="cap">Исходник</div><div class="src">${i.src.map(s => `<p>${rich(s)}</p>`).join("")}</div></div>
        <div><div class="cap">В конструкторе</div><div class="res">${parts}</div></div>
      </div>
      <div class="verdict">${verdictRow(i.id)}</div>
    </article>`;
  }

  function render() {
    tabs(); stats();
    const items = DATA.items.filter(visible);
    let html = splitCard(), sec = "";
    if (!items.length) html += `<p class="empty">Под этот фильтр задания не подходят.</p>`;
    for (const i of items) {
      if (i.section !== sec) { sec = i.section; html += `<h2 class="sec">${esc(sec)}</h2>`; }
      html += card(i);
    }
    document.getElementById("list").innerHTML = html;
  }

  const timers = {};
  // Несохранённое лежит в очереди браузера и досылается, пока сервер не подтвердит запись.
  async function persist(key) {
    const v = state.v[key], st = document.getElementById("st-" + docId(key));
    const pend = local.pending(); pend[key] = v; local.setPending(pend);
    try {
      if (st) st.textContent = "сохраняю…";
      const r = await fetch(`${SB_URL}/rest/v1/rpc/review_save`, {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token: TOKEN, p_run: RUN, p_item: key, p_verdict: v.verdict || "", p_code: v.code || "", p_comment: v.comment || "" }),
      });
      if (!r.ok) throw new Error(r.status);
      const p2 = local.pending();
      if (JSON.stringify(p2[key]) === JSON.stringify(v)) { delete p2[key]; local.setPending(p2); }
      if (st) st.textContent = "сохранено";
      notice();
    } catch (e) {
      if (st) st.textContent = "нет связи — сохраню, когда появится";
      notice();
    }
  }
  function notice() {
    const n = document.getElementById("notice"), k = Object.keys(local.pending()).length;
    n.hidden = !k;
    n.textContent = k ? `Не отправлено на сервер: ${k}. Не закрывайте страницу — отправлю автоматически.` : "";
  }
  setInterval(() => { for (const k of Object.keys(local.pending())) if (!timers[k]) persist(k); }, 15000);
  window.addEventListener("beforeunload", e => { if (Object.keys(local.pending()).length) { e.preventDefault(); e.returnValue = ""; } });
  function setV(key, patch, delay) {
    state.v[key] = { ...(state.v[key] || {}), ...patch };
    const pend = local.pending(); pend[key] = state.v[key]; local.setPending(pend);
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => { delete timers[key]; persist(key); }, delay);
  }

  document.addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (tab) { state.lesson = tab.dataset.l; render(); window.scrollTo(0, 0); return; }
    const f = e.target.closest(".flt");
    if (f) { state.filter = f.dataset.f; document.querySelectorAll(".flt").forEach(b => b.setAttribute("aria-pressed", b === f)); render(); return; }
    const b = e.target.closest(".seg button");
    if (b) {
      const row = b.closest(".vrow"), key = row.dataset.k;
      const next = state.v[key]?.verdict === b.dataset.v ? "" : b.dataset.v;
      setV(key, { verdict: next, ...(next === "ok" ? { code: "" } : {}) }, 0);
      row.dataset.v = next; row.closest(".card").dataset.v = next;
      row.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === next));
      const sel = row.querySelector("select"), detail = next === "partial" || next === "bad";
      if (sel) { sel.hidden = !detail; if (next === "ok") sel.value = ""; }
      row.querySelector("textarea").placeholder = detail ? "Что не так и как должно быть" : "Комментарий (необязательно)";
      tabs(); stats();
    }
  });
  document.addEventListener("change", e => {
    if (e.target.matches(".vrow select")) setV(e.target.closest(".vrow").dataset.k, { code: e.target.value }, 0);
  });
  document.addEventListener("input", e => {
    if (e.target.matches(".vrow textarea")) setV(e.target.closest(".vrow").dataset.k, { comment: e.target.value }, 800);
  });

  state.v = { ...(DATA.verdicts || {}), ...local.pending() };
  render(); notice();
  for (const k of Object.keys(local.pending())) persist(k);
})();
