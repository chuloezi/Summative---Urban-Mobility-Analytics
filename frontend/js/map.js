// Show pickup zones on the Leaflet map and display a selected zone's details.
App.map = {
  map: null,
  layer: null,
  tiles: null,
  data: null,
  selected: null,

  init() {
    this.map = L.map("map", {
      zoomSnap: 0.25,
      attributionControl: true,
    }).setView([40.70, -73.94], 10.25);
    this.setTiles();
  },

  setTiles() {
    if (this.tiles) {
      this.tiles.remove();
    }
    let style = "light_all";
    if (App.isDark()) {
      style = "dark_all";
    }

    const tileUrl = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
    this.tiles = L.tileLayer(tileUrl, {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 18,
    }).addTo(this.map);
  },

  render(geo, metric) {
    if (geo) {
      this.data = geo;
    }
    if (!this.data) {
      return;
    }

    const metricInfo = App.METRICS[metric];
    const ramp = App.seqRamp();
    const values = [];
    for (const feature of this.data.features) {
      values.push(feature.properties[metric]);
    }
    const breaks = App.breaks(values, ramp.length);
    const emptyColor = App.css("--seq-empty");
    const borderColor = App.css("--surface");

    if (this.layer) {
      this.layer.remove();
    }
    this.layer = L.geoJSON(this.data, {
      style: function (feature) {
        const value = feature.properties[metric];
        let fillColor = emptyColor;
        let fillOpacity = 0.35;
        if (value != null) {
          fillColor = ramp[App.classify(value, breaks)];
          fillOpacity = 0.8;
        }
        return {
          fillColor: fillColor,
          fillOpacity: fillOpacity,
          color: borderColor,
          weight: 1,
        };
      },

      // Arrow callbacks keep "this" pointing to App.map.
      onEachFeature: (feature, layer) => {
        const properties = feature.properties;
        layer.on({
          mousemove: (event) => {
            const tooltip = `<strong>${App.escape(properties.zone)}</strong> · ${App.escape(properties.borough)}<br>${metricInfo.label}: ${metricInfo.fmt(properties[metric])}`;
            App.showTip(tooltip, event.originalEvent);
          },
          mouseout: () => {
            App.hideTip();
            if (this.selected !== layer) {
              this.layer.resetStyle(layer);
            }
          },
          mouseover: () => {
            layer.setStyle({ weight: 2.5, color: App.css("--text") });
          },
          click: () => {
            this.select(layer, properties);
          },
        });
      },
    }).addTo(this.map);

    const validValues = [];
    for (const value of values) {
      if (value != null) {
        validValues.push(value);
      }
    }

    const legend = document.getElementById("map-legend");
    if (validValues.length === 0) {
      legend.innerHTML = "";
    } else {
      const lowest = metricInfo.fmt(Math.min(...validValues));
      const highest = metricInfo.fmt(Math.max(...validValues));
      const colors = ramp.join(",");
      legend.innerHTML = `<span>${lowest}</span><span class="bar" style="background:linear-gradient(90deg,${colors})"></span><span>${highest}</span><span>· ${metricInfo.label}, quantile classes · grey = no pickups</span>`;
    }
  },

  select(layer, properties) {
    if (this.selected) {
      this.layer.resetStyle(this.selected);
    }
    this.selected = layer;
    layer.setStyle({ weight: 3, color: App.css("--text") });

    const metrics = ["pickups", "revenue", "avg_fare", "avg_fare_per_mile", "avg_speed_mph", "avg_tip_pct"];
    let details = "";
    for (const metric of metrics) {
      const metricInfo = App.METRICS[metric];
      details += `<dt>${metricInfo.label}</dt><dd>${metricInfo.fmt(properties[metric])}</dd>`;
    }

    document.getElementById("zone-detail").innerHTML = `
      <h3>${App.escape(properties.zone)}</h3>
      <p class="note">${App.escape(properties.borough)} · zone ${properties.location_id}</p>
      <dl>${details}</dl>
      <p><button class="btn ghost" type="button" id="zone-trips">Show trips from here</button></p>`;

    document.getElementById("zone-trips").onclick = () => {
      App.table.zone = properties.location_id;
      App.table.zoneName = properties.zone;
      App.table.page = 1;
      App.table.load();
      document.getElementById("trips-table").scrollIntoView({ behavior: "smooth" });
    };
  },
};
