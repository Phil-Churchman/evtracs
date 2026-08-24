/* Demand points: where trips start and end, on a map.
 *
 * Same contract as the area page - the scenario's published file is what you
 * arrive at, you can open another to compare, and you can export what is shown.
 * Nothing is written back.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var mapEl = document.getElementById("map");
  if (!mapEl || typeof ol === "undefined") {
    return;
  }

  var DATA_PROJECTION = "EPSG:4326";
  var VIEW_PROJECTION = "EPSG:3857";

  var format = new ol.format.GeoJSON();

  var source = new ol.source.Vector();
  var map = new ol.Map({
    target: "map",
    layers: [
      new ol.layer.Tile({ source: new ol.source.OSM() }),
      new ol.layer.Vector({
        source: source,
        style: new ol.style.Style({
          image: new ol.style.Circle({
            radius: 5,
            fill: new ol.style.Fill({ color: "#0071e3" }),
            stroke: new ol.style.Stroke({ color: "#fff", width: 1.5 })
          })
        })
      })
    ],
    view: new ol.View({ center: ol.proj.fromLonLat([0, 0]), zoom: 2 })
  });

  function parse(text) {
    var geojson = JSON.parse(text);
    if (!geojson || !Array.isArray(geojson.features)) {
      throw new Error("That file is not a GeoJSON FeatureCollection.");
    }
    return geojson;
  }

  function render(geojson) {
    source.clear();
    source.addFeatures(
      format.readFeatures(geojson, {
        dataProjection: DATA_PROJECTION,
        featureProjection: VIEW_PROJECTION
      })
    );
    var extent = source.getExtent();
    if (source.getFeatures().length && extent && isFinite(extent[0])) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 400 });
    }
  }

  /* Points carry a `type` naming what sort of place they are and a
     `weight_in_category` saying how much traffic they draw, so the summary
     counts by type and totals the weight rather than just counting pins. */
  function describe(geojson) {
    var features = geojson.features || [];
    var byType = {};
    var totalWeight = 0;

    features.forEach(function (feature) {
      var props = feature.properties || {};
      var name = props.type || props.category || "unspecified";
      byType[name] = (byType[name] || 0) + 1;
      totalWeight += Number(props.weight_in_category) || 0;
    });

    var rows = Object.keys(byType)
      .sort()
      .map(function (name) {
        return "<div><dt>" + E.escapeHtml(name) + "</dt><dd>" + byType[name] + "</dd></div>";
      })
      .join("");

    return (
      '<dl class="ap-summary mb-3">' +
      "<div><dt>Points</dt><dd>" + features.length + "</dd></div>" +
      "<div><dt>Total weight</dt><dd>" + totalWeight.toLocaleString() + "</dd></div>" +
      rows +
      "</dl>"
    );
  }

  E.boot("demand.html", function (scenario) {
    document.getElementById("scenarioName").textContent =
      scenario.name + " — demand points";

    return E.filePanel({
      url: scenario.demand_points,
      parse: parse,
      render: render,
      describe: describe,
      serialise: function (geojson) {
        return JSON.stringify(geojson, null, 2);
      },
      filename: E.slugify(scenario.name) + "-demand-points.geojson"
    }).start();
  });
})();
