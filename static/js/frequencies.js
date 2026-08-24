/* Demand frequencies: how often trips run between each pair of places.
 *
 * A list of flows rather than a map. Each flow carries an hourly profile over
 * the day and a weekly one, both drawn as bars so the shape reads at a glance
 * without a charting library.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function parse(text) {
    var data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error("That file is not a list of demand flows.");
    }
    return data;
  }

  /* Bars are scaled to the largest value in their own row, so a quiet flow is
     still readable rather than a flat line next to a busy one. */
  function bars(values, labels) {
    var peak = Math.max.apply(null, values.concat([1]));
    return (
      '<div class="ap-freq-bars">' +
      values
        .map(function (value, index) {
          var height = Math.round((value / peak) * 100);
          var label = labels ? labels[index] : index + ":00";
          return (
            '<span class="ap-freq-bar" title="' + E.escapeHtml(label + ": " + value) + '">' +
            '<span class="ap-freq-bar-fill" style="height:' + Math.max(height, 2) + '%"></span>' +
            "</span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function flow(entry) {
    var hourly = Array.isArray(entry.hourly) ? entry.hourly : [];
    var weekly = Array.isArray(entry.weekly) ? entry.weekly : [];
    var total = hourly.reduce(function (sum, value) {
      return sum + value;
    }, 0);

    return (
      '<div class="ap-freq-flow">' +
      '<div class="ap-freq-head">' +
      '<span class="ap-freq-route">' +
      E.escapeHtml(entry.source || "?") +
      ' <i class="bi bi-arrow-right"></i> ' +
      E.escapeHtml(entry.destination || "?") +
      "</span>" +
      '<span class="ap-freq-total">' + total + " per day</span>" +
      "</div>" +
      (hourly.length
        ? '<div class="ap-freq-group"><span class="ap-freq-label">Hourly</span>' +
          bars(hourly) + "</div>"
        : "") +
      (weekly.length
        ? '<div class="ap-freq-group"><span class="ap-freq-label">Weekly</span>' +
          bars(weekly, DAYS) + "</div>"
        : "") +
      "</div>"
    );
  }

  function render(data) {
    document.getElementById("flowCount").textContent =
      data.length + (data.length === 1 ? " flow" : " flows");
    document.getElementById("flows").innerHTML = data.length
      ? data.map(flow).join("")
      : '<p class="ap-hint mb-0">No flows in this file.</p>';
  }

  function describe(data) {
    var places = {};
    var total = 0;
    data.forEach(function (entry) {
      places[entry.source] = true;
      places[entry.destination] = true;
      total += (entry.hourly || []).reduce(function (sum, value) {
        return sum + value;
      }, 0);
    });

    return (
      '<dl class="ap-summary mb-3">' +
      "<div><dt>Flows</dt><dd>" + data.length + "</dd></div>" +
      "<div><dt>Places</dt><dd>" + Object.keys(places).length + "</dd></div>" +
      "<div><dt>Trips per day</dt><dd>" + total.toLocaleString() + "</dd></div>" +
      "</dl>"
    );
  }

  E.boot("frequencies.html", function (scenario) {
    document.getElementById("scenarioName").textContent =
      scenario.name + " — demand frequencies";

    return E.filePanel({
      url: scenario.demand_frequencies,
      parse: parse,
      render: render,
      describe: describe,
      serialise: function (data) {
        return JSON.stringify(data, null, 2);
      },
      filename: E.slugify(scenario.name) + "-demand-frequencies.json"
    }).start();
  });
})();
