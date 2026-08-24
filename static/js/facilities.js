/* Facilities: battery swap stations and taxi ranks on one map.
 *
 * Two files rather than one, so the panel works on whichever is selected and
 * the other stays on the map for context. A scenario with only stations - most
 * of them - simply never offers the rank layer.
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

  function pointStyle(color, radius) {
    return new ol.style.Style({
      image: new ol.style.RegularShape({
        points: 5,
        radius: radius,
        radius2: radius / 2,
        angle: 0,
        fill: new ol.style.Fill({ color: color }),
        stroke: new ol.style.Stroke({ color: "#fff", width: 1.5 })
      })
    });
  }

  var stationSource = new ol.source.Vector();
  var rankSource = new ol.source.Vector();

  var map = new ol.Map({
    target: "map",
    layers: [
      new ol.layer.Tile({ source: new ol.source.OSM() }),
      new ol.layer.Vector({ source: rankSource, style: pointStyle("#0071e3", 6) }),
      new ol.layer.Vector({ source: stationSource, style: pointStyle("#ff3b30", 9) })
    ],
    view: new ol.View({ center: ol.proj.fromLonLat([0, 0]), zoom: 2 })
  });

  function read(geojson) {
    return format.readFeatures(geojson, {
      dataProjection: DATA_PROJECTION,
      featureProjection: VIEW_PROJECTION
    });
  }

  function fitAll() {
    var extent = ol.extent.createEmpty();
    [stationSource, rankSource].forEach(function (source) {
      if (source.getFeatures().length) {
        ol.extent.extend(extent, source.getExtent());
      }
    });
    if (isFinite(extent[0])) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 400 });
    }
  }

  function parse(text) {
    var geojson = JSON.parse(text);
    if (!geojson || !Array.isArray(geojson.features)) {
      throw new Error("That file is not a GeoJSON FeatureCollection.");
    }
    return geojson;
  }

  function countPosts(features) {
    return features.reduce(function (total, feature) {
      return total + (Number((feature.properties || {}).posts) || 0);
    }, 0);
  }

  E.boot("facilities.html", function (scenario) {
    document.getElementById("scenarioName").textContent =
      scenario.name + " — facilities";

    // The ranks are context, drawn once and left alone; the panel drives the
    // stations, which is the layer a scenario is most likely to be varying.
    var ranks = scenario.taxi_ranks
      ? E.fetchJson(scenario.taxi_ranks).then(function (geojson) {
          rankSource.addFeatures(read(geojson));
          return (geojson.features || []).length;
        }).catch(function () {
          return 0;
        })
      : Promise.resolve(0);

    return ranks.then(function (rankCount) {
      var panel = E.filePanel({
        url: scenario.swap_stations,
        parse: parse,
        render: function (geojson) {
          stationSource.clear();
          stationSource.addFeatures(read(geojson));
          fitAll();
        },
        describe: function (geojson) {
          var features = geojson.features || [];
          return (
            '<dl class="ap-summary mb-3">' +
            "<div><dt>Swap stations</dt><dd>" + features.length + "</dd></div>" +
            "<div><dt>Swap posts</dt><dd>" + countPosts(features) + "</dd></div>" +
            (scenario.taxi_ranks
              ? "<div><dt>Taxi ranks</dt><dd>" + rankCount + "</dd></div>"
              : "") +
            "</dl>" +
            '<p class="ap-hint">Stations are the red stars' +
            (scenario.taxi_ranks ? "; taxi ranks are the smaller blue ones." : ".") +
            "</p>"
          );
        },
        serialise: function (geojson) {
          return JSON.stringify(geojson, null, 2);
        },
        filename: E.slugify(scenario.name) + "-swap-stations.geojson",
        publishedAs: "Published stations"
      });
      return panel.start();
    });
  });
})();
