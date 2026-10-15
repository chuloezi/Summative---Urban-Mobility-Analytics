// Draw the Chart.js charts and the weekday/hour heatmap.
App.charts = {};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function baseOptions(yLabel, formatValue) {
  const mutedColor = App.css("--muted");
  const gridColor = App.css("--grid");

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: App.css("--text-2"),
          boxWidth: 12,
          boxHeight: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: App.css("--surface"),
        titleColor: App.css("--text"),
        bodyColor: App.css("--text"),
        borderColor: App.css("--border"),
        borderWidth: 1,
        padding: 8,
        callbacks: {
          label: function (context) {
            let value = context.parsed.y;
            if (value == null) {
              value = context.parsed.x;
            }
            return " " + context.dataset.label + ": " + formatValue(value);
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: mutedColor },
        grid: { display: false },
        border: { color: App.css("--axis") },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: mutedColor,
          callback: function (value) {
            return formatValue(value);
          },
        },
        grid: { color: gridColor },
        border: { display: false },
        title: { display: !!yLabel, text: yLabel, color: mutedColor },
      },
    },
  };
}

function draw(id, config) {
  if (App.charts[id]) {
    App.charts[id].destroy();
  }
  App.charts[id] = new Chart(document.getElementById(id), config);
}

App.drawSpeed = function (rows) {
  const boroughNames = new Set();
  for (const row of rows) {
    boroughNames.add(row.borough);
  }

  // Keep the same color for each borough when filters change.
  const colorOrder = ["Manhattan", "Queens", "Brooklyn", "Bronx", "Staten Island", "EWR"];
  const hours = [];
  const labels = [];
  for (let hour = 0; hour < 24; hour++) {
    hours.push(hour);
    labels.push(hour + ":00");
  }

  const datasets = [];
  for (const borough of boroughNames) {
    if (borough === "Unknown") {
      continue;
    }

    let colorIndex = colorOrder.indexOf(borough);
    if (colorIndex < 0) {
      colorIndex = colorOrder.length;
    }

    const speedByHour = new Map();
    for (const row of rows) {
      if (row.borough === borough) {
        speedByHour.set(row.pickup_hour, row.avg_speed_mph);
      }
    }

    const speeds = [];
    for (const hour of hours) {
      let speed = speedByHour.get(hour);
      if (speed == null) {
        speed = null;
      }
      speeds.push(speed);
    }

    const color = App.seriesColor(colorIndex);
    datasets.push({
      label: borough,
      data: speeds,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.25,
      spanGaps: true,
    });
  }

  draw("speed-chart", {
    type: "line",
    data: { labels: labels, datasets: datasets },
    options: baseOptions("mph", function (value) {
      return App.fmt.num(value);
    }),
  });
};

App.drawDaily = function (rows, metric) {
  let formatValue = App.fmt.int;
  let label = "Trips";
  let note = "Trips per day. Weekends are labeled Sat and Sun.";
  if (metric === "revenue") {
    formatValue = App.fmt.compactMoney;
    label = "Revenue";
    note = "Total amount charged per day.";
  }

  const labels = [];
  const values = [];
  for (const row of rows) {
    const date = new Date(row.pickup_date + "T00:00:00");
    const weekday = DAYS[(date.getDay() + 6) % 7];
    labels.push(weekday + " " + row.pickup_date.slice(5));
    values.push(row[metric]);
  }

  const options = baseOptions("", formatValue);
  options.plugins.legend.display = false;
  options.scales.x.ticks.maxRotation = 0;
  options.scales.x.ticks.autoSkipPadding = 12;

  draw("daily-chart", {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: values,
        backgroundColor: App.css("--series-1"),
        borderRadius: 4,
        borderSkipped: "start",
      }],
    },
    options: options,
  });
  document.getElementById("daily-note").textContent = note;
};

App.drawBoroughs = function (rows, metric) {
  const metricInfo = App.METRICS[metric];
  const validRows = [];
  for (const row of rows) {
    if (row.borough !== "Unknown" && row[metric] != null) {
      validRows.push(row);
    }
  }
  validRows.sort(function (first, second) {
    return second[metric] - first[metric];
  });

  const labels = [];
  const values = [];
  for (const row of validRows) {
    labels.push(row.borough);
    values.push(row[metric]);
  }

  const options = baseOptions("", metricInfo.fmt);
  options.indexAxis = "y";
  options.plugins.legend.display = false;
  options.interaction = { mode: "nearest", axis: "y", intersect: false };
  options.plugins.tooltip.callbacks.label = function (context) {
    const trips = App.fmt.int(validRows[context.dataIndex].trips);
    return " " + metricInfo.label + ": " + metricInfo.fmt(context.parsed.x) + "  (" + trips + " trips)";
  };
  options.scales = {
    x: {
      beginAtZero: true,
      ticks: {
        color: App.css("--muted"),
        callback: function (value) {
          return metricInfo.fmt(value);
        },
      },
      grid: { color: App.css("--grid") },
      border: { display: false },
    },
    y: {
      ticks: { color: App.css("--text-2") },
      grid: { display: false },
      border: { color: App.css("--axis") },
    },
  };

  draw("borough-chart", {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: metricInfo.label,
        data: values,
        backgroundColor: App.css("--series-1"),
        borderRadius: 4,
        borderSkipped: "start",
        barPercentage: 0.7,
      }],
    },
    options: options,
  });
};

App.drawHeatmap = function (rows, metric) {
  const heatmap = document.getElementById("heatmap");
  const ramp = App.seqRamp();
  const values = [];
  const lookup = new Map();
  for (const row of rows) {
    values.push(row[metric]);
    lookup.set(row.day_of_week + "-" + row.pickup_hour, row);
  }
  const breaks = App.breaks(values, ramp.length);

  let html = "<div></div>";
  for (let hour = 0; hour < 24; hour++) {
    let label = "";
    if (hour % 3 === 0) {
      label = hour;
    }
    html += '<div class="collab">' + label + "</div>";
  }

  for (let day = 0; day < 7; day++) {
    html += '<div class="rowlab">' + DAYS[day] + "</div>";
    for (let hour = 0; hour < 24; hour++) {
      const row = lookup.get(day + "-" + hour);
      let value = null;
      if (row) {
        value = row[metric];
      }
      let color = App.css("--seq-empty");
      if (value != null) {
        color = ramp[App.classify(value, breaks)];
      }
      html += `<div class="cell" style="background:${color}" data-d="${day}" data-h="${hour}"></div>`;
    }
  }
  heatmap.innerHTML = html;

  heatmap.onmousemove = function (event) {
    const cell = event.target.closest(".cell");
    if (!cell) {
      return App.hideTip();
    }

    const day = cell.dataset.d;
    const hour = cell.dataset.h;
    const row = lookup.get(day + "-" + hour);
    let details = "No trips";
    if (row) {
      details = App.fmt.int(row.trips) + " trips<br>" +
        App.fmt.num(row.avg_speed_mph) + " mph avg<br>" +
        App.fmt.money(row.avg_fare) + " avg fare<br>" +
        App.fmt.pct(row.avg_tip_pct) + " tip";
    }
    const title = `<strong>${DAYS[day]} ${hour}:00–${hour}:59</strong><br>`;
    App.showTip(title + details, event);
  };
  heatmap.onmouseleave = App.hideTip;
};
