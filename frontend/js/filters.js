// Fill the filter choices and read the values selected by the user.
App.filters = {
  form: function () {
    return document.getElementById("filters");
  },

  params() {
    const formData = new FormData(this.form());
    const params = {};
    for (const entry of formData.entries()) {
      const name = entry[0];
      const value = entry[1];
      if (value !== "") {
        params[name] = value;
      }
    }
    return params;
  },

  async init(onChange) {
    const metadata = await App.api("meta");
    const form = this.form();

    const boroughSelect = form.elements.borough;
    for (const borough of metadata.boroughs) {
      boroughSelect.add(new Option(borough, borough));
    }

    const paymentSelect = form.elements.payment_type;
    for (const payment of metadata.payment_types) {
      paymentSelect.add(new Option(payment.description, payment.id));
    }

    if (metadata.date_range && metadata.date_range.min) {
      for (const name of ["start", "end"]) {
        form.elements[name].min = metadata.date_range.min;
        form.elements[name].max = metadata.date_range.max;
      }
      document.getElementById("period-label").textContent =
        "Yellow taxi trips, " + metadata.date_range.min + " to " + metadata.date_range.max;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      onChange();
    });
    form.addEventListener("reset", function () {
      // Wait until the browser has reset the form values.
      setTimeout(onChange, 0);
    });

    form.elements.borough.addEventListener("change", onChange);
    form.elements.payment_type.addEventListener("change", onChange);
    form.elements.clean_only.addEventListener("change", onChange);
  },
};
