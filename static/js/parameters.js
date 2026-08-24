/* Parameters page: a read-only rendering of one scenario's parameters.json.
 *
 * The file keeps the shape the simulation model reads, so times arrive as
 * [year, month, day, hour, minute, second] and the road speeds live under the
 * hyphenated key that is not a legal identifier.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  // Only used to spot a scenario file that still carries speeds of its own;
  // the table itself lives on the global parameters page.
  var ROAD_SPEED_KEY = "road_speed_km-h";
  var STEPS_URL = "data/model_steps.json";

  // Which model type this scenario is, and which parameters only some types
  // read. Set once the catalogue loads; until then everything is shown.
  var mode = "";
  var parameterUse = {};

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

  /* A parameter with no entry in `parameter_use` is read by every mode, which
     is most of them; only the exceptions are listed. A field for a parameter
     this scenario's mode never reads is left out rather than shown as though it
     mattered. */
  function applies(key) {
    var users = parameterUse[key];
    return !users || users.indexOf(mode) !== -1;
  }

  function field(label, value, key) {
    if (key && !applies(key)) {
      return "";
    }
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

  // The mode used to be a "demand_model" boolean; it is now a named mode, and
  // files written before the change are still read the old way.
  function simulationMode(parameters) {
    return E.modeLabel(
      parameters.simulation_mode ||
        (parameters.demand_model ? "demand_model" : "hail_rank")
    );
  }

  function simulationCard(parameters) {
    return card(
      "bi-clock",
      "Simulation",
      durationHours(parameters),
      '<div class="ap-param-cols">' +
        field("Start time", formatParts(parameters.start_time)) +
        field("End time", formatParts(parameters.end_time)) +
        field("Simulation step", parameters.simulation_step_sec + " s") +
        field("Simulation mode", simulationMode(parameters)) +
        "</div>" +
        '<hr class="ap-hairline my-3">' +
        '<div class="ap-switch-row">' +
        flag("Speed-based routing", parameters.speed_based_routing) +
        "</div>"
    );
  }

  /* The agent counts split the simulation window into that many equal periods,
     rather than being hourly: 24 values over a day are hourly, 8 are
     three-hourly. So the labels are worked out from the window, which
     reproduces the familiar 00:00, 01:00, ... for the usual 24-over-a-day. */
  function periodLabeller(parameters, periods) {
    if (!periods || !parameters.start_time || !parameters.end_time) {
      return null;
    }
    var startMs = toDate(parameters.start_time).getTime();
    var periodMs = (toDate(parameters.end_time).getTime() - startMs) / periods;
    if (!isFinite(periodMs) || periodMs <= 0) {
      return null;
    }
    return {
      periodMs: periodMs,
      label: function (index) {
        var at = new Date(startMs + index * periodMs);
        return pad(at.getUTCHours()) + ":" + pad(at.getUTCMinutes());
      }
    };
  }

  function describeSpan(ms) {
    var minutes = Math.round(ms / 60000);
    if (minutes % 60 === 0) {
      var hours = minutes / 60;
      return hours + (hours === 1 ? " hour" : " hours");
    }
    return minutes + " min";
  }

  function agentsCard(parameters) {
    var agents = parameters.agents || [];
    var total = agents.reduce(function (sum, count) {
      return sum + count;
    }, 0);

    var periods = periodLabeller(parameters, agents.length);
    var grid = agents
      .map(function (count, index) {
        return cell(
          "ap-hour-cell",
          periods ? periods.label(index) : "#" + (index + 1),
          count
        );
      })
      .join("");

    var hint = periods
      ? "One value per period. The run is split into " + agents.length +
        " periods of " + describeSpan(periods.periodMs) + ", labelled by when each starts."
      : "One value per period, in order.";

    return card(
      "bi-people",
      "Agents",
      total.toLocaleString() + " in total",
      '<div class="ap-param-cols mb-4">' +
        field("Animation agents", parameters.animation_agents) +
        field("Probability of hailing", parameters.probability_hail,
              "probability_hail") +
        "</div>" +
        '<span class="form-label d-block">Agents introduced per period</span>' +
        '<p class="ap-hint">' + hint + "</p>" +
        '<div class="ap-hour-grid">' + grid + "</div>"
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
        field("Passenger max distance", parameters.passenger_max_dist + " m",
              "passenger_max_dist") +
        field("Deviation factor", parameters.deviation_factor) +
        field("Swap wait", parameters.swap_wait_sec + " s") +
        (parameters.pickup_wait_sec == null
          ? ""
          : field("Pickup wait", parameters.pickup_wait_sec + " s", "pickup_wait_sec")) +
        "</div>"
    );
  }

  /* Road speeds are calibrated once and applied to every run, so they are not
     shown here. A scenario file written before that change may still carry its
     own copy, which the model ignores - say so rather than rendering values
     that are not the ones being used. */
  function roadSpeedsCard(parameters) {
    var stale = parameters[ROAD_SPEED_KEY]
      ? '<p class="ap-hint mb-0 mt-2"><i class="bi bi-exclamation-circle"></i> ' +
        "This scenario file still carries its own road speeds. They are ignored: " +
        "the global table is what runs.</p>"
      : "";

    return card(
      "bi-signpost-split",
      "Road speeds",
      "Global",
      '<p class="ap-hint mb-3">Road speeds are shared by every scenario rather ' +
        "than set per run.</p>" +
        '<a href="global.html" class="btn btn-sm btn-outline-secondary">' +
        '<i class="bi bi-signpost-split"></i> View global parameters</a>' +
        stale
    );
  }

  // --- Page -----------------------------------------------------------------

  E.boot("parameters.html", function (scenario) {
    document.getElementById("scenarioName").textContent = scenario.name;
    document.getElementById("sourceFile").textContent = scenario.parameters;

    var link = document.getElementById("downloadLink");
    link.href = scenario.parameters;
    link.setAttribute("download", E.slugify(scenario.name) + "-parameters.json");

    mode = scenario.mode;

    return Promise.all([
      E.fetchJson(scenario.parameters),
      E.fetchJson(STEPS_URL).catch(function (error) {
        // Without the catalogue nothing is filtered out, which shows a
        // parameter too many rather than hiding one that matters.
        console.warn("Could not load " + STEPS_URL, error);
        return null;
      })
    ]).then(function (loaded) {
      var parameters = loaded[0];
      parameterUse = (loaded[1] && loaded[1].parameter_use) || {};

      document.getElementById("parameters").innerHTML =
        simulationCard(parameters) +
        agentsCard(parameters) +
        distancesCard(parameters) +
        roadSpeedsCard(parameters);
    });
  });
})();
