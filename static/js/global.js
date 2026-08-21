/* Global parameters: the settings shared by every scenario.
 *
 * Road speeds are the only one so far. They used to sit in each scenario file
 * under "road_speed_km-h"; they are calibrated once and applied to every run,
 * so the model publishes them on their own and so does this page.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var ROAD_SPEED_KEY = "road_speed_km-h";

  // The order road types are shown in, which is the order the model lists them.
  // Anything the file adds beyond this is shown after, so a new highway type
  // appears without this list needing to know about it.
  var ROAD_TYPES = [
    "trunk", "trunk_link", "motorway", "motorway_link", "primary",
    "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "residential", "unclassified", "service", "footway", "pedestrian", "track",
    "cycleway", "path", "steps", "services", "rest_area", "corridor", "raceway"
  ];

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

  function cell(label, value) {
    return (
      '<div class="ap-road-cell"><label>' +
      E.escapeHtml(label) +
      '</label><div class="ap-value">' +
      E.escapeHtml(value) +
      "</div></div>"
    );
  }

  function orderedTypes(speeds) {
    var known = ROAD_TYPES.filter(function (type) {
      return type in speeds;
    });
    var extra = Object.keys(speeds).filter(function (type) {
      return ROAD_TYPES.indexOf(type) === -1;
    });
    return known.concat(extra);
  }

  function roadSpeedsCard(speeds, source) {
    var types = orderedTypes(speeds);
    var impassable = types.filter(function (type) {
      return !speeds[type];
    }).length;

    var grid = types
      .map(function (type) {
        return cell(type.replace(/_/g, " "), speeds[type]);
      })
      .join("");

    return card(
      "bi-signpost-split",
      "Road speeds (km/h)",
      types.length + " types",
      '<p class="ap-hint mb-3">Assumed travel speed for each OSM highway type. ' +
        "Zero means impassable" +
        (impassable ? " — " + impassable + " of these are" : "") +
        ".</p>" +
        '<div class="ap-road-grid">' + grid + "</div>" +
        (source
          ? '<p class="ap-hint mt-3 mb-0">Calibrated in <span class="ap-mono">' +
            E.escapeHtml(source) + "</span>.</p>"
          : "")
    );
  }

  function missingCard() {
    return (
      '<div class="ap-empty"><div class="ap-empty-icon"><i class="bi bi-signpost-split"></i></div>' +
      "<h3>No global parameters published</h3>" +
      "<p>Road speeds have not been exported from the model yet.</p></div>"
    );
  }

  E.boot("global.html", function (scenario, scenarios, globals) {
    var host = document.getElementById("globals");
    var url = globals && globals.road_speeds;

    if (!url) {
      host.innerHTML = missingCard();
      return;
    }

    var link = document.getElementById("downloadLink");
    link.href = url;
    link.setAttribute("download", "road_speeds.json");
    link.hidden = false;

    return E.fetchJson(url).then(function (payload) {
      // The file may be either {"road_speed_km-h": {...}} or a bare table,
      // matching what the model accepts.
      var speeds = (payload && payload[ROAD_SPEED_KEY]) || payload || {};
      host.innerHTML = Object.keys(speeds).length
        ? roadSpeedsCard(speeds, globals.road_speeds_source)
        : missingCard();
    });
  });
})();
