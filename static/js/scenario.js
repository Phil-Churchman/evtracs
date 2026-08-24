/* Scenario page: one scenario at a glance, and the way in to everything it
 * offers. Reached by selecting a scenario on the home page.
 *
 * The sections follow the order the work happens in - Define the scenario, Run
 * it, View what it did, Analyse the result - so the page reads as a workflow
 * rather than as a pile of links.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var STEPS_URL = "data/model_steps.json";

  // --- Headline -------------------------------------------------------------

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
    if (!isFinite(hours)) {
      return "—";
    }
    // Whole hours are the norm, so only show a decimal when there is one.
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }

  /* The busiest period rather than the day's total: `agents` holds a count per
     period, so the largest entry is the most that are ever on the road. */
  function maxAgents(parameters) {
    var agents = parameters.agents || [];
    return agents.length ? Math.max.apply(null, agents) : 0;
  }

  function stat(label, value, unit, tint) {
    return (
      '<div class="ap-stat"><div class="ap-stat-label">' +
      E.escapeHtml(label) +
      '</div><div class="ap-stat-value' +
      (tint ? " " + tint : "") +
      '">' +
      E.escapeHtml(value) +
      (unit ? '<span class="ap-stat-unit">' + E.escapeHtml(unit) + "</span>" : "") +
      "</div></div>"
    );
  }

  function headline(scenario, parameters) {
    return (
      '<div class="card"><div class="card-body"><div class="ap-stat-grid">' +
      stat("Model type", E.modeLabel(scenario.mode), "", "is-text") +
      stat("Duration", durationHours(parameters), "h", "") +
      stat("Max agents", maxAgents(parameters).toLocaleString(), "", "is-blue") +
      "</div></div></div>"
    );
  }

  // --- Sections -------------------------------------------------------------

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

  function section(id, title, body) {
    return (
      '<section class="ap-section"><h2 class="ap-section-title">' +
      E.escapeHtml(title) +
      '</h2><div class="row g-3" id="stage-' + id + '">' +
      body +
      "</div></section>"
    );
  }

  /* Every page a scenario can offer, and where it belongs. Which of them a
     given scenario shows comes from its model type's `pages` list in
     model_steps.json - a hail-and-rank run has no demand points to look at, so
     it is not shown a muted tile for them either. `available` then decides
     whether the tile is a link or says the data was never published. */
  var PAGES = {
    parameters: {
      stage: "define", page: "parameters.html", icon: "bi-sliders", tint: "",
      title: "Parameters",
      blurb: "Simulation window, agents, distances and routing.",
      has: function (s) { return Boolean(s.parameters); }
    },
    area: {
      stage: "define", page: "area.html", icon: "bi-map", tint: "is-green",
      title: "Area",
      blurb: "The area this scenario covers, on a map you can explore.",
      has: function (s) { return Boolean(s.area); }
    },
    demand: {
      stage: "define", page: "demand.html", icon: "bi-geo-alt", tint: "is-orange",
      title: "Demand points",
      blurb: "Where trips start and end, and the weight each point carries.",
      has: function (s) { return Boolean(s.demand_points); }
    },
    frequencies: {
      stage: "define", page: "frequencies.html", icon: "bi-bar-chart-steps",
      tint: "is-orange", title: "Demand frequencies",
      blurb: "How often trips run between each pair of places.",
      has: function (s) { return Boolean(s.demand_frequencies); }
    },
    facilities: {
      stage: "define", page: "facilities.html", icon: "bi-lightning-charge",
      tint: "is-purple", title: "Facilities",
      blurb: "Battery swap stations, and taxi ranks where a scenario has them.",
      has: function (s) { return Boolean(s.swap_stations || s.taxi_ranks); }
    },
    animation: {
      stage: "view", page: "animation.html", icon: "bi-play-circle", tint: "is-purple",
      title: "Trip animation",
      blurb: "Every agent's day played back over the map.",
      has: function (s) { return Boolean((s.animation || {}).agent_count); }
    },
    stations: {
      stage: "view", page: "stations.html", icon: "bi-lightning-charge", tint: "is-orange",
      title: "Swap stations",
      blurb: "Where the swap stations are, and what queued at each.",
      has: function (s) { return Boolean(s.swap_stations && (s.animation || {}).station_log); }
    },
    outputs: {
      stage: "analyse", page: "outputs.html", icon: "bi-images", tint: "is-purple",
      title: "Outputs",
      blurb: "The charts this scenario's run produced.",
      has: function (s) { return Boolean((s.outputs || []).length); }
    }
  };

  function pagesForStage(scenario, wanted, stageId) {
    return wanted
      .filter(function (id) {
        return PAGES[id] && PAGES[id].stage === stageId;
      })
      .map(function (id) {
        var spec = PAGES[id];
        return tile(
          E.scenarioUrl(spec.page, scenario.id),
          spec.icon, spec.tint, spec.title, spec.blurb, spec.has(scenario)
        );
      })
      .join("");
  }

  /* The editors that were tools are pages now, so the only one left to offer
     alongside them is the general JSON/GeoJSON editor - useful against any of
     the model's files, and belonging to none of them in particular. */
  function extraTool(catalogue) {
    var tool = (catalogue.tools || {})["json-editor"];
    if (!tool) {
      return "";
    }
    return (
      '<div class="col-12"><div class="ap-stage-tools">' +
      '<span class="ap-stage-tools-label">Also</span>' +
      '<a class="ap-stage-tool" href="' + E.escapeHtml(tool.file) +
      '" target="_blank" rel="noopener"><i class="bi ' + E.escapeHtml(tool.icon) +
      '"></i>' + E.escapeHtml(tool.title) +
      '<i class="bi bi-box-arrow-up-right ap-stage-tool-out"></i></a>' +
      "</div></div>"
    );
  }

  function fact(label, value) {
    return "<div><dt>" + E.escapeHtml(label) + "</dt><dd>" +
           E.escapeHtml(value) + "</dd></div>";
  }

  /* Run has no button: the simulation happens in the model, and this site only
     ever shows a run that already finished. So the section says which run is on
     display rather than offering to start one. */
  function runCard(scenario) {
    var animation = scenario.animation || {};
    return (
      '<div class="col-12"><div class="card"><div class="card-body">' +
      '<p class="ap-hint mb-3">A completed run. The simulation itself is run in ' +
      "the model, not here.</p>" +
      '<dl class="ap-summary mb-0">' +
      fact("Agents animated",
           animation.agent_count ? animation.agent_count.toLocaleString() : "None published") +
      fact("Swap station queue log",
           animation.station_log ? "Published" : "Not published") +
      fact("Charts",
           (scenario.outputs || []).length || "None published") +
      "</dl></div></div></div>"
    );
  }

  // --- Page -----------------------------------------------------------------

  E.boot("scenario.html", function (scenario) {
    document.getElementById("scenarioName").textContent = scenario.name;

    var sections = document.getElementById("sections");

    return Promise.all([
      E.fetchJson(scenario.parameters),
      E.fetchJson(STEPS_URL).catch(function (error) {
        console.warn("Could not load " + STEPS_URL, error);
        return null;
      })
    ]).then(function (loaded) {
      document.getElementById("summary").innerHTML = headline(scenario, loaded[0]);

      var catalogue = loaded[1] || {};
      var spec = (catalogue.types || {})[scenario.mode];
      // Without the catalogue, fall back to offering everything the scenario
      // has data for rather than showing an empty page.
      var wanted = (spec && spec.pages) || Object.keys(PAGES);

      sections.innerHTML =
        section("define", "Define",
                pagesForStage(scenario, wanted, "define") + extraTool(catalogue)) +
        section("run", "Run", runCard(scenario)) +
        section("view", "View", pagesForStage(scenario, wanted, "view")) +
        section("analyse", "Analyse", pagesForStage(scenario, wanted, "analyse"));
    });
  });
})();
