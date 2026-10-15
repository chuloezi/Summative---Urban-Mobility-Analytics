// Load the trip table, handle sorting and pages, and show trip details.
App.table = {
  sort: "pickup_datetime",
  order: "desc",
  page: 1,
  pageSize: 25,
  total: 0,
  zone: null,
  zoneName: null,

  init() {
    const headers = document.querySelectorAll("#trips-table th[data-sort]");
    for (const header of headers) {
      // Arrow callbacks keep "this" pointing to App.table.
      header.addEventListener("click", () => {
        const sortColumn = header.dataset.sort;
        if (this.sort === sortColumn && this.order === "desc") {
          this.order = "asc";
        } else {
          this.order = "desc";
        }
        this.sort = sortColumn;
        this.page = 1;
        this.load();
      });
    }

    document.getElementById("prev-page").onclick = () => {
      this.page--;
      this.load();
    };
    document.getElementById("next-page").onclick = () => {
      this.page++;
      this.load();
    };

    document.querySelector("#trips-table tbody").addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-id]");
      if (row) {
        this.detail(row.dataset.id);
      }
    });
    document.getElementById("close-modal").onclick = function () {
      document.getElementById("trip-modal").close();
    };
  },

  async load() {
    const body = document.querySelector("#trips-table tbody");
    body.classList.add("loading");

    const params = Object.assign({}, App.filters.params());
    params.sort = this.sort;
    params.order = this.order;
    params.page = this.page;
    params.page_size = this.pageSize;
    if (this.zone) {
      params.zone = this.zone;
    }

    try {
      const response = await App.api("trips", params);
      this.total = response.total;

      let html = "";
      for (const trip of response.rows) {
        let warning = "";
        if (trip.is_suspicious) {
          warning = ' <span class="flag" title="' + App.escape(trip.suspicious_reason) + '">⚠</span>';
        }
        html += `
        <tr data-id="${trip.trip_id}">
          <td>${App.fmt.dt(trip.pickup_datetime)}${warning}</td>
          <td>${App.escape(trip.pu_zone)}</td>
          <td>${App.escape(trip.do_zone)}</td>
          <td class="num">${App.fmt.num(trip.trip_distance, 2)}</td>
          <td class="num">${App.fmt.num(trip.trip_duration_min)}</td>
          <td class="num">${App.fmt.num(trip.avg_speed_mph)}</td>
          <td class="num">${App.fmt.money(trip.fare_amount)}</td>
          <td class="num">${App.fmt.money(trip.fare_per_mile)}</td>
          <td class="num">${App.fmt.pct(trip.tip_pct)}</td>
          <td class="num">${App.fmt.money(trip.total_amount)}</td>
        </tr>`;
      }
      if (html === "") {
        html = '<tr><td colspan="10" class="note">No trips match these filters.</td></tr>';
      }
      body.innerHTML = html;

      const pages = Math.max(1, Math.ceil(this.total / this.pageSize));
      document.getElementById("page-label").textContent =
        "Page " + this.page + " of " + pages.toLocaleString();
      document.getElementById("prev-page").disabled = this.page <= 1;
      document.getElementById("next-page").disabled = this.page >= pages;

      let zoneNote = "";
      if (this.zone) {
        zoneNote = ` from <strong>${App.escape(this.zoneName)}</strong> <button class="btn ghost" type="button" id="clear-zone">clear zone</button>`;
      }
      document.getElementById("trips-note").innerHTML =
        this.total.toLocaleString() + " trips" + zoneNote + ". Click a column to sort, a row for details.";

      const clearButton = document.getElementById("clear-zone");
      if (clearButton) {
        clearButton.onclick = () => {
          this.zone = null;
          this.page = 1;
          this.load();
        };
      }

      const headers = document.querySelectorAll("#trips-table th[data-sort]");
      for (const header of headers) {
        const isSorted = header.dataset.sort === this.sort;
        header.classList.toggle("sorted", isSorted);
        header.classList.toggle("asc", isSorted && this.order === "asc");
      }
    } catch (error) {
      body.innerHTML = `<tr><td colspan="10" class="error">${App.escape(error.message)}</td></tr>`;
    } finally {
      body.classList.remove("loading");
    }
  },

  async detail(id) {
    const trip = await App.api("trips/" + id);
    let timeOfDay = App.escape(trip.time_of_day);
    if (trip.is_weekend) {
      timeOfDay += " (weekend)";
    }

    let passengers = trip.passenger_count;
    if (passengers == null) {
      passengers = "unknown";
    }

    const extraCharges = (trip.extra || 0) + (trip.mta_tax || 0) +
      (trip.improvement_surcharge || 0) + (trip.congestion_surcharge || 0) +
      (trip.airport_fee || 0);

    let tipDetails = App.fmt.money(trip.tip_amount);
    if (trip.tip_pct != null) {
      tipDetails += " (" + App.fmt.pct(trip.tip_pct) + ")";
    } else {
      tipDetails += " (cash tips not recorded)";
    }

    let airportTrip = "No";
    if (trip.is_airport_trip) {
      airportTrip = "Yes";
    }
    let quality = "No issues flagged";
    if (trip.is_suspicious) {
      quality = `<span class="flag">⚠ ${App.escape(trip.suspicious_reason)}</span>`;
    }

    const rows = [
      ["Pickup", `${App.fmt.dt(trip.pickup_datetime)} · ${App.escape(trip.pu_zone)}, ${App.escape(trip.pu_borough)}`],
      ["Dropoff", `${App.fmt.dt(trip.dropoff_datetime)} · ${App.escape(trip.do_zone)}, ${App.escape(trip.do_borough)}`],
      ["Time of day", timeOfDay],
      ["Distance", `${App.fmt.num(trip.trip_distance, 2)} mi in ${App.fmt.num(trip.trip_duration_min)} min`],
      ["Average speed", App.fmt.num(trip.avg_speed_mph) + " mph"],
      ["Passengers", passengers],
      ["Vendor", App.escape(trip.vendor)],
      ["Rate code", App.escape(trip.rate_code)],
      ["Payment", App.escape(trip.payment_type)],
      ["Fare", App.fmt.money(trip.fare_amount) + " (" + App.fmt.money(trip.fare_per_mile) + "/mi)"],
      ["Extras & taxes", App.fmt.money(extraCharges)],
      ["Tolls", App.fmt.money(trip.tolls_amount)],
      ["Tip", tipDetails],
      ["Total", "<strong>" + App.fmt.money(trip.total_amount) + "</strong>"],
      ["Airport trip", airportTrip],
      ["Data quality", quality],
    ];

    let details = "";
    for (const row of rows) {
      details += "<dt>" + row[0] + "</dt><dd>" + row[1] + "</dd>";
    }
    document.getElementById("trip-detail").innerHTML =
      '<dl class="detail-grid">' + details + "</dl>";
    document.getElementById("trip-modal").showModal();
  },
};
