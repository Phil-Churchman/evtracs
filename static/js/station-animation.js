/* Swap station queue animation.
 *
 * Adapted from Model/animation/station_animation.html. The playback logic is
 * unchanged - the timestep log is read into per-station records, swapping
 * agents are held in the same post from step to step so a vehicle does not
 * appear to hop between bays, and a click on a station plays its day back.
 *
 * What changed is where the data comes from: the original derived paths from
 * scenario.json's `folder_name` and offered file pickers as a fallback. Here
 * the published scenario entry names its files, and the file pickers are gone -
 * the site is read-only, and the data it shows is the data it ships.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var mapEl = document.getElementById("map");
  if (!mapEl || typeof ol === "undefined") {
    return;
  }

  // --- Map ------------------------------------------------------------------

  var areaSource = new ol.source.Vector();
  var areaLayer = new ol.layer.Vector({
    source: areaSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "red", width: 2 }),
      fill: new ol.style.Fill({ color: "rgba(255,0,0,0.1)" })
    })
  });

  var stationSource = new ol.source.Vector();
  var stationLayer = new ol.layer.Vector({
    source: stationSource,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 8,
        fill: new ol.style.Fill({ color: "#0d6efd" }),
        stroke: new ol.style.Stroke({ color: "white", width: 2 })
      })
    })
  });

  var map = new ol.Map({
    target: "map",
    layers: [new ol.layer.Tile({ source: new ol.source.OSM() }), areaLayer, stationLayer],
    view: new ol.View({ center: ol.proj.fromLonLat([0, 0]), zoom: 2 })
  });

  // --- State ----------------------------------------------------------------

  var recordsByStation = {};
  var processedRecords = [];
  var currentStepIdx = 0;
  var isPlaying = false;
  var playInterval = null;
  var playbackSpeed = 500;

  var lastRenderedPostState = [];
  var lastRenderedQueueState = [];

  var stationModal = new bootstrap.Modal(document.getElementById("stationModal"));

  // --- Status badges --------------------------------------------------------

  function setStatus(id, text, state) {
    var badge = document.getElementById(id);
    badge.textContent = text;
    badge.className = "ap-pill" + (state ? " " + state : "");
  }

  // --- Loading --------------------------------------------------------------

  function loadArea(url) {
    return window
      .fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (geojson) {
        var features = new ol.format.GeoJSON().readFeatures(geojson, {
          featureProjection: "EPSG:3857"
        });
        areaSource.clear();
        areaSource.addFeatures(features);
        if (features.length) {
          map.getView().fit(areaSource.getExtent(), { padding: [40, 40, 40, 40], duration: 600 });
        }
        setStatus("areaStatus", "Area: loaded", "is-live");
      })
      .catch(function (error) {
        console.warn("Could not load the area", error);
        setStatus("areaStatus", "Area: not found", "is-error");
      });
  }

  function loadStations(url) {
    return window
      .fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (geojson) {
        var features = new ol.format.GeoJSON()
          .readFeatures(geojson, { featureProjection: "EPSG:3857" })
          .filter(function (f) {
            return f.getGeometry().getType() === "Point";
          });
        stationSource.clear();
        stationSource.addFeatures(features);
        if (features.length && !areaSource.getFeatures().length) {
          map.getView().fit(stationSource.getExtent(), { padding: [40, 40, 40, 40], duration: 600 });
        }
        setStatus("stationsStatus", features.length + " stations", "is-live");
      })
      .catch(function (error) {
        console.warn("Could not load the swap stations", error);
        setStatus("stationsStatus", "Stations: not found", "is-error");
      });
  }

  function loadStationLog(url) {
    return window
      .fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        var workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
        var sheet = workbook.Sheets[workbook.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(sheet);

        recordsByStation = {};
        rows.forEach(function (row) {
          var stationId = row.station_id;
          if (!recordsByStation[stationId]) {
            recordsByStation[stationId] = [];
          }
          recordsByStation[stationId].push({
            step: row.sim_step_sec,
            time: row.timestamp,
            swapping: splitIds(row.swapping_agent_ids),
            queueing: splitIds(row.queueing_agent_ids)
          });
        });

        Object.keys(recordsByStation).forEach(function (stationId) {
          recordsByStation[stationId].sort(function (a, b) {
            return a.step - b.step;
          });
        });

        setStatus("logStatus", rows.length.toLocaleString() + " log rows", "is-live");
      })
      .catch(function (error) {
        console.warn("Could not load the station log", error);
        setStatus("logStatus", "Queue log: not found", "is-error");
      });
  }

  function splitIds(value) {
    if (!value) {
      return [];
    }
    return String(value)
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  // --- Time formatting ------------------------------------------------------

  function formatTime(isoStr, stepSec) {
    if (isoStr) {
      var d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], {
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
        });
      }
    }
    if (stepSec != null) {
      var hrs = Math.floor(stepSec / 3600);
      var mins = Math.floor((stepSec % 3600) / 60);
      var secs = stepSec % 60;
      return [hrs, mins, secs]
        .map(function (v) {
          return String(v).padStart(2, "0");
        })
        .join(":");
    }
    return "--:--:--";
  }

  // --- Persistent post assignment ------------------------------------------
  //
  // A vehicle keeps the post it started swapping at, so the bays stay still
  // while the queue moves. Without this a vehicle appears to jump between posts
  // whenever another one leaves.

  function processStationPosts(rawRecords, postsCount) {
    var processed = [];
    var postSlots = new Array(postsCount).fill(null);

    rawRecords.forEach(function (rec) {
      var swappingNow = new Set(rec.swapping);

      for (var i = 0; i < postsCount; i++) {
        if (postSlots[i] !== null && !swappingNow.has(postSlots[i])) {
          postSlots[i] = null;
        }
      }

      rec.swapping.forEach(function (agentId) {
        if (postSlots.indexOf(agentId) === -1) {
          var free = postSlots.indexOf(null);
          if (free !== -1) {
            postSlots[free] = agentId;
          }
        }
      });

      processed.push({
        step: rec.step,
        time: rec.time,
        posts: postSlots.slice(),
        queueing: rec.queueing
      });
    });

    return processed;
  }

  // --- Hover tooltip --------------------------------------------------------

  var hoverOverlay = new ol.Overlay({
    element: document.createElement("div"),
    offset: [10, 0],
    positioning: "center-left"
  });
  hoverOverlay.getElement().className = "ap-map-tip";
  map.addOverlay(hoverOverlay);

  map.on("pointermove", function (evt) {
    var pixel = map.getEventPixel(evt.originalEvent);
    var hit = map.hasFeatureAtPixel(pixel, {
      layerFilter: function (l) {
        return l === stationLayer;
      }
    });
    if (!hit) {
      hoverOverlay.setPosition(undefined);
      return;
    }

    map.forEachFeatureAtPixel(
      pixel,
      function (feature, layer) {
        if (layer !== stationLayer) {
          return;
        }
        var props = feature.getProperties();
        var stationId = props.facility_id != null ? props.facility_id
          : props.id != null ? props.id
          : props.station_id != null ? props.station_id
          : "Unknown";
        var posts = props.posts != null ? props.posts : 2;
        hoverOverlay.getElement().textContent =
          "Station " + stationId + " (" + posts + " posts)";
        hoverOverlay.setPosition(feature.getGeometry().getCoordinates());
      },
      {
        layerFilter: function (l) {
          return l === stationLayer;
        }
      }
    );
  });

  // --- Click a station ------------------------------------------------------

  var selectStation = new ol.interaction.Select({ layers: [stationLayer] });
  map.addInteraction(selectStation);

  selectStation.on("select", function (e) {
    if (!e.selected.length) {
      return;
    }
    var feature = e.selected[0];
    selectStation.getFeatures().clear();

    var props = feature.getProperties();
    var stationId = props.facility_id != null ? props.facility_id
      : props.id != null ? props.id
      : props.station_id;
    var postsCount = parseInt(props.posts != null ? props.posts : 2, 10);

    if (stationId == null) {
      window.alert("This station has no id, so its queue cannot be looked up.");
      return;
    }

    var raw = recordsByStation[stationId] || [];
    if (!raw.length) {
      window.alert("No queue records were published for station " + stationId + ".");
      return;
    }

    processedRecords = processStationPosts(raw, postsCount);
    openModal(stationId, postsCount);
  });

  function openModal(stationId, postsCount) {
    document.getElementById("modalStationTitle").textContent =
      "Swap station " + stationId + " (" + postsCount + " posts)";

    var slider = document.getElementById("timeSlider");
    slider.min = 0;
    slider.max = processedRecords.length - 1;
    slider.value = 0;
    currentStepIdx = 0;

    lastRenderedPostState = [];
    // null rather than [], so the first render always paints the queue box even
    // when the station opens with nobody waiting.
    lastRenderedQueueState = null;

    buildPostDom(postsCount);
    stopAnimation();
    renderStep();
    stationModal.show();
  }

  function buildPostDom(postsCount) {
    var container = document.getElementById("postsContainer");
    container.innerHTML = "";
    for (var i = 0; i < postsCount; i++) {
      var col = document.createElement("div");
      col.className = "col-" + (postsCount <= 3 ? 12 / postsCount : 4);
      col.innerHTML =
        '<div class="ap-post-box" id="postBox_' + i + '">' +
        '<span class="ap-post-label">Post ' + (i + 1) + "</span>" +
        '<div id="postContent_' + i + '"><span class="ap-post-free">Available</span></div>' +
        "</div>";
      container.appendChild(col);
    }
  }

  function renderStep() {
    var record = processedRecords[currentStepIdx];
    if (!record) {
      return;
    }

    document.getElementById("modalClockDisplay").textContent =
      formatTime(record.time, record.step);
    document.getElementById("stepDisplay").textContent =
      currentStepIdx + 1 + " / " + processedRecords.length;
    document.getElementById("timeSlider").value = currentStepIdx;

    // Only the posts that changed are rewritten: at 200x these render dozens of
    // times a second, and rebuilding every box each step visibly stutters.
    record.posts.forEach(function (agentId, i) {
      if (lastRenderedPostState[i] === agentId) {
        return;
      }
      var box = document.getElementById("postBox_" + i);
      var content = document.getElementById("postContent_" + i);
      if (agentId !== null) {
        box.classList.add("is-occupied");
        content.innerHTML = '<span class="ap-agent-badge is-swapping">Agent ' + agentId + "</span>";
      } else {
        box.classList.remove("is-occupied");
        content.innerHTML = '<span class="ap-post-free">Available</span>';
      }
      lastRenderedPostState[i] = agentId;
    });

    if (lastRenderedQueueState === null ||
        record.queueing.join(",") !== lastRenderedQueueState.join(",")) {
      var queue = document.getElementById("queueContainer");
      document.getElementById("queueCount").textContent = record.queueing.length;
      queue.innerHTML = "";

      if (!record.queueing.length) {
        queue.innerHTML = '<span class="ap-post-free">Queue is empty</span>';
      } else {
        record.queueing.forEach(function (agentId) {
          var badge = document.createElement("span");
          badge.className = "ap-agent-badge is-queueing";
          badge.textContent = "Agent " + agentId;
          queue.appendChild(badge);
        });
      }
      lastRenderedQueueState = record.queueing.slice();
    }
  }

  // --- Playback -------------------------------------------------------------

  var btnPlay = document.getElementById("btnPlay");

  function startAnimation() {
    isPlaying = true;
    btnPlay.textContent = "Pause";
    btnPlay.className = "btn btn-warning btn-sm";

    playInterval = window.setInterval(function () {
      if (currentStepIdx < processedRecords.length - 1) {
        currentStepIdx += 1;
        renderStep();
      } else {
        stopAnimation();
      }
    }, playbackSpeed);
  }

  function stopAnimation() {
    isPlaying = false;
    btnPlay.textContent = "Play";
    btnPlay.className = "btn btn-primary btn-sm";
    if (playInterval) {
      window.clearInterval(playInterval);
    }
  }

  btnPlay.addEventListener("click", function () {
    if (isPlaying) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });

  document.getElementById("timeSlider").addEventListener("input", function (e) {
    currentStepIdx = parseInt(e.target.value, 10);
    renderStep();
  });

  document.querySelectorAll(".speed-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      document.querySelectorAll(".speed-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      e.target.classList.add("active");
      playbackSpeed = parseInt(e.target.dataset.speed, 10);
      if (isPlaying) {
        stopAnimation();
        startAnimation();
      }
    });
  });

  document.getElementById("closeModalBtn").addEventListener("click", stopAnimation);
  document.getElementById("stationModal").addEventListener("hidden.bs.modal", stopAnimation);

  // --- Page -----------------------------------------------------------------

  E.boot("stations.html", function (scenario) {
    document.getElementById("scenarioName").textContent = scenario.name;

    var animation = scenario.animation || {};
    var pending = [];

    if (scenario.area) {
      pending.push(loadArea(scenario.area));
    } else {
      setStatus("areaStatus", "Area: none published", "");
    }

    if (scenario.swap_stations) {
      pending.push(loadStations(scenario.swap_stations));
    } else {
      setStatus("stationsStatus", "Stations: none published", "");
    }

    if (animation.station_log) {
      setStatus("logStatus", "Queue log: loading…", "");
      pending.push(loadStationLog(animation.station_log));
    } else {
      setStatus("logStatus", "Queue log: none published", "");
    }

    return Promise.all(pending);
  });
})();
