/* Scenario selection: the list of published scenarios.
 *
 * Deliberately spare - a name, which of the model's three modes it runs in, and
 * a way in. Everything a scenario offers lives on its own page, so this one
 * stays readable however many scenarios there are.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  function row(scenario, isActive) {
    return (
      '<li class="list-group-item ap-scenario-row' +
      (isActive ? " is-active" : "") +
      '">' +
      '<div class="ap-scenario-main">' +
      '<div class="ap-scenario-text">' +
      '<span class="ap-scenario-name">' + E.escapeHtml(scenario.name) + "</span>" +
      '<span class="ap-scenario-mode">' + E.escapeHtml(E.modeLabel(scenario.mode)) + "</span>" +
      "</div></div>" +
      '<div class="ap-scenario-actions">' +
      (isActive ? '<span class="ap-pill is-live">Active</span>' : "") +
      '<a class="btn btn-sm btn-primary" href="' +
      E.scenarioUrl("scenario.html", scenario.id) +
      '">Select</a>' +
      "</div></li>"
    );
  }

  E.boot("selection.html", function (active, scenarios) {
    document.getElementById("scenarioCount").textContent =
      scenarios.length + " total";

    document.getElementById("scenarioList").innerHTML = scenarios
      .map(function (scenario) {
        return row(scenario, scenario.id === active.id);
      })
      .join("");
  });
})();
