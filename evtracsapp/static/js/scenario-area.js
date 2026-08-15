/* Scenario area editor.
 *
 * Three ways to define an area - draw it, import a file, or pull an
 * administrative boundary from OpenStreetMap. All three end up in the same
 * vector source, and the Save button posts whatever is there to Django, which
 * validates it before storing. Nothing here is trusted server-side.
 *
 * Geometry is held in EPSG:3857 for display and written out as EPSG:4326,
 * which is what GeoJSON requires and what the server expects.
 */
(function () {
  "use strict";

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
  var saveForm = document.getElementById("saveForm");
  var saveBtn = document.getElementById("saveBtn");
  var geojsonField = document.getElementById("geojsonField");
  var sourceField = document.getElementById("sourceField");
  var sourceLabelField = document.getElementById("sourceLabelField");
  var relationField = document.getElementById("relationField");
  var dirtyNote = document.getElementById("dirtyNote");

  var pendingSource = "";
  var pendingLabel = "";
  var pendingRelationId = "";
  var dirty = false;

  function setStatus(message, isError) {
    searchStatus.textContent = message || "";
    searchStatus.style.color = isError ? "var(--ap-red)" : "";
  }

  function markDirty(source, label, relationId) {
    dirty = true;
    pendingSource = source;
    pendingLabel = label || "";
    pendingRelationId = relationId == null ? "" : String(relationId);
    refreshControls();
  }

  function refreshControls() {
    var hasFeatures = areaSource.getFeatures().length > 0;
    saveBtn.disabled = !(hasFeatures && dirty);
    dirtyNote.hidden = !dirty;
  }

  function fitToArea(duration) {
    if (areaSource.getFeatures().length === 0) {
      return;
    }
    var extent = areaSource.getExtent();
    if (extent && isFinite(extent[0])) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: duration || 0 });
    }
  }

  function replaceArea(features, source, label, relationId) {
    areaSource.clear();
    areaSource.addFeatures(features);
    fitToArea(500);
    markDirty(source, label, relationId);
  }

  function readGeoJson(geojson) {
    return geoJsonFormat.readFeatures(geojson, {
      dataProjection: DATA_PROJECTION,
      featureProjection: VIEW_PROJECTION
    });
  }

  // --- Existing saved area --------------------------------------------------

  var savedRaw = mapEl.getAttribute("data-area");
  if (savedRaw) {
    try {
      areaSource.addFeatures(readGeoJson(JSON.parse(savedRaw)));
      // Wait for the map to size itself before fitting.
      map.once("postrender", function () {
        fitToArea(0);
      });
    } catch (error) {
      setStatus("Could not draw the saved area.", true);
    }
  }
  refreshControls();

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
      fitToArea(500);
      markDirty("drawn", "Drawn on map", null);
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
      refreshControls();
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

  // --- Import from file -----------------------------------------------------

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
      replaceArea(features, "file", file.name, null);
      setStatus("Loaded " + file.name + ". Save to keep it.");
    };
    reader.onerror = function () {
      setStatus("Could not read that file.", true);
    };
    reader.readAsText(file);

    // Allow re-importing the same filename twice in a row.
    event.target.value = "";
  });

  // --- Import from OpenStreetMap -------------------------------------------

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
    setStatus("Found " + relations.length + " region(s). Pick one to load it.");
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
      replaceArea(features, "osm", name, relation.id);
      setStatus('Loaded "' + name + '". Save to keep it.');
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

  // --- Saving ---------------------------------------------------------------

  saveForm.addEventListener("submit", function (event) {
    var features = areaSource.getFeatures();
    if (!features.length) {
      event.preventDefault();
      setStatus("Draw or import an area first.", true);
      return;
    }

    geojsonField.value = geoJsonFormat.writeFeatures(features, {
      dataProjection: DATA_PROJECTION,
      featureProjection: VIEW_PROJECTION,
      decimals: 6
    });
    sourceField.value = pendingSource;
    sourceLabelField.value = pendingLabel;
    relationField.value = pendingRelationId;

    dirty = false;
  });

  window.addEventListener("beforeunload", function (event) {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  areaSource.on("addfeature", refreshControls);
  areaSource.on("removefeature", refreshControls);
})();
