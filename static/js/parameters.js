/* Parameters page: a read-only rendering of one scenario's parameters.json.
 *
 * The file keeps the shape the simulation model reads, so times arrive as
 * [year, month, day, hour, minute, second] and the road speeds live under the
 * hyphenated key that is not a legal identifier.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var ROAD_SPEED_KEY = "road_speed_km-h";
  var HOURS_PER_DAY = 24;

  // The order road types are shown in, which is the order the model lists them.
  var ROAD_TYPES = [
    "trunk", "trunk_link", "motorway", "motorway_link", "primary",
    "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "residential", "unclassified", "service", "footway", "pedestrian", "track",
    "cycleway", "path", "steps", "services", "rest_area", "corridor", "raceway"
  ];

  var MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatParts(parts) {
    if (!Array.isArray(parts) || parts.length < 5) {
      return "—";
    }
    return (
      parts[2] + " " + MONTHS[parts[1] - 1] + " " + parts[0] +
      ", " + pad(parts[3]) + ":" + pad(parts[4])
    );
  }

  function toDate(parts) {
    return new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] || 0)
    );
  }

  function durationHours(parameters) {
    if (!parameters.start_time || !parameters.end_time) {
      return "—";
    }
    var hours =
      (toDate(parameters.end_time) - toDate(parameters.start_time)) / 3600000;
    // Whole hours are the norm, so only show a decimal when there is one.
    return (Number.isInteger(hours) ? hours : hours.toFixed(1)) + " h";
  }

  // --- Building blocks ------------------------------------------------------

  function field(label, value) {
    return (
      '<div class="ap-param-field"><span class="form-label d-block">' +
      E.escapeHtml(label) +
      '</span><div class="ap-value">' +
      E.escapeHtml(value) +
      "</div></div>"
    );
  }

  function flag(label, on) {
    return (
      '<div class="ap-flag"><span class="ap-pill ' +
      (on ? "is-live" : "") +
      '">' +
      (on ? "On" : "Off") +
      "</span><span>" +
      E.escapeHtml(label) +
      "</span></div>"
    );
  }

  function card(icon, title, aside, body) {
    return (
      '<div class="card mb-4"><div class="card-header d-flex align-items-center justify-content-between gap-2">' +
      '<span class="card-title d-flex align-items-center gap-2">' +
      '<i class="bi ' + icon + ' text-body-secondary"></i> ' +
      E.escapeHtml(title) +
      "</span>" +
      (aside ? '<span class="ap-eyebrow">' + E.escapeHtml(aside) + "</span>" : "") +
      '</div><div class="card-body">' +
      body +
      "</div></div>"
    );
  }

  function cell(cssClass, label, value) {
    return (
      '<div class="' + cssClass + '"><label>' +
      E.escapeHtml(label) +
      '</label><div class="ap-value">' +
      E.escapeHtml(value) +
      "</div></div>"
    );
  }

  // --- Sections -------------------------------------------------------------

  function simulationCard(parameters) {
    return card(
      "bi-clock",
      "Simulation",
      durationHours(parameters),
      '<div class="ap-param-cols">' +
        field("Start time", formatParts(parameters.start_time)) +
        field("End time", formatParts(parameters.end_time)) +
        field("Simulation step", parameters.simulation_step_sec + " s") +
        "</div>" +
        '<hr class="ap-hairline my-3">' +
        '<div class="ap-switch-row">' +
        flag("Use demand model", parameters.demand_model) +
        flag("Speed-based routing", parameters.speed_based_routing) +
        "</div>"
    );
  }

  function agentsCard(parameters) {
    var agents = parameters.agents || [];
    var total = agents.reduce(function (sum, count) {
      return sum + count;
    }, 0);

    var hours = "";
    for (var hour = 0; hour < HOURS_PER_DAY; hour++) {
      hours += cell("ap-hour-cell", pad(hour) + ":00", agents[hour] == null ? "—" : agents[hour]);
    }

    return card(
      "bi-people",
      "Agents",
      total.toLocaleString() + " per day",
      '<div class="ap-param-cols mb-4">' +
        field("Animation agents", parameters.animation_agents) +
        field("Probability of hailing", parameters.probability_hail) +
        "</div>" +
        '<span class="form-label d-block">Agents active by hour</span>' +
        '<p class="ap-hint">One value per hour of the day, starting at midnight.</p>' +
        '<div class="ap-hour-grid">' + hours + "</div>"
    );
  }

  function distancesCard(parameters) {
    return card(
      "bi-rulers",
      "Distances & routing",
      "",
      '<div class="ap-param-cols">' +
        field("Max total distance", parameters.max_total_distance_m + " m") +
        field("Buffer distance", parameters.buffer_distance + " m") +
        field("Passenger max distance", parameters.passenger_max_dist + " m") +
        field("Deviation factor", parameters.deviation_factor) +
        field("Swap wait", parameters.swap_wait_sec + " s") +
        "</div>"
    );
  }

  function roadSpeedsCard(parameters) {
    var speeds = parameters[ROAD_SPEED_KEY] || {};
    // Anything the file adds beyond the known list is still worth showing.
    var types = ROAD_TYPES.filter(function (type) {
      return type in speeds;
    }).concat(
      Object.keys(speeds).filter(function (type) {
        return ROAD_TYPES.indexOf(type) === -1;
      })
    );

    var grid = types
      .map(function (type) {
        return cell("ap-road-cell", type.replace(/_/g, " "), speeds[type]);
      })
      .join("");

    return card(
      "bi-signpost-split",
      "Road speeds (km/h)",
      types.length + " types",
      '<p class="ap-hint mb-3">Assumed travel speed for each OSM highway type. Zero means impassable.</p>' +
        '<div class="ap-road-grid">' + grid + "</div>"
    );
  }

  // --- Page -----------------------------------------------------------------

  E.boot("parameters.html", function (scenario) {
    document.getElementById("scenarioName").textContent = scenario.name;
    document.getElementById("sourceFile").textContent = scenario.parameters;

    var link = document.getElementById("downloadLink");
    link.href = scenario.parameters;
    link.setAttribute("download", E.slugify(scenario.name) + "-parameters.json");

    return E.fetchJson(scenario.parameters).then(function (parameters) {
      document.getElementById("parameters").innerHTML =
        simulationCard(parameters) +
        agentsCard(parameters) +
        distancesCard(parameters) +
        roadSpeedsCard(parameters);
    });
  });
})();
