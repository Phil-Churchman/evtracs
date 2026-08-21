/* Chart outputs: pick one of the run's PNGs and look at it.
 *
 * The charts are listed in the scenario's entry, so the page never has to guess
 * filenames or probe for what exists. The selected chart goes in the URL, which
 * makes a particular chart linkable and survives a reload.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var outputs = [];
  var current = null;

  // --- Helpers --------------------------------------------------------------

  function fileName(path) {
    return String(path).split("/").pop();
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) {
      return "";
    }
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function requestedOutput() {
    return new URLSearchParams(window.location.search).get("output") || "";
  }

  /* Keep ?output= in step with what is on screen without stacking up history
     entries - Back should leave the page, not walk through every chart. */
  function rememberChoice(scenarioId, name) {
    if (!window.history || !window.history.replaceState) {
      return;
    }
    var query =
      "?scenario=" + encodeURIComponent(scenarioId) +
      "&output=" + encodeURIComponent(name);
    window.history.replaceState(null, "", query);
  }

  // --- Rendering ------------------------------------------------------------

  function renderList() {
    document.getElementById("outputList").innerHTML = outputs
      .map(function (output) {
        var name = fileName(output.file);
        return (
          '<li class="list-group-item p-0">' +
          '<button type="button" class="ap-output-pick' +
          (name === current ? " is-on" : "") +
          '" data-output="' + E.escapeHtml(name) + '">' +
          '<span class="ap-output-name">' + E.escapeHtml(output.title || name) + "</span>" +
          '<span class="ap-output-meta">' + E.escapeHtml(formatBytes(output.bytes)) + "</span>" +
          "</button></li>"
        );
      })
      .join("");
  }

  function show(scenarioId, name) {
    var output = outputs.filter(function (o) {
      return fileName(o.file) === name;
    })[0];
    if (!output) {
      return;
    }

    current = name;
    document.getElementById("viewerTitle").textContent = output.title || name;

    var link = document.getElementById("fullSizeLink");
    link.href = output.file;
    link.hidden = false;

    // Rebuilt rather than reusing the <img>, so a slow chart never shows the
    // previous one under the new title.
    document.getElementById("viewer").innerHTML =
      '<img src="' + E.escapeHtml(output.file) + '" alt="' +
      E.escapeHtml(output.title || name) + '" class="ap-chart">';

    renderList();
    rememberChoice(scenarioId, name);
  }

  function showEmpty(scenario) {
    document.getElementById("empty").innerHTML =
      '<div class="ap-empty"><div class="ap-empty-icon"><i class="bi bi-images"></i></div>' +
      "<h3>No charts published</h3><p>" +
      E.escapeHtml(scenario.name) +
      "'s run did not produce any, or they have not been exported yet.</p></div>";
    document.getElementById("empty").hidden = false;
  }

  // --- Page -----------------------------------------------------------------

  E.boot("outputs.html", function (scenario) {
    document.getElementById("scenarioName").textContent = scenario.name;

    outputs = scenario.outputs || [];
    if (!outputs.length) {
      showEmpty(scenario);
      return;
    }

    document.getElementById("layout").hidden = false;
    document.getElementById("outputCount").textContent =
      outputs.length + (outputs.length === 1 ? " chart" : " charts");

    var names = outputs.map(function (o) {
      return fileName(o.file);
    });
    var wanted = requestedOutput();
    show(scenario.id, names.indexOf(wanted) === -1 ? names[0] : wanted);

    document.getElementById("outputList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-output]");
      if (button) {
        show(scenario.id, button.getAttribute("data-output"));
      }
    });
  });
})();
