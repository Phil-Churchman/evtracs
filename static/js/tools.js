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

  var GROUPS = [
    {
      stage: "Define",
      tools: [
        {
          file: "set_area.html",
          icon: "bi-bounding-box",
          title: "Set area",
          blurb: "Draw a boundary or pull an administrative one from OpenStreetMap, then export it as GeoJSON."
        },
        {
          file: "edit_demand_points.html",
          icon: "bi-geo-alt",
          title: "Demand points editor",
          blurb: "Place the points trips start and end at, and give each one a weight."
        },
        {
          file: "edit_demand_frequencies.html",
          icon: "bi-bar-chart-steps",
          title: "Demand frequency editor",
          blurb: "Set how often trips are generated through the day, so demand rises and falls with the peaks."
        },
        {
          file: "edit_facility.html",
          icon: "bi-lightning-charge",
          title: "Facilities editor",
          blurb: "Place battery swap stations and set how many posts each one has."
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
        }
      ]
    },
    {
      stage: "Analyse",
      tools: [
        {
          file: "view_cleaned_data.html",
          icon: "bi-graph-up",
          title: "GPS track & network viewer",
          blurb: "Inspect captured GPS tracks against the road network they were matched onto."
        },
        {
          file: "EV_3Wheeler_Business_Case_Dashboard.html",
          icon: "bi-cash-coin",
          title: "3-wheeler business case dashboard",
          blurb: "Work through the costs and revenues of a battery swap taxi operation."
        }
      ]
    }
  ];

  function tool(spec) {
    return (
      '<div class="col-12 col-md-6">' +
      '<a class="ap-tile ap-card-hover text-decoration-none" href="tools/' +
      E.escapeHtml(spec.file) +
      '" target="_blank" rel="noopener">' +
      '<div class="ap-tile-icon"><i class="bi ' + spec.icon + '"></i></div>' +
      "<h3>" + E.escapeHtml(spec.title) + "</h3>" +
      "<p>" + E.escapeHtml(spec.blurb) + "</p>" +
      '<div class="ap-tile-more">Open <i class="bi bi-box-arrow-up-right"></i></div>' +
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
