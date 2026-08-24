/* The load / import / export / reset panel the scenario data pages share.
 *
 * Modelled on the area page: the scenario's published file is what you see when
 * you arrive, you can open a different one from your own machine to compare,
 * and you can export whatever is on screen. Nothing is written back - the site
 * is read-only - so "Back to published" always returns to the file the model
 * produced.
 *
 * Pages supply the parsing and drawing; this handles the wiring around it.
 */
(function (window, document) {
  "use strict";

  var E = window.EVTRACS;

  /* options:
       url         published file, or null when the scenario has none
       parse       text -> data, throwing if it is not what this page expects
       render      data -> void, draws it
       describe    data -> summary html
       serialise   data -> text for export
       filename    export filename
       publishedAs label for the published file, e.g. "Published"        */
  function filePanel(options) {
    var published = null;
    var current = null;
    var origin = "";

    var els = {
      summary: document.getElementById("panelSummary"),
      status: document.getElementById("panelStatus"),
      origin: document.getElementById("panelOrigin"),
      fileInput: document.getElementById("panelFile"),
      exportBtn: document.getElementById("panelExport"),
      resetBtn: document.getElementById("panelReset")
    };

    function setStatus(message, isError) {
      els.status.textContent = message || "";
      els.status.style.color = isError ? "var(--ap-red)" : "";
    }

    function refresh() {
      els.exportBtn.disabled = !current;
      els.resetBtn.disabled = !published || origin === "published";

      els.origin.hidden = !origin;
      if (origin) {
        els.origin.textContent =
          origin === "published" ? options.publishedAs || "Published" : origin;
        els.origin.className = origin === "published" ? "ap-pill is-live" : "ap-pill is-warn";
      }

      els.summary.innerHTML = current
        ? options.describe(current)
        : '<p class="ap-hint mb-3">Nothing loaded.</p>';
    }

    function show(data, label) {
      current = data;
      origin = label;
      options.render(data);
      refresh();
    }

    els.fileInput.addEventListener("change", function (event) {
      var file = event.target.files[0];
      if (!file) {
        return;
      }
      var reader = new FileReader();
      reader.onload = function (loaded) {
        var data;
        try {
          data = options.parse(loaded.target.result);
        } catch (error) {
          setStatus(error.message, true);
          return;
        }
        show(data, file.name);
        setStatus("Showing " + file.name + ".");
      };
      reader.onerror = function () {
        setStatus("Could not read that file.", true);
      };
      reader.readAsText(file);
      // Allow re-opening the same filename twice in a row.
      event.target.value = "";
    });

    els.exportBtn.addEventListener("click", function () {
      if (current) {
        E.download(options.filename, options.serialise(current), "application/json");
      }
    });

    els.resetBtn.addEventListener("click", function () {
      if (published) {
        show(published, "published");
        setStatus("");
      }
    });

    refresh();

    return {
      /* Load the published file, if the scenario has one. */
      start: function () {
        if (!options.url) {
          setStatus("This scenario has no published file. Open one to view it.");
          return Promise.resolve();
        }
        return window
          .fetch(options.url, { cache: "no-cache" })
          .then(function (response) {
            if (!response.ok) {
              throw new Error("HTTP " + response.status);
            }
            return response.text();
          })
          .then(function (text) {
            published = options.parse(text);
            show(published, "published");
          })
          .catch(function (error) {
            console.warn("Could not load " + options.url, error);
            setStatus("Could not load the published file: " + error.message, true);
          });
      }
    };
  }

  E.filePanel = filePanel;
})(window, document);
