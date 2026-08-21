/* Trip animation.
 *
 * Adapted from Model/animation/animation.html. The logic is the same - agent
 * trips are read once, each LineString is walked segment by segment against the
 * clock, and stationary trips are drawn as dots - but where the original read
 * Model/scenario.json and derived paths from `folder_name`, this reads the
 * published scenario entry in data/scenarios.json, which names its files
 * outright.
 *
 * Only the first `animation_agents` trip files are published, which is exactly
 * what the animation asks for.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var mapEl = document.getElementById("map");
  if (!mapEl || typeof ol === "undefined") {
    return;
  }

  var FILE_PREFIX = "agent_";
  var FILE_SUFFIX = "_time.geojson";

  // Marker sizes, in pixels.
  var STOP_RADIUS = 7; // a stop that means something: swap, pickup, hail, rank
  var IDLE_RADIUS = 3; // parked between trips

  var COLORS = {
    to_swap: "red",
    taxi: "blue",
    hail: "purple",
    passenger: "green",
    pickup: "orange"
  };

  function getColor(type) {
    return COLORS[type] || "black";
  }

  // --- Map ------------------------------------------------------------------

  var map = new ol.Map({
    target: "map",
    layers: [new ol.layer.Tile({ source: new ol.source.OSM() })],
    view: new ol.View({ center: ol.proj.fromLonLat([0, 0]), zoom: 12 })
  });

  var areaLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#FF0000", width: 2 }),
      fill: new ol.style.Fill({ color: "rgba(255,0,0,0.1)" })
    })
  });
  map.addLayer(areaLayer);

  var swapLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      image: new ol.style.RegularShape({
        points: 5, radius: 8, radius2: 4, angle: 0,
        fill: new ol.style.Fill({ color: "red" })
      })
    })
  });
  map.addLayer(swapLayer);

  var rankLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      image: new ol.style.RegularShape({
        points: 5, radius: 5, radius2: 2.5, angle: 0,
        fill: new ol.style.Fill({ color: "blue" })
      })
    })
  });
  map.addLayer(rankLayer);

  var animationLayer = new ol.layer.Vector({ source: new ol.source.Vector() });
  map.addLayer(animationLayer);

  // --- State ----------------------------------------------------------------

  var features = [];
  var globalStart = Infinity;
  var globalEnd = -Infinity;
  var currentTime = 0;
  var playing = false;
  var animationId = null;

  var playBtn = document.getElementById("playBtn");
  var resetBtn = document.getElementById("resetBtn");
  var speedSlider = document.getElementById("speedSlider");
  var timeSlider = document.getElementById("timeSlider");
  var timeLabel = document.getElementById("timeLabel");
  var loadNote = document.getElementById("loadNote");

  // --- Load diagnostics -----------------------------------------------------
  //
  // fetch() only rejects on a network error: a 404 resolves normally and then
  // fails later inside .json(), with a parse error that says nothing about the
  // URL. So every load checks res.ok itself and records what actually went
  // wrong - otherwise a missing folder looks exactly like a simulation that
  // produced no output.

  var loadFailures = [];

  function recordFailure(url, detail) {
    loadFailures.push({ url: url, detail: detail });
  }

  function fetchJson(url) {
    return window.fetch(url).then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status + " " + response.statusText);
      }
      return response.json();
    });
  }

  function reportFailures() {
    if (!loadFailures.length) {
      return null;
    }
    var first = loadFailures[0];
    var summary =
      loadFailures.length + " file(s) failed to load - first: " + first.url +
      " (" + first.detail + ")";
    console.error(summary);
    console.table(loadFailures.slice(0, 20));
    return summary;
  }

  function loadGeoJson(url, layer) {
    return fetchJson(url)
      .then(function (geojson) {
        var feats = new ol.format.GeoJSON().readFeatures(geojson, {
          featureProjection: "EPSG:3857"
        });
        layer.getSource().addFeatures(feats);
        return feats;
      })
      .catch(function (error) {
        recordFailure(url, error.message);
        console.warn("Could not load " + url, error);
        return null;
      });
  }

  // --- Timeline and rendering ----------------------------------------------

  function initializeTimeline(failureSummary) {
    if (globalStart === Infinity) {
      // Say which it was: nothing could be fetched, or it fetched fine and was
      // empty. Those need completely different fixes.
      timeLabel.textContent = failureSummary
        ? "No agent data loaded - " + failureSummary + ". See the console."
        : "No agent data found.";
      return;
    }

    currentTime = globalStart;
    timeSlider.min = globalStart;
    timeSlider.max = globalEnd;
    timeSlider.value = currentTime;
    timeSlider.disabled = false;

    playBtn.disabled = false;
    playBtn.textContent = "Play";
    resetBtn.disabled = false;
    updateTimeLabel();
  }

  function updateTimeLabel() {
    timeLabel.textContent = new Date(currentTime).toLocaleString();
  }

  function renderFrame() {
    var source = animationLayer.getSource();
    source.clear();

    var activeAgents = new Set();

    features.forEach(function (f) {
      var start = f.get("start");
      var end = f.get("end");
      if (currentTime < start || currentTime > end) {
        return;
      }

      activeAgents.add(f.get("agent"));

      var geom = f.getGeometry();
      var tripType = f.get("type");
      var color = getColor(tripType);

      if (geom.getType() === "LineString") {
        var coords = geom.getCoordinates();
        var segments = f.get("segments");
        if (!segments || segments.length === 0) {
          return;
        }

        var elapsed = (currentTime - start) / 1000; // seconds

        var cumulative = 0;
        var segmentIndex = 0;
        for (var i = 0; i < segments.length; i++) {
          var segTime = segments[i].travel_time_s;
          if (elapsed <= cumulative + segTime) {
            segmentIndex = i;
            break;
          }
          cumulative += segTime;
        }

        if (segmentIndex >= coords.length - 1) {
          segmentIndex = coords.length - 2;
        }

        var seg = segments.find(function (s) {
          return elapsed >= s.cumStart && elapsed <= s.cumEnd;
        });
        if (!seg) {
          return;
        }

        var segFraction = (elapsed - seg.cumStart) / (seg.cumEnd - seg.cumStart);
        var startCoord = coords[segmentIndex];
        var endCoord = coords[segmentIndex + 1];

        var moving = new ol.Feature(
          new ol.geom.Point([
            startCoord[0] + (endCoord[0] - startCoord[0]) * segFraction,
            startCoord[1] + (endCoord[1] - startCoord[1]) * segFraction
          ])
        );
        moving.setStyle(
          new ol.style.Style({
            image: new ol.style.Circle({
              radius: 6,
              fill: new ol.style.Fill({ color: color }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
            })
          })
        );
        source.addFeature(moving);
      } else if (geom.getType() === "Point") {
        // Idle is the filler between trips, so it is both the commonest marker
        // and the least interesting one. Drawn at the same size as a swap or a
        // pickup it crowds them out, so it gets a smaller dot and thinner ring.
        var isIdle = tripType === "idle";
        var stationary = new ol.Feature(new ol.geom.Point(geom.getCoordinates()));
        stationary.setStyle(
          new ol.style.Style({
            image: new ol.style.Circle({
              radius: isIdle ? IDLE_RADIUS : STOP_RADIUS,
              fill: new ol.style.Fill({ color: color }),
              stroke: new ol.style.Stroke({ color: "#000", width: isIdle ? 1 : 2 })
            })
          })
        );
        source.addFeature(stationary);
      }
    });

    document.getElementById("activeCounter").textContent = activeAgents.size;
  }

  function animate() {
    if (!playing) {
      return;
    }
    var speedMultiplier = parseInt(speedSlider.value, 10);
    currentTime += (speedMultiplier * 1000) / 60;
    if (currentTime > globalEnd) {
      currentTime = globalStart;
    }
    timeSlider.value = currentTime;
    updateTimeLabel();
    renderFrame();
    animationId = window.requestAnimationFrame(animate);
  }

  // --- Controls -------------------------------------------------------------

  playBtn.addEventListener("click", function () {
    playing = !playing;
    playBtn.textContent = playing ? "Stop" : "Play";
    playBtn.classList.toggle("btn-primary");
    playBtn.classList.toggle("btn-danger");
    if (playing) {
      animate();
    } else {
      window.cancelAnimationFrame(animationId);
    }
  });

  resetBtn.addEventListener("click", function () {
    currentTime = globalStart;
    timeSlider.value = currentTime;
    updateTimeLabel();
    renderFrame();
  });

  speedSlider.addEventListener("input", function () {
    document.getElementById("speedLabel").textContent = this.value + "x";
  });

  timeSlider.addEventListener("input", function () {
    currentTime = parseInt(this.value, 10);
    updateTimeLabel();
    renderFrame();
  });

  // --- Legend ---------------------------------------------------------------

  function hide(id) {
    var element = document.getElementById(id);
    if (element) {
      element.remove();
    }
  }

  /* Only hail_rank places pickups at taxi ranks; the other modes put them
     anywhere, so they share the pickup legend and have no rank layer. A
     scenario with no swap stations loses that legend too. */
  function trimLegend(isHailRank, hasSwapStations) {
    if (isHailRank) {
      hide("pickupLegend");
    } else {
      ["taxiRankLegend", "hailLegend", "rankLayerLegend"].forEach(hide);
    }
    if (!hasSwapStations) {
      hide("swapLayerLegend");
      hide("swapLegend");
    }
  }

  // --- Agent trips ----------------------------------------------------------

  function readAgentFile(geojson) {
    var read = new ol.format.GeoJSON().readFeatures(geojson, {
      featureProjection: "EPSG:3857"
    });

    read.forEach(function (f) {
      var props = f.getProperties();
      var start = new Date(props.start_time).getTime();
      var end = new Date(props.end_time).getTime();
      f.set("start", start);
      f.set("end", end);

      // segment_times is one travel time per hop; older outputs carry a full
      // edge record per hop, of which only travel_time_s was ever used.
      var times =
        props.segment_times ||
        (props.segments || []).map(function (s) {
          return s.travel_time_s;
        });

      var cum = 0;
      f.set(
        "segments",
        times.map(function (t) {
          var seg = { travel_time_s: t, cumStart: cum };
          cum += t;
          seg.cumEnd = cum;
          return seg;
        })
      );

      if (!isNaN(start)) {
        globalStart = Math.min(globalStart, start);
      }
      if (!isNaN(end)) {
        globalEnd = Math.max(globalEnd, end);
      }
    });

    features = features.concat(read);
  }

  /* A hundred trip files at once is enough to make a modest static host start
     refusing connections, and the browser would queue most of them anyway. A
     handful in flight keeps it moving without the stampede. */
  var MAX_IN_FLIGHT = 6;

  function loadAgents(basePath, count) {
    var next = 0;
    var done = 0;

    function note() {
      loadNote.textContent = "Loading agent trips… " + done + " of " + count + ".";
    }
    note();

    function pump() {
      if (next >= count) {
        return Promise.resolve();
      }
      var index = next++;
      var url = basePath + FILE_PREFIX + String(index).padStart(4, "0") + FILE_SUFFIX;

      return fetchJson(url)
        .then(readAgentFile)
        .catch(function (error) {
          recordFailure(url, error.message);
        })
        .then(function () {
          done += 1;
          note();
          return pump();
        });
    }

    var workers = [];
    for (var i = 0; i < Math.min(MAX_IN_FLIGHT, count); i++) {
      workers.push(pump());
    }
    return Promise.all(workers);
  }

  // --- Page -----------------------------------------------------------------

  E.boot("animation.html", function (scenario) {
    var animation = scenario.animation;
    document.getElementById("scenarioName").textContent = scenario.name;

    if (!animation || !animation.agent_count) {
      loadNote.textContent = "";
      timeLabel.textContent = "No animation is published for this scenario.";
      trimLegend(false, false);
      return;
    }

    var isHailRank = animation.mode === "hail_rank";
    trimLegend(isHailRank, Boolean(scenario.swap_stations));

    var geography = [];
    if (scenario.area) {
      geography.push(
        loadGeoJson(scenario.area, areaLayer).then(function (feats) {
          if (feats && feats.length) {
            map.getView().fit(areaLayer.getSource().getExtent(), {
              padding: [50, 50, 50, 50]
            });
          }
        })
      );
    }
    if (scenario.swap_stations) {
      geography.push(loadGeoJson(scenario.swap_stations, swapLayer));
    }
    if (isHailRank && scenario.taxi_ranks) {
      geography.push(loadGeoJson(scenario.taxi_ranks, rankLayer));
    }

    return Promise.all(geography)
      .then(function () {
        return loadAgents(animation.agent_path, animation.agent_count);
      })
      .then(function () {
        var summary = reportFailures();
        initializeTimeline(summary);
        renderFrame();
        loadNote.textContent = summary
          ? summary + " See the console for the full list."
          : features.length + " trips across " + animation.agent_count + " agents.";
      });
  });
})();
