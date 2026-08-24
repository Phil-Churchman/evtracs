/* Model overview: the modelling workflow for a chosen model type.
 *
 * data/model_steps.json holds the steps per type, grouped into the four stages
 * the rest of the site uses - Define, Run, View, Analyse. Most steps are shared
 * between types and referenced by name; a type spells a step out in full only
 * where it differs. Each step names a video in the same file's `videos` table,
 * whose urls come from the instructions video catalogue.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var STEPS_URL = "data/model_steps.json";

  var catalogue = null;
  var currentType = "";     // the type on screen, which the list is filtered to
  var steps = [];          // the flattened steps currently on screen
  var modal = null;

  // --- Helpers --------------------------------------------------------------

  /* The catalogue stores /embed/ urls, which play bare. A link should open the
     real page, so swap in /watch?v=. Anything unexpected is passed through
     rather than mangled. */
  function watchUrl(embedUrl) {
    var match = /youtube\.com\/embed\/([\w-]+)/.exec(embedUrl || "");
    return match ? "https://www.youtube.com/watch?v=" + match[1] : embedUrl;
  }

  /* A step is either a name pointing into `shared`, or a spelled-out object. */
  function resolveStep(step) {
    return typeof step === "string" ? catalogue.shared[step] : step;
  }

  function requestedType() {
    return new URLSearchParams(window.location.search).get("type") || "";
  }

  function rememberType(type) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "?type=" + encodeURIComponent(type));
    }
  }

  // --- Flow chart -----------------------------------------------------------

  function stepBox(index, step) {
    return (
      '<button type="button" class="ap-flow-step" data-step="' + index + '">' +
      '<span class="ap-flow-step-no">' + (index + 1) + "</span>" +
      '<span class="ap-flow-step-title">' + E.escapeHtml(step.title) + "</span>" +
      (step.video ? '<i class="bi bi-play-circle ap-flow-step-video" aria-hidden="true"></i>' : "") +
      "</button>"
    );
  }

  function stage(label, stageSteps, isLast) {
    var boxes = stageSteps
      .map(function (entry) {
        return stepBox(entry.index, entry.step);
      })
      .join('<span class="ap-flow-join" aria-hidden="true">' +
            '<i class="bi bi-chevron-right"></i></span>');

    return (
      '<section class="ap-flow-stage">' +
      '<h2 class="ap-flow-stage-title">' + E.escapeHtml(label) + "</h2>" +
      '<div class="ap-flow-steps">' + (boxes || '<span class="ap-hint mb-0">No steps.</span>') +
      "</div></section>" +
      (isLast ? "" : '<div class="ap-flow-down" aria-hidden="true">' +
                     '<i class="bi bi-arrow-down"></i></div>')
    );
  }

  function renderFlow(type) {
    currentType = type;
    var spec = catalogue.types[type];
    var stages = catalogue.stages || [];

    document.getElementById("typeSummary").textContent = spec.summary || "";

    // Numbered across the whole workflow, so "step 7" means the same thing
    // whichever stage it is in.
    steps = [];
    var html = stages
      .map(function (stageSpec, position) {
        var entries = (spec.steps[stageSpec.id] || []).map(function (raw) {
          var step = resolveStep(raw);
          steps.push({ step: step, stage: stageSpec.label });
          return { index: steps.length - 1, step: step };
        });
        return stage(stageSpec.label, entries, position === stages.length - 1);
      })
      .join("");

    document.getElementById("flow").innerHTML = '<div class="ap-flow">' + html + "</div>";
  }

  /* The parameters the type on screen actually reads. `parameter_use` records
     only the exceptions, so a parameter with no entry there is read by every
     mode - which is most of them. */
  function parameterList() {
    var use = catalogue.parameter_use || {};
    var defined = catalogue.parameters || {};

    var rows = Object.keys(defined)
      .filter(function (key) {
        var users = use[key];
        return !users || users.indexOf(currentType) !== -1;
      })
      .map(function (key) {
        return (
          "<div><dt>" + E.escapeHtml(defined[key].label || key) + "</dt>" +
          "<dd>" + E.escapeHtml(defined[key].description || "") + "</dd></div>"
        );
      })
      .join("");

    return rows ? '<dl class="ap-param-list">' + rows + "</dl>" : "";
  }

  // --- Step detail ----------------------------------------------------------

  function openStep(index) {
    var entry = steps[index];
    if (!entry) {
      return;
    }

    document.getElementById("stepModalStage").textContent = entry.stage;
    document.getElementById("stepModalTitle").textContent = entry.step.title;
    document.getElementById("stepModalDescription").textContent =
      entry.step.description || "";
    document.getElementById("stepModalParameters").innerHTML =
      entry.step.show_parameters ? parameterList() : "";

    // A step that has a tool offers it here, so the modal is somewhere to act
    // from rather than only somewhere to read.
    document.getElementById("stepModalTools").innerHTML =
      (entry.step.tools || [])
        .map(function (id) {
          var tool = (catalogue.tools || {})[id];
          if (!tool) {
            return "";
          }
          return (
            '<a class="btn btn-secondary" href="' + E.escapeHtml(tool.file) +
            '" target="_blank" rel="noopener"><i class="bi ' +
            E.escapeHtml(tool.icon) + '"></i> ' + E.escapeHtml(tool.title) + "</a>"
          );
        })
        .join("");

    var video = entry.step.video ? catalogue.videos[entry.step.video] : null;
    var link = document.getElementById("stepModalVideo");
    var missing = document.getElementById("stepModalNoVideo");

    if (video) {
      link.href = watchUrl(video.youtube);
      link.hidden = false;
      missing.hidden = true;
    } else {
      link.hidden = true;
      missing.hidden = false;
    }

    modal.show();
  }

  // --- Page -----------------------------------------------------------------

  E.boot("overview.html", function (scenario) {
    modal = new bootstrap.Modal(document.getElementById("stepModal"));

    return E.fetchJson(STEPS_URL).then(function (loaded) {
      catalogue = loaded;

      var types = Object.keys(catalogue.types || {});
      if (!types.length) {
        E.showError("No model types are defined in " + STEPS_URL + ".");
        return;
      }

      // Open on the type the URL names, else the active scenario's own, so
      // arriving from a scenario shows the workflow that produced it.
      var wanted = requestedType();
      if (types.indexOf(wanted) === -1) {
        wanted = types.indexOf(scenario.mode) === -1 ? types[0] : scenario.mode;
      }

      var picker = document.getElementById("typePicker");
      picker.innerHTML = types
        .map(function (type) {
          return '<option value="' + E.escapeHtml(type) + '"' +
                 (type === wanted ? " selected" : "") + ">" +
                 E.escapeHtml(E.modeLabel(type)) + "</option>";
        })
        .join("");

      renderFlow(wanted);
      rememberType(wanted);

      picker.addEventListener("change", function () {
        renderFlow(this.value);
        rememberType(this.value);
      });

      document.getElementById("flow").addEventListener("click", function (event) {
        var button = event.target.closest("[data-step]");
        if (button) {
          openStep(Number(button.getAttribute("data-step")));
        }
      });
    });
  });
})();
