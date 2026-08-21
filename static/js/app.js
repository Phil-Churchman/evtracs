/* Shared behaviour for the static EV-TRACS site.
 *
 * Everything the pages show comes from files under data/: one JSON index of
 * the scenarios, then a parameters.json and an area.geojson beside it for each
 * one. Nothing is ever written back - the data is read-only, and "the active
 * scenario" is only a choice this browser remembers.
 *
 * Pages call EVTRACS.boot(); it loads the index, works out which scenario is
 * being looked at, draws the navigation bar, and hands the scenario to the
 * page's own render function.
 */
(function (window, document) {
  "use strict";

  var CATALOGUE_URL = "data/scenarios.json";
  var ACTIVE_KEY = "evtracs.activeScenario";

  // --- Storage --------------------------------------------------------------
  //
  // Private browsing and blocked site data make localStorage throw rather than
  // return nothing, so every access is guarded and simply falls back to "no
  // preference": the first scenario in the index.

  function readStored() {
    try {
      return window.localStorage.getItem(ACTIVE_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function writeStored(id) {
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch (error) {
      /* Remembering the choice is a convenience, never a requirement. */
    }
  }

  // --- Fetching -------------------------------------------------------------

  function fetchJson(url) {
    return window.fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) {
        throw new Error(url + " returned " + response.status);
      }
      return response.json();
    });
  }

  function loadCatalogue() {
    return fetchJson(CATALOGUE_URL).then(function (payload) {
      var scenarios = (payload && payload.scenarios) || [];
      if (!scenarios.length) {
        throw new Error("no scenarios are defined in " + CATALOGUE_URL);
      }
      return scenarios;
    });
  }

  // --- Which scenario are we looking at? ------------------------------------

  function requestedId() {
    return new URLSearchParams(window.location.search).get("scenario") || "";
  }

  function findById(scenarios, id) {
    for (var i = 0; i < scenarios.length; i++) {
      if (scenarios[i].id === id) {
        return scenarios[i];
      }
    }
    return null;
  }

  /* The URL wins over the remembered choice, so a shared link always opens the
     scenario it names. Anything unrecognised falls through to the first. */
  function resolveScenario(scenarios) {
    return (
      findById(scenarios, requestedId()) ||
      findById(scenarios, readStored()) ||
      scenarios[0]
    );
  }

  // --- Small helpers --------------------------------------------------------

  var HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return HTML_ESCAPES[ch];
    });
  }

  /* Scenario ids come from a file we control, but they end up inside href
     strings, so encode them rather than trusting the data. */
  function scenarioUrl(page, id) {
    return page + "?scenario=" + encodeURIComponent(id);
  }

  function download(filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoking straight away can cancel the download in some browsers.
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function slugify(name) {
    var slug = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "scenario";
  }

  // --- Navigation -----------------------------------------------------------

  function navLink(page, label, current) {
    var isActive = page === current;
    return (
      '<li class="nav-item"><a class="nav-link' +
      (isActive ? " active" : "") +
      '"' +
      (isActive ? ' aria-current="page"' : "") +
      ' href="' +
      page +
      '">' +
      label +
      "</a></li>"
    );
  }

  function switcherItems(scenarios, active) {
    return scenarios
      .map(function (scenario) {
        var isActive = scenario.id === active.id;
        return (
          '<li><button type="button" class="dropdown-item d-flex align-items-center gap-2' +
          (isActive ? " active" : "") +
          '" data-scenario="' +
          escapeHtml(scenario.id) +
          '"><i class="bi ' +
          (isActive ? "bi-check-lg" : "bi-dash") +
          ' ap-dropdown-tick"></i><span class="text-truncate">' +
          escapeHtml(scenario.name) +
          "</span></button></li>"
        );
      })
      .join("");
  }

  function renderNav(page, scenarios, active) {
    var host = document.getElementById("site-nav");
    if (!host) {
      return;
    }

    host.innerHTML =
      '<nav class="navbar navbar-expand-md sticky-top ap-nav" id="top_nav">' +
      '<div class="container-fluid px-3 px-md-4">' +
      '<a class="navbar-brand" id="master_brand" href="index.html">' +
      '<img src="static/images/icon-160x160.png" alt=""><span>EV-TRACS</span></a>' +
      '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" ' +
      'data-bs-target="#navbarTopContent" aria-controls="navbarTopContent" ' +
      'aria-expanded="false" aria-label="Toggle navigation">' +
      '<i class="bi bi-list"></i></button>' +
      '<div class="collapse navbar-collapse" id="navbarTopContent">' +
      '<ul class="navbar-nav me-auto mb-0 gap-md-1">' +
      navLink("index.html", "Home", page) +
      navLink("scenarios.html", "Scenarios", page) +
      "</ul>" +
      '<ul class="navbar-nav ms-md-auto mb-0"><li class="nav-item dropdown">' +
      '<a class="nav-link dropdown-toggle d-flex align-items-center gap-2" href="#" ' +
      'role="button" data-bs-toggle="dropdown" aria-expanded="false">' +
      '<i class="bi bi-collection"></i><span class="ap-nav-scenario">' +
      escapeHtml(active.name) +
      "</span></a>" +
      '<ul class="dropdown-menu dropdown-menu-end">' +
      '<li class="dropdown-header">Active scenario</li>' +
      switcherItems(scenarios, active) +
      '<li><hr class="dropdown-divider"></li>' +
      '<li><a class="dropdown-item d-flex align-items-center gap-2" href="scenarios.html">' +
      '<i class="bi bi-collection"></i> All scenarios</a></li>' +
      "</ul></li></ul></div></div></nav>";

    host.addEventListener("click", function (event) {
      var button = event.target.closest("[data-scenario]");
      if (!button) {
        return;
      }
      var id = button.getAttribute("data-scenario");
      writeStored(id);
      // Reload on the chosen scenario so the whole page reflects the switch.
      window.location.search = "?scenario=" + encodeURIComponent(id);
    });
  }

  // --- Page startup ---------------------------------------------------------

  function showError(message) {
    var host = document.getElementById("pageError");
    if (!host) {
      window.alert(message);
      return;
    }
    host.innerHTML =
      '<div class="ap-messages"><div class="alert alert-danger d-flex align-items-center gap-2">' +
      '<i class="bi bi-exclamation-circle"></i><span>' +
      escapeHtml(message) +
      "</span></div></div>";
    host.hidden = false;
  }

  /* `page` names the current file so the nav can mark itself; `render` gets the
     resolved scenario and the whole list. Failures land in #pageError instead
     of leaving a blank screen - opening the site from the filesystem rather
     than over HTTP is the usual cause, so the message says so. */
  function boot(page, render) {
    loadCatalogue()
      .then(function (scenarios) {
        var active = resolveScenario(scenarios);
        writeStored(active.id);
        renderNav(page, scenarios, active);
        return render ? render(active, scenarios) : undefined;
      })
      .catch(function (error) {
        var hint =
          window.location.protocol === "file:"
            ? " Open the site through a web server rather than from the filesystem."
            : "";
        showError("Could not load the scenario data: " + error.message + "." + hint);
      });
  }

  window.EVTRACS = {
    boot: boot,
    fetchJson: fetchJson,
    setActive: writeStored,
    scenarioUrl: scenarioUrl,
    escapeHtml: escapeHtml,
    download: download,
    slugify: slugify,
    showError: showError
  };
})(window, document);
