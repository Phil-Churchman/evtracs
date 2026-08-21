/* Scenario area viewer.
 *
 * The scenario's published area is read from its .geojson file and drawn on the
 * map. From there the page is a scratchpad: an area can be drawn, loaded from a
 * file, or pulled from OpenStreetMap so it can be compared against the
 * published one. None of that is saved - there is no server to save it to - so
 * anything worth keeping has to be exported, and "Back to published area"
 * always restores the file's geometry.
 *
 * Geometry is held in EPSG:3857 for display and written out as EPSG:4326, which
 * is what GeoJSON requires.
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
  var OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  var SEARCH_ATTEMPTS = 3;

  var geoJsonFormat = new ol.format.GeoJSON();

  // --- Layers ---------------------------------------------------------------

  var areaSource = new ol.source.Vector();
  var areaLayer = new ol.layer.Vector({
    source: areaSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#0071e3", width: 2.5 }),
      fill: new ol.style.Fill({ color: "rgba(0, 113, 227, 0.14)" })
    })
  });

  var map = new ol.Map({
    target: "map",
    layers: [new ol.layer.Tile({ source: new ol.source.OSM() }), areaLayer],
    view: new ol.View({ center: ol.proj.fromLonLat([0, 0]), zoom: 2 })
  });

  // --- Elements -------------------------------------------------------------

  var drawBtn = document.getElementById("drawBtn");
  var fileInput = document.getElementById("fileInput");
  var searchInput = document.getElementById("searchInput");
  var searchBtn = document.getElementById("searchBtn");
  var searchResults = document.getElementById("searchResults");
  var searchStatus = document.getElementById("searchStatus");
  var exportBtn = document.getElementById("exportBtn");
  var resetBtn = document.getElementById("resetBtn");
  var areaSummary = document.getElementById("areaSummary");
  var areaOrigin = document.getElementById("areaOrigin");

  // The published area, kept so the map can always be put back to it.
  var published = null;
  var publishedOrigin = "";
  var scenarioName = "scenario";
  var origin = "";

  function setStatus(message, isError) {
    searchStatus.textContent = message || "";
    searchStatus.style.color = isError ? "var(--ap-red)" : "";
  }

  // --- Summary --------------------------------------------------------------

  function countVertices(features) {
    return features.reduce(function (total, feature) {
      var geometry = feature.getGeometry();
      if (!geometry || typeof geometry.getCoordinates !== "function") {
        return total;
      }
      // Rings nest to different depths by geometry type, so just walk them.
      var stack = [geometry.getCoordinates()];
      while (stack.length) {
        var node = stack.pop();
        if (Array.isArray(node[0])) {
          stack.push.apply(stack, node);
        } else {
          total += 1;
        }
      }
      return total;
    }, 0);
  }

  function lonLatExtent() {
    var extent = areaSource.getExtent();
    if (!extent || !isFinite(extent[0])) {
      return null;
    }
    return ol.proj.transformExtent(extent, VIEW_PROJECTION, DATA_PROJECTION);
  }

  function refreshSummary() {
    var features = areaSource.getFeatures();
    var hasArea = features.length > 0;

    exportBtn.disabled = !hasArea;
    resetBtn.disabled = !published || origin === "published";

    areaOrigin.hidden = !origin;
    if (origin) {
      areaOrigin.textContent = origin === "published" ? publishedOrigin || "Published" : origin;
      areaOrigin.className = origin === "published" ? "ap-pill is-live" : "ap-pill is-warn";
    }

    if (!hasArea) {
      areaSummary.innerHTML =
        '<p class="ap-hint mb-3">Nothing on the map yet.</p>';
      return;
    }

    var bounds = lonLatExtent();
    areaSummary.innerHTML =
      '<dl class="ap-summary mb-3">' +
      "<div><dt>Polygons</dt><dd>" + features.length + "</dd></div>" +
      "<div><dt>Points</dt><dd>" + countVertices(features) + "</dd></div>" +
      (bounds
        ? '<div><dt>Bounds</dt><dd class="ap-mono">' +
          bounds[0].toFixed(4) + ", " + bounds[1].toFixed(4) + "<br>" +
          bounds[2].toFixed(4) + ", " + bounds[3].toFixed(4) +
          "</dd></div>"
        : "") +
      "</dl>";
  }

  // --- Geometry helpers -----------------------------------------------------

  function fitToArea(duration) {
    if (areaSource.getFeatures().length === 0) {
      return;
    }
    var extent = areaSource.getExtent();
    if (extent && isFinite(extent[0])) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: duration || 0 });
    }
  }

  function readGeoJson(geojson) {
    return geoJsonFormat.readFeatures(geojson, {
      dataProjection: DATA_PROJECTION,
      featureProjection: VIEW_PROJECTION
    });
  }

  function writeGeoJson() {
    return geoJsonFormat.writeFeatures(areaSource.getFeatures(), {
      dataProjection: DATA_PROJECTION,
      featureProjection: VIEW_PROJECTION,
      decimals: 6
    });
  }

  function replaceArea(features, label, duration) {
    areaSource.clear();
    areaSource.addFeatures(features);
    origin = label;
    fitToArea(duration == null ? 500 : duration);
    refreshSummary();
  }

  function showPublished(duration) {
    if (!published) {
      return;
    }
    replaceArea(readGeoJson(published), "published", duration);
  }

  // --- Drawing --------------------------------------------------------------
  //
  // Shift is held to draw so that plain dragging still pans the map. A polygon
  // only closes on a genuine double-click, hence the timing check: without it,
  // two deliberate but unhurried clicks would end the shape early.

  var draw = null;
  var pendingFeature = null;
  var acceptOverlay = null;
  var lastClickTime = 0;

  function removeOverlay() {
    if (acceptOverlay) {
      map.removeOverlay(acceptOverlay);
      acceptOverlay = null;
    }
  }

  function stopDrawing() {
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    drawBtn.classList.remove("is-armed");
    drawBtn.innerHTML = '<i class="bi bi-vector-pen"></i> Draw a new area';
  }

  function startDrawing() {
    if (draw) {
      stopDrawing();
      return;
    }

    draw = new ol.interaction.Draw({
      source: areaSource,
      type: "Polygon",
      condition: function (event) {
        return event.originalEvent.shiftKey;
      },
      freehandCondition: function (event) {
        return event.originalEvent.shiftKey && event.type === "pointerdrag";
      },
      finishCondition: function () {
        var now = Date.now();
        var sinceLast = now - lastClickTime;
        lastClickTime = now;
        return sinceLast < 300;
      },
      snapTolerance: 10,
      pixelTolerance: 5
    });

    map.addInteraction(draw);
    drawBtn.classList.add("is-armed");
    drawBtn.innerHTML = '<i class="bi bi-x-lg"></i> Cancel drawing';
    setStatus("Hold Shift and click to place points; double-click to finish.");

    draw.on("drawstart", function (event) {
      pendingFeature = event.feature;
      removeOverlay();
    });

    draw.on("drawend", function (event) {
      pendingFeature = event.feature;
      var geometry = pendingFeature.getGeometry();
      var position = geometry.getCoordinates()[0][0];
      // The feature is not in the source until after this handler returns.
      window.setTimeout(function () {
        acceptOverlay = buildAcceptOverlay(position);
        map.addOverlay(acceptOverlay);
      }, 50);
    });
  }

  function buildAcceptOverlay(position) {
    var container = document.createElement("div");
    container.className = "ap-map-overlay";

    var accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn btn-sm btn-primary";
    accept.innerHTML = '<i class="bi bi-check-lg"></i> Use this area';
    accept.onclick = function () {
      var kept = pendingFeature;
      areaSource.clear();
      if (kept) {
        areaSource.addFeature(kept);
      }
      pendingFeature = null;
      removeOverlay();
      stopDrawing();
      origin = "Drawn on map";
      fitToArea(500);
      refreshSummary();
      setStatus("");
    };

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-sm btn-secondary";
    cancel.innerHTML = "Discard";
    cancel.onclick = function () {
      if (pendingFeature) {
        areaSource.removeFeature(pendingFeature);
        pendingFeature = null;
      }
      removeOverlay();
      refreshSummary();
      setStatus("");
    };

    container.appendChild(accept);
    container.appendChild(cancel);

    return new ol.Overlay({
      element: container,
      position: position,
      positioning: "bottom-left",
      stopEvent: true,
      offset: [12, -12]
    });
  }

  drawBtn.addEventListener("click", startDrawing);

  // --- Load from file -------------------------------------------------------

  fileInput.addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function (loaded) {
      var features;
      try {
        features = readGeoJson(JSON.parse(loaded.target.result));
      } catch (error) {
        setStatus("That file is not valid GeoJSON.", true);
        return;
      }

      if (!features.length) {
        setStatus("That file contains no features.", true);
        return;
      }

      stopDrawing();
      removeOverlay();
      replaceArea(features, file.name);
      setStatus("Showing " + file.name + ".");
    };
    reader.onerror = function () {
      setStatus("Could not read that file.", true);
    };
    reader.readAsText(file);

    // Allow re-loading the same filename twice in a row.
    event.target.value = "";
  });

  // --- Load from OpenStreetMap ---------------------------------------------

  var relations = [];

  async function overpass(query) {
    var response = await fetch(OVERPASS_URL, { method: "POST", body: query });
    if (!response.ok) {
      throw new Error("Overpass returned " + response.status);
    }
    return response.json();
  }

  async function searchRegion() {
    var query = searchInput.value.trim();
    if (query.length < 3) {
      setStatus("Type at least three characters.", true);
      return;
    }

    searchBtn.disabled = true;
    searchResults.hidden = true;

    // Overpass is a shared public service and rejects requests when busy, so a
    // couple of retries turns a transient failure into a slower success.
    for (var attempt = 1; attempt <= SEARCH_ATTEMPTS; attempt++) {
      setStatus("Searching OpenStreetMap (" + attempt + " of " + SEARCH_ATTEMPTS + ")...");
      try {
        var escaped = query.replace(/["\\]/g, "\\$&");
        var data = await overpass(
          '[out:json][timeout:60];relation["boundary"="administrative"]["name"~"' +
            escaped +
            '",i];out tags;'
        );
        relations = data.elements || [];
        showResults();
        searchBtn.disabled = false;
        return;
      } catch (error) {
        if (attempt === SEARCH_ATTEMPTS) {
          setStatus("Search failed. OpenStreetMap may be busy - try again.", true);
          searchBtn.disabled = false;
        }
      }
    }
  }

  function showResults() {
    searchResults.innerHTML = '<option value="">-- Select a result --</option>';

    if (!relations.length) {
      searchResults.hidden = true;
      setStatus("No matching regions found.", true);
      return;
    }

    relations.forEach(function (relation, index) {
      var option = document.createElement("option");
      var tags = relation.tags || {};
      option.textContent = (tags.name || "Unnamed") + " (level " + (tags.admin_level || "?") + ")";
      option.value = String(index);
      searchResults.appendChild(option);
    });

    searchResults.hidden = false;
    setStatus("Found " + relations.length + " region(s). Pick one to show it.");
  }

  async function loadBoundary(index) {
    var relation = relations[index];
    if (!relation) {
      return;
    }

    var name = (relation.tags && relation.tags.name) || "OSM relation " + relation.id;
    setStatus('Fetching "' + name + '"...');

    try {
      var data = await overpass("[out:json][timeout:60];relation(" + relation.id + ");out geom;");
      var features = readGeoJson(osmtogeojson(data));

      if (!features.length) {
        setStatus("That region returned no geometry.", true);
        return;
      }

      stopDrawing();
      removeOverlay();
      replaceArea(features, name);
      setStatus('Showing "' + name + '".');
    } catch (error) {
      setStatus("Could not fetch that boundary. Try again.", true);
    }
  }

  searchBtn.addEventListener("click", searchRegion);

  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchRegion();
    }
  });

  searchResults.addEventListener("change", function () {
    var index = this.value;
    this.selectedIndex = 0;
    if (index !== "") {
      loadBoundary(Number(index));
    }
  });

  // --- Export and reset -----------------------------------------------------

  exportBtn.addEventListener("click", function () {
    if (areaSource.getFeatures().length === 0) {
      return;
    }
    E.download(E.slugify(scenarioName) + "-area.geojson", writeGeoJson(), "application/geo+json");
  });

  resetBtn.addEventListener("click", function () {
    stopDrawing();
    removeOverlay();
    showPublished(500);
    setStatus("");
  });

  areaSource.on("addfeature", refreshSummary);
  areaSource.on("removefeature", refreshSummary);

  // --- Page -----------------------------------------------------------------

  E.boot("area.html", function (scenario) {
    scenarioName = scenario.name;
    publishedOrigin = scenario.area_source || "Published";
    document.getElementById("scenarioName").textContent = scenario.name;

    if (!scenario.area) {
      refreshSummary();
      setStatus("This scenario has no published area. Draw or load one to explore.");
      return;
    }

    return E.fetchJson(scenario.area).then(function (geojson) {
      published = geojson;
      showPublished(0);
      // The map may still have been sizing itself when the geometry arrived,
      // so fit once more as soon as it has actually rendered.
      map.once("postrender", function () {
        fitToArea(0);
      });
    });
  });

  refreshSummary();
})();
