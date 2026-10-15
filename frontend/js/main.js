// Connect the dashboard panels and reload them when filters change.
const state = {
  hourly: [],
  daily: [],
  boroughs: [],
  geo: null,
};

function el(id) {
  return document.getElementById(id);
}

async function loadKpis(params) {
  const summary = await App.api("summary", params);
  const tiles = [
    ["Trips", App.fmt.int(summary.trips)],
    ["Revenue", App.fmt.compactMoney(summary.revenue)],
    ["Average fare", App.fmt.money(summary.avg_fare)],
    ["Average distance", App.fmt.num(summary.avg_distance, 2) + " mi"],
    ["Average duration", App.fmt.num(summary.avg_duration) + " min"],
    ["Average speed", App.fmt.num(summary.avg_speed) + " mph"],
    ["Tip (card)", App.fmt.pct(summary.avg_tip_pct)],
    ["Airport trips", App.fmt.pct(summary.airport_share)],
  ];

  let html = "";
  for (const tile of tiles) {
    html += `<div class="kpi"><div class="label">${tile[0]}</div><div class="value">${tile[1]}</div></div>`;
  }
  el("kpis").innerHTML = html;
}

async function loadTopZones(params) {
  const metric = el("top-metric").value;
  const query = Object.assign({}, params);
  query.metric = metric;
  query.k = el("top-k").value;

  const response = await App.api("zones/top", query);
  const metricInfo = App.METRICS[metric];
  const field = metricInfo.field || metric;
  let highest = 1;
  for (const row of response.rows) {
    highest = Math.max(highest, row[field] || 0);
  }

  let html = "";
  for (let index = 0; index < response.rows.length; index++) {
    const row = response.rows[index];
    const width = Math.max(2, (100 * (row[field] || 0)) / highest);
    html += `
    <li>
      <span class="pos">${index + 1}</span>
      <div>
        <div class="name">${App.escape(row.zone)}<small>${App.escape(row.borough)}</small></div>
        <div class="bar" style="width:${width}%"></div>
      </div>
      <span class="val">${metricInfo.fmt(row[field])}</span>
    </li>`;
  }
  if (html === "") {
    html = '<li class="note">Not enough trips for a ranking.</li>';
  }
  el("top-zones").innerHTML = html;
}

async function loadFlows(params) {
  const query = Object.assign({}, params);
  query.k = 8;
  const rows = await App.api("flows", query);
  let html = "";
  for (const row of rows) {
    html += `<tr><td>${App.escape(row.origin)}</td><td>${App.escape(row.destination)}</td>
    <td class="num">${App.fmt.int(row.trips)}</td><td class="num">${App.fmt.money(row.avg_fare)}</td>
    <td class="num">${App.fmt.num(row.avg_duration)}</td></tr>`;
  }
  el("flows").innerHTML = html;
}

async function loadQuality() {
  const quality = await App.api("quality");
  const groups = { dropped: [], flagged: [] };
  let highest = 1;
  for (const row of quality.log) {
    highest = Math.max(highest, row.record_count);
    if (row.action === "dropped" && row.record_count > 0) {
      groups.dropped.push(row);
    } else if (row.action === "flagged" && row.record_count > 0) {
      groups.flagged.push(row);
    }
  }

  const colors = {
    dropped: App.css("--series-8"),
    flagged: App.css("--series-4"),
  };
  function section(name, title) {
    if (groups[name].length === 0) {
      return "";
    }

    let html = "<h3>" + title + "</h3>";
    for (const row of groups[name]) {
      const width = (100 * row.record_count) / highest;
      html += `
    <div class="quality-row" title="${App.escape(row.description)}">
      <span>${App.escape(row.description)}</span>
      <span class="track"><span class="fill" style="display:block;width:${width}%;background:${colors[name]}"></span></span>
      <span class="count">${App.fmt.int(row.record_count)}</span>
    </div>`;
    }
    return html;
  }

  el("quality").innerHTML = '<div class="quality">' +
    section("dropped", "Dropped") + section("flagged", "Kept but flagged") + "</div>";

  if (quality.raw_rows) {
    const droppedPercent = (100 * quality.dropped_rows) / quality.raw_rows;
    el("quality-note").textContent =
      App.fmt.int(quality.raw_rows) + " raw records → " +
      App.fmt.int(quality.kept_rows) + " kept (" +
      App.fmt.pct(droppedPercent) + " dropped).";
  }
}

