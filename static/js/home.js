/* Home page: what the active scenario is, and where to go from here. */
(function () {
  "use strict";

  var E = window.EVTRACS;

  function statGrid(parameters, area) {
    var totalAgents = (parameters.agents || []).reduce(function (sum, count) {
      return sum + count;
    }, 0);
    var polygons = area ? (area.features || []).length : 0;

    return (
      '<div class="ap-stat-grid">' +
      '<div class="ap-stat"><div class="ap-stat-label">Agents per day</div>' +
      '<div class="ap-stat-value is-blue">' +
      totalAgents.toLocaleString() +
      "</div></div>" +
      '<div class="ap-stat"><div class="ap-stat-label">Step</div>' +
      '<div class="ap-stat-value">' +
      parameters.simulation_step_sec +
      '<span style="font-size:0.9rem"> s</span></div></div>' +
      '<div class="ap-stat"><div class="ap-stat-label">Polygons</div>' +
      '<div class="ap-stat-value' +
      (polygons ? " is-green" : "") +
      '">' +
      polygons +
      "</div></div>" +
      "</div>"
    );
  }

  function tile(href, icon, tint, title, blurb, available) {
    // A tile for data this scenario has not published still explains what the
    // page is for, but says plainly that there is nothing behind it.
    var body =
      '<div class="ap-tile-icon' + (tint ? " " + tint : "") + '"><i class="bi ' + icon +
      '"></i></div><h3>' + title + "</h3><p>" + blurb + "</p>";

    if (!available) {
      return (
        '<div class="col-12 col-md-6"><div class="ap-tile ap-tile-muted">' +
        body +
        '<div class="ap-tile-more text-body-secondary">Not published</div></div></div>'
      );
    }

    return (
      '<div class="col-12 col-md-6"><a class="ap-tile ap-card-hover text-decoration-none" href="' +
      href +
      '">' +
      body +
      '<div class="ap-tile-more">Open <i class="bi bi-arrow-right"></i></div></a></div>'
    );
  }

  E.boot("index.html", function (scenario) {
    var summary = document.getElementById("summary");
    var tiles = document.getElementById("tiles");

    var animation = scenario.animation || {};

    tiles.innerHTML =
      tile(
        E.scenarioUrl("parameters.html", scenario.id),
        "bi-sliders",
        "",
        "Parameters",
        "Simulation window, agents, distances and road speeds.",
        Boolean(scenario.parameters)
      ) +
      tile(
        E.scenarioUrl("area.html", scenario.id),
        "bi-map",
        "is-green",
        "Area",
        "The area this scenario covers, on a map you can explore.",
        Boolean(scenario.area)
      ) +
      tile(
        E.scenarioUrl("animation.html", scenario.id),
        "bi-play-circle",
        "is-purple",
        "Trip animation",
        "Every agent's day played back over the map.",
        Boolean(animation.agent_count)
      ) +
      tile(
        E.scenarioUrl("stations.html", scenario.id),
        "bi-lightning-charge",
        "is-orange",
        "Swap stations",
        "Where the swap stations are, and what queued at each.",
        Boolean(scenario.swap_stations && animation.station_log)
      ) +
      tile(
        E.scenarioUrl("outputs.html", scenario.id),
        "bi-images",
        "is-purple",
        "Outputs",
        "The charts this scenario's run produced.",
        Boolean((scenario.outputs || []).length)
      );

    // The stats need the scenario's own files; the tiles do not, so they are
    // already on screen if a fetch fails.
    var wanted = [E.fetchJson(scenario.parameters)];
    wanted.push(scenario.area ? E.fetchJson(scenario.area) : Promise.resolve(null));

    return Promise.all(wanted).then(function (loaded) {
      summary.innerHTML =
        '<div class="card"><div class="card-header d-flex align-items-center justify-content-between gap-2">' +
        '<span class="card-title d-flex align-items-center gap-2">' +
        '<i class="bi bi-collection text-body-secondary"></i> ' +
        E.escapeHtml(scenario.name) +
        "</span>" +
        '<span class="ap-pill is-live">Active</span></div>' +
        '<div class="card-body">' +
        statGrid(loaded[0], loaded[1]) +
        "</div></div>";
    });
  });
})();
