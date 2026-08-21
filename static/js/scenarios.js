/* Scenarios page.
 *
 * A read-only catalogue: scenarios cannot be created, renamed, copied or
 * deleted here, because there is no server to do it. "Make active" only
 * chooses which one the rest of the site shows.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  function row(scenario, isActive) {
    var mark = isActive
      ? '<span class="ap-scenario-mark is-on" aria-hidden="true"><i class="bi bi-check-lg"></i></span>'
      : '<button type="button" class="ap-scenario-mark" data-activate="' +
        E.escapeHtml(scenario.id) +
        '" title="Make active" aria-label="Make &quot;' +
        E.escapeHtml(scenario.name) +
        '&quot; the active scenario"></button>';

    var activate = isActive
      ? ""
      : '<button type="button" class="btn btn-sm btn-outline-primary" data-activate="' +
        E.escapeHtml(scenario.id) +
        '">Make active</button>';

    var animation = scenario.animation || {};

    /* A scenario only offers the pages it has data for; the rest stay visible
       but disabled, so the row reads the same for every scenario. */
    function action(page, icon, label, available, why) {
      if (!available) {
        return (
          '<button type="button" class="btn btn-sm btn-outline-secondary" disabled title="' +
          E.escapeHtml(why) +
          '"><i class="bi ' + icon + '"></i> ' + label + "</button>"
        );
      }
      return (
        '<a href="' + E.scenarioUrl(page, scenario.id) +
        '" class="btn btn-sm btn-outline-secondary" title="' + label + '">' +
        '<i class="bi ' + icon + '"></i> ' + label + "</a>"
      );
    }

    return (
      '<li class="list-group-item ap-scenario-row' +
      (isActive ? " is-active" : "") +
      '">' +
      '<div class="ap-scenario-main">' +
      mark +
      '<div class="ap-scenario-text"><span class="ap-scenario-name">' +
      E.escapeHtml(scenario.name) +
      "</span>" +
      (isActive ? '<span class="ap-pill is-live">Active</span>' : "") +
      "</div></div>" +
      '<div class="ap-scenario-actions">' +
      activate +
      action("parameters.html", "bi-sliders", "Parameters",
             Boolean(scenario.parameters), "No parameters published") +
      action("area.html", "bi-map", "Area",
             Boolean(scenario.area), "No area published") +
      action("animation.html", "bi-play-circle", "Animation",
             Boolean(animation.agent_count), "No animation published") +
      action("stations.html", "bi-lightning-charge", "Stations",
             Boolean(scenario.swap_stations && animation.station_log),
             "No swap station data published") +
      action("outputs.html", "bi-images", "Outputs",
             Boolean((scenario.outputs || []).length), "No charts published") +
      "</div></li>"
    );
  }

  E.boot("scenarios.html", function (active, scenarios) {
    var list = document.getElementById("scenarioList");

    document.getElementById("scenarioCount").textContent =
      scenarios.length + " total";

    list.innerHTML = scenarios
      .map(function (scenario) {
        return row(scenario, scenario.id === active.id);
      })
      .join("");

    list.addEventListener("click", function (event) {
      var button = event.target.closest("[data-activate]");
      if (!button) {
        return;
      }
      var id = button.getAttribute("data-activate");
      E.setActive(id);
      window.location.search = "?scenario=" + encodeURIComponent(id);
    });
  });
})();