// Each loader saves its data so metric and theme changes can redraw it.
async function loadHourly(params) {
  const rows = await App.api("stats/hourly", params);
  state.hourly = rows;
  App.drawHeatmap(rows, el("heat-metric").value);
}

async function loadDaily(params) {
  const rows = await App.api("stats/daily", params);
  state.daily = rows;
  App.drawDaily(rows, el("daily-metric").value);
}

async function loadBoroughs(params) {
  const rows = await App.api("stats/boroughs", params);
  state.boroughs = rows;
  App.drawBoroughs(rows, el("borough-metric").value);
}

async function loadSpeed(params) {
  const rows = await App.api("stats/speed_by_hour", params);
  state.speed = rows;
  App.drawSpeed(rows);
}

async function loadMap(params) {
  const geo = await App.api("zones/geo", params);
  state.geo = geo;
  App.map.render(geo, el("map-metric").value);
}

async function refresh() {
  const params = App.filters.params();
  document.body.classList.add("busy");
  const jobs = [
    loadKpis(params),
    loadHourly(params),
    loadDaily(params),
    loadBoroughs(params),
    loadSpeed(params),
    loadMap(params),
    loadTopZones(params),
    loadFlows(params),
  ];
  App.table.page = 1;
  jobs.push(App.table.load());

  // Let the other panels finish even when one request fails.
  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(result.reason);
    }
  }
  document.body.classList.remove("busy");
}

function redrawAll() {
  App.drawHeatmap(state.hourly, el("heat-metric").value);
  App.drawDaily(state.daily, el("daily-metric").value);
  App.drawBoroughs(state.boroughs, el("borough-metric").value);
  if (state.speed) {
    App.drawSpeed(state.speed);
  }
  App.map.setTiles();
  App.map.render(null, el("map-metric").value);
  loadQuality();
}

function initTheme() {
  const button = el("theme-toggle");
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("theme");
  } catch (error) {
    // The dashboard still works when browser storage is unavailable.
  }
  if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
  }

  function updateLabel() {
    if (App.isDark()) {
      button.textContent = "Light mode";
    } else {
      button.textContent = "Dark mode";
    }
  }
  updateLabel();

  button.onclick = function () {
    let nextTheme = "dark";
    if (App.isDark()) {
      nextTheme = "light";
    }
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem("theme", nextTheme);
    } catch (error) {
      // Saving the preference is optional.
    }
    updateLabel();
    redrawAll();
  };
}

document.addEventListener("DOMContentLoaded", async function () {
  initTheme();
  App.map.init();
  App.table.init();

  el("heat-metric").onchange = function () {
    App.drawHeatmap(state.hourly, el("heat-metric").value);
  };
  el("daily-metric").onchange = function () {
    App.drawDaily(state.daily, el("daily-metric").value);
  };
  el("borough-metric").onchange = function () {
    App.drawBoroughs(state.boroughs, el("borough-metric").value);
  };
  el("map-metric").onchange = function () {
    App.map.render(null, el("map-metric").value);
  };
  el("top-metric").onchange = function () {
    loadTopZones(App.filters.params());
  };
  el("top-k").onchange = function () {
    loadTopZones(App.filters.params());
  };

  try {
    await App.filters.init(refresh);
  } catch (error) {
    el("kpis").innerHTML = `<p class="error">Could not reach the API: ${App.escape(error.message)}. Run the pipeline, then start backend/app.py.</p>`;
    return;
  }
  loadQuality();
  refresh();
});
