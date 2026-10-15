// Helpers used by the filters, charts, map, and trip table.
window.App = window.App || {};

// Send the non-empty filters to the API and read its JSON response.
App.api = async function (path, params = {}) {
  const query = new URLSearchParams();
  for (const entry of Object.entries(params)) {
    const name = entry[0];
    const value = entry[1];
    if (value !== "" && value != null) {
      query.append(name, value);
    }
  }

  let url = "/api/" + path;
  if (query.toString() !== "") {
    url += "?" + query.toString();
  }

  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || response.statusText);
  }
  return body;
};

// Keep missing values and number formatting consistent across the dashboard.
App.fmt = {
  int: function (value) {
    if (value == null) {
      return "–";
    }
    return Math.round(value).toLocaleString();
  },

  num: function (value, decimals = 1) {
    if (value == null) {
      return "–";
    }
    const options = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    };
    return Number(value).toLocaleString(undefined, options);
  },

  money: function (value, decimals = 2) {
    if (value == null) {
      return "–";
    }
    const options = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    };
    return "$" + Number(value).toLocaleString(undefined, options);
  },

  compactMoney: function (value) {
    if (value == null) {
      return "–";
    }
    const formatter = Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return "$" + formatter.format(value);
  },

  pct: function (value) {
    if (value == null) {
      return "–";
    }
    return Number(value).toFixed(1) + "%";
  },

  dt: function (dateText) {
    if (!dateText) {
      return "–";
    }
    return dateText.replace("T", " ").slice(0, 16);
  },
};

function formatSpeed(value) {
  return App.fmt.num(value) + " mph";
}

function formatDistance(value) {
  return App.fmt.num(value, 2) + " mi";
}

App.METRICS = {
  trips: { label: "Trips", fmt: App.fmt.int },
  pickups: { label: "Pickups", fmt: App.fmt.int },
  revenue: { label: "Revenue", fmt: App.fmt.compactMoney },
  avg_fare: { label: "Average fare", fmt: App.fmt.money },
  avg_fare_per_mile: { label: "Fare per mile", fmt: App.fmt.money },
  avg_speed_mph: { label: "Average speed", fmt: formatSpeed },
  avg_tip_pct: { label: "Tip % (card)", fmt: App.fmt.pct },
  avg_distance: { label: "Average distance", fmt: formatDistance },
  slowest: { label: "Average speed", fmt: formatSpeed, field: "avg_speed_mph" },
  fastest: { label: "Average speed", fmt: formatSpeed, field: "avg_speed_mph" },
};

App.css = function (name) {
  const styles = getComputedStyle(document.documentElement);
  return styles.getPropertyValue(name).trim();
};

App.isDark = function () {
  return App.css("color-scheme") === "dark";
};

// Reverse the blue shades in dark mode.
App.SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
App.seqRamp = function () {
  if (App.isDark()) {
    return App.SEQ.slice().reverse();
  }
  return App.SEQ;
};

// Find the cutoff values for equally sized groups of sorted data.
App.breaks = function (values, classes) {
  const sortedValues = [];
  for (const value of values) {
    if (value != null) {
      sortedValues.push(value);
    }
  }
  sortedValues.sort(function (first, second) {
    return first - second;
  });

  if (sortedValues.length === 0) {
    return [];
  }

  const cutoffs = [];
  for (let index = 1; index < classes; index++) {
    const position = Math.floor((index / classes) * (sortedValues.length - 1));
    cutoffs.push(sortedValues[position]);
  }
  return cutoffs;
};

App.classify = function (value, breaks) {
  let index = 0;
  while (index < breaks.length && value > breaks[index]) {
    index++;
  }
  return index;
};

App.seriesColor = function (index) {
  const colorNumber = (index % 8) + 1;
  return App.css("--series-" + colorNumber);
};

function tip() {
  return document.getElementById("tooltip");
}

App.showTip = function (html, event) {
  const tooltip = tip();
  tooltip.innerHTML = html;
  tooltip.hidden = false;

  const padding = 14;
  const bounds = tooltip.getBoundingClientRect();
  let x = event.clientX + padding;
  let y = event.clientY + padding;

  if (x + bounds.width > window.innerWidth) {
    x = event.clientX - bounds.width - padding;
  }
  if (y + bounds.height > window.innerHeight) {
    y = event.clientY - bounds.height - padding;
  }

  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
};

App.hideTip = function () {
  tip().hidden = true;
};

// Escape text before putting data from the API into HTML.
App.escape = function (value) {
  if (value == null) {
    value = "";
  }
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, function (character) {
    return replacements[character];
  });
};
