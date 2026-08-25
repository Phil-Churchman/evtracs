/* Tools page: the model's standalone editors and viewers.
 *
 * They are copied in from Model/utilities unchanged - each one is already
 * self-contained, taking a file from your machine and exporting the result - so
 * this page only has to list them. They are grouped by the same stages the
 * overview uses, so a tool is where you would look for it in the workflow.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  /* Only the tools the site does not supersede. The area, demand point,
     demand frequency and facilities editors all have scenario-aware pages now,
     so listing the standalone copies here as well would offer two versions of
     the same thing. */
  var GROUPS = [
    {
      stage: "Define",
      tools: [
        {
          page: "tracking.html",
          icon: "bi-signpost-2",
          tint: "is-green",
          title: "Tracker data processing",
          blurb: "How captured GPS journeys are cleaned, matched onto the road network and summarised, and what the two viewers show."
        },
        {
          page: "siting.html",
          icon: "bi-crosshair",
          tint: "is-purple",
          title: "Optimise swap/charge station locations",
          blurb: "Six ways of choosing where a given number of stations should go so drivers travel least far to reach one, and how they compare."
        },
        {
          file: "geojson_editor.html",
          icon: "bi-braces",
          title: "JSON / GeoJSON editor",
          blurb: "Open, check and edit any of the model's JSON or GeoJSON files directly."
        }
      ]
    },
    {
      stage: "View",
      tools: [
        {
          file: "clean_data_animation.html",
          icon: "bi-play-circle",
          title: "Tracked route animation",
          blurb: "Play recorded vehicle journeys back over the map, the way the trip animation plays simulated ones."
        },
        {
          file: "view_cleaned_data.html",
          icon: "bi-graph-up",
          title: "GPS track & network viewer",
          blurb: "Inspect captured GPS tracks against the road network they were matched onto."
        }
      ]
    },
    {
      stage: "Analyse",
      tools: [
        {
          file: "EV_3Wheeler_Business_Case_Dashboard.html",
          icon: "bi-cash-coin",
          title: "3-wheeler business case dashboard",
          blurb: "Work through the costs and revenues of a battery swap taxi operation."
        }
      ]
    }
  ];

  /* A `file` is one of the standalone tools under tools/, opened in a new tab
     because it is a separate application. A `page` is part of this site, so it
     opens in place and reads as a link rather than a hand-off. */
  function tool(spec) {
    var isPage = Boolean(spec.page);
    return (
      '<div class="col-12 col-md-6">' +
      '<a class="ap-tile ap-card-hover text-decoration-none" href="' +
      E.escapeHtml(isPage ? spec.page : "tools/" + spec.file) +
      '"' + (isPage ? "" : ' target="_blank" rel="noopener"') + ">" +
      '<div class="ap-tile-icon' + (spec.tint ? " " + spec.tint : "") +
      '"><i class="bi ' + spec.icon + '"></i></div>' +
      "<h3>" + E.escapeHtml(spec.title) + "</h3>" +
      "<p>" + E.escapeHtml(spec.blurb) + "</p>" +
      '<div class="ap-tile-more">Open <i class="bi ' +
      (isPage ? "bi-arrow-right" : "bi-box-arrow-up-right") + '"></i></div>' +
      "</a></div>"
    );
  }

  E.boot("tools.html", function () {
    document.getElementById("tools").innerHTML = GROUPS.map(function (group) {
      return (
        '<section class="ap-section"><h2 class="ap-section-title">' +
        E.escapeHtml(group.stage) +
        '</h2><div class="row g-3">' +
        group.tools.map(tool).join("") +
        "</div></section>"
      );
    }).join("");
  });
})();
