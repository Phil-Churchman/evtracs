# EV-TRACS (static)

A static, read-only view of EV-TRACS scenarios. There is no server and no
database: every page is plain HTML that reads its content from the files under
`data/`.

## Running it

The pages fetch their data with `fetch()`, which browsers refuse to do over
`file://`. Serve the folder over HTTP instead:

```bash
python -m http.server 8000
```

Then open <http://127.0.0.1:8000/>.

## Layout

| Path                     | What it is                                          |
| ------------------------ | --------------------------------------------------- |
| `index.html`             | Home: the project, and the way in to the site        |
| `selection.html`         | Scenario selection: the published scenarios          |
| `scenario.html`          | One scenario at a glance, and the way in to it       |
| `parameters.html`        | Read-only view of one scenario's parameters          |
| `area.html`              | Map view of one scenario's area                      |
| `demand.html`            | One scenario's demand points                         |
| `frequencies.html`       | One scenario's demand frequencies                    |
| `facilities.html`        | One scenario's swap stations and taxi ranks          |
| `overview.html`          | How the model works, per model type                  |
| `tracking.html`          | How captured GPS journeys are cleaned and matched    |
| `global.html`            | Setup and parameters shared by every scenario        |
| `animation.html`         | Agent trips played back over the area                |
| `stations.html`          | Swap stations, and each one's queue through the day  |
| `outputs.html`           | The charts a scenario's run produced                 |
| `tools.html`             | Other tools: the standalone ones, and the pipeline   |
| `tools/`                 | Those tools, copied from `Model/utilities`            |
| `data/`                  | Everything the site displays                         |
| `static/`                | CSS, icons, images and the page scripts              |

Home describes the project and points at the two ways in: **Scenario
selection**, which lists the published scenarios with the model type each one
is, and the **Model overview**. Selecting a scenario opens `scenario.html`,
the hub for its parameters, area, animations and outputs.

Each page takes an optional `?scenario=<id>` parameter. Without one it uses the
scenario this browser last selected, falling back to the first in the index.
The selection lives in `localStorage` and is per-browser — it is a view
preference, not stored data. Because selecting is just a link, the detail pages
can point plainly at `scenario.html` and land back on the right one.

## The data files

`data/scenarios.json` is the index. Everything else hangs off it — the
scenarios, and the `global` block holding what is not a scenario's to vary:

```json
{
  "global": {
    "road_speeds": "data/road_speeds.json",
    "road_speeds_source": "Model/Simulation/road_speeds.json"
  },
  "scenarios": [ ... ]
}
```

`road_speeds_source` is shown on the global page so it is clear which file in
the model the table was calibrated in. A missing or empty `global` block just
means the page says nothing has been published yet.

Each scenario entry looks like this:

```json
{
  "id": "nairobi",
  "name": "Nairobi",
  "mode": "calibration",
  "parameters": "data/nairobi/parameters.json",
  "area": "data/nairobi/area.geojson",
  "area_source": "Imported from file",
  "area_source_label": "Model_data/nairobi/geojson_files/area.geojson",
  "swap_stations": null,
  "taxi_ranks": null,
  "animation": {
    "agent_count": 10,
    "agent_path": "data/nairobi/animation/agents/",
    "station_log": null
  },
  "outputs": [
    {
      "file": "data/nairobi/outputs/trip_gap_correlation.png",
      "title": "Trip gap correlation",
      "bytes": 216840
    }
  ],
  "synced_from": "scenario_nairobi.json"
}
```

- `id` — used in URLs, so keep it short and URL-safe.
- `mode` — the **model type**, shown on the home and scenario pages and used
  by the animation to decide whether to draw taxi ranks. See below.
- `parameters` — path to that scenario's parameters (required).
- `area` — path to its area, or `null` if it has none.
- `area_source` / `area_source_label` — where the area came from, shown as a
  label on the map page. Both are optional.
- `swap_stations` / `taxi_ranks` — point geometry drawn on the animation,
  station and facilities pages, or `null`.
- `demand_points` / `demand_frequencies` — the demand model's inputs, or
  `null`. Only a demand model scenario has them.
- `animation` — the published animation run, or `null`. See below.
- `outputs` — the run's charts, or `[]`. `title` is derived from the filename
  and `bytes` is shown beside it in the picker.

Anything set to `null` disables the page that needs it: the link stays visible
but disabled, so every scenario's row reads the same.

### `animation`

```json
{
  "agent_count": 100,
  "agent_path": "data/accra-okada/animation/agents/",
  "station_log": "data/accra-okada/animation/swap_station_timesteps.xlsx"
}
```

- `agent_count` — how many `agent_NNNN_time.geojson` files were published. This
  is the run's `animation_agents`; the model writes one file per simulated
  agent, but the animation only ever reads this many, so only this many ship.
- `agent_path` — the folder holding them, trailing slash included.
- `station_log` — the swap station timestep log, read by `stations.html`.

This block describes the **run** whose output is published, which need not line
up with the scenario's `parameters.json`. Nairobi is the case in point: its
`demand_model` run replays captured GPS trips, so the animation's timeline
starts in November 2023 — when those trips were recorded — rather than at the
`start_time` of January 2025 that the parameters give.

### `parameters.json`

The same shape the simulation model reads (`Model/scenario_<name>.json`), minus
the keys that steer the model or this site rather than describe the run —
`folder_name`, `sync_evtracs`, `evtracs_name`, `evtracs_model_type`. Times are
`[year, month, day, hour, minute, second]`:

```json
{
  "simulation_mode": "distribution",
  "speed_based_routing": true,
  "agents": [0, 0, 0, "…one value per period"],
  "animation_agents": 100,
  "probability_hail": 0.75,
  "start_time": [2025, 1, 1, 0, 0, 0],
  "end_time": [2025, 1, 2, 0, 0, 0],
  "swap_wait_sec": 300,
  "max_total_distance_m": 70000,
  "buffer_distance": 15000,
  "passenger_max_dist": 4000,
  "simulation_step_sec": 10,
  "deviation_factor": 1.5
}
```

Everything else passes through untouched, so a new model parameter appears on
the site without the sync script needing to know about it.

`agents` splits the simulation window into that many **equal periods**, not
hours: 24 values over a day are hourly, 8 are three-hourly. The parameters page
works the labels out from the window rather than assuming.

The parameters page shows only what the scenario's model type actually reads.
That comes from `parameter_use` in `model_steps.json`, which records **only the
exceptions** — anything absent from it is read by every mode, which is most of
them:

| Parameter | Read by | Why |
| --------- | ------- | --- |
| `probability_hail` | `hail_rank` | Only that branch of `calculate_next_activity` chooses between hailing and a rank. |
| `passenger_max_dist` | all but `distribution` | Distribution mode returns from `get_target_node` before reaching it, drawing distances from the measured bands instead. |
| `pickup_wait_sec` | `distribution` | Only the distribution branch sets a pickup wait. |

Calibration is a demand-model run, so it reads what `demand_model` reads. If the
catalogue cannot be loaded the page shows everything rather than hiding
something that matters.

Road speeds are **not** here either. They are calibrated once and applied to
every run, so they live in `data/road_speeds.json` and are shown on
`global.html`.
A scenario file that still carries its own `road_speed_km-h` has it dropped on
export, and the parameters page says the table is being ignored — the model
ignores it too.

### `road_speeds.json`

A verbatim copy of the model's shared table, so the file is interchangeable
between the two:

```json
{ "road_speed_km-h": { "trunk": 49, "living_street": 12, "…": 0 } }
```

The global page shows the known highway types first, in the model's order, then
any extra ones the file defines. It also carries the `setup` steps from
`model_steps.json` — setting up the Python environment is the same job whichever
mode you are about to run, so it belongs there rather than repeated at the head
of all four flow charts.

Every type's Define stage now leads with the area and then the road network: the
roads are extracted *for* an area, so that is the order the work happens in.

### `area.geojson`

A plain GeoJSON `FeatureCollection` of polygons in EPSG:4326, the projection
GeoJSON requires and what OpenStreetMap exports use.

### Model types

The site knows four:

| Type | Meaning |
| ---- | ------- |
| `hail_rank` | Agents hail on the road or wait at a taxi rank. |
| `demand_model` | Trips are generated from demand points and frequencies. |
| `distribution` | Trip distances and fare waits are drawn from measured distributions. |
| `calibration` | A run reproduced against real tracked journeys, to tune road speeds and routing. |

The first three are the model's own `simulation_mode`. **`calibration` is the
site's own** — the model has only three modes and would refuse to start on a
fourth, so a scenario asks for it with a key the model ignores:

```json
{
  "sync_evtracs": true,
  "evtracs_model_type": "calibration",
  "simulation_mode": "demand_model"
}
```

Nairobi is the case in point: the model runs it in `demand_model` mode, but it
exists to be checked against tracked trips, so that is what the site calls it.
The Parameters page still reports the file's own `simulation_mode`, which is why
it says "Demand model" where the rest of the site says "Calibration".

`simulation_mode` itself used to be a `demand_model` boolean. Files written
before that change are still read the old way, so both spellings work.

### Where the data came from

`data/` is exported from the model, not authored here:

| In the site                              | Source                                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| `road_speeds.json`                        | `Model/road_speeds.json`, else `Model/Simulation/road_speeds.json` |
| `<id>/parameters.json`                    | `Model/scenario_<name>.json`                                  |
| `<id>/area.geojson`                       | `Model_data/<folder>/geojson_files/area.geojson`              |
| `<id>/swap_stations.geojson`              | `Model_data/<folder>/geojson_files/swap_stations.geojson`     |
| `<id>/taxi_ranks.geojson`                 | `Model_data/<folder>/geojson_files/taxi_ranks.geojson`        |
| `<id>/animation/agents/`                  | `Model_data/<folder>/output/output_trips_time_queued/`        |
| `<id>/animation/swap_station_timesteps.xlsx` | `Model_data/<folder>/output/`                              |
| `<id>/outputs/*.png`                      | `Model_data/<folder>/output/*.png`                            |

`data/model_steps.json` is the exception: it is written by hand, not synced. The
prune only removes directories, so it is safe there.

`sync_evtracs.py` does the copying — see below.

## Republishing from the model

`data/` is generated, not hand-maintained. `sync_evtracs.py` republishes it from
a `Model/` and `Model_data/` checkout sitting alongside this one:

```bash
python sync_evtracs.py              # sync, reporting what changed
python sync_evtracs.py --dry-run    # say what would happen, change nothing
python sync_evtracs.py --no-prune   # leave dropped scenarios' data in place
```

The script is deliberately **not** in the repository — `.gitignore` keeps it
out. It only works next to the model, so it belongs to whoever regenerates the
data rather than to the published site. The data it writes *is* committed.

### Choosing what gets published

A scenario is published when its file in `Model/` says so:

```json
{
  "folder_name": "../Model_data/nairobi",
  "sync_evtracs": true,
  ...
}
```

The id and display name come from the `folder_name` basename — `accra - okada`
becomes id `accra-okada`, name `Accra - Okada` — unless the scenario file sets
`"evtracs_name"`, which overrides both.

Only the first `animation_agents` trip files are copied. The model writes one
per simulated agent and a run can hold well over a thousand, but the animation
never asks for more, so shipping the rest would add hundreds of megabytes nobody
downloads. If a trip file is missing the script stops at the gap and publishes
only the contiguous run, so the animation never requests a file that is not
there.

Charts are mirrored exactly, not accumulated: a re-run that renames or retires
a `.png` has the old one deleted from `data/<id>/outputs/` too, so the site never
shows a chart the current run did not produce.

Road speeds are published once, not per scenario: the script copies the model's
shared table to `data/road_speeds.json` and points the `global` block at it. A
`road_speeds.json` sitting in a scenario folder is reported and ignored, matching
the model.

### The model is the authority

`data/` mirrors the flagged scenarios and holds nothing else. Every run rewrites
`data/scenarios.json` from what it published, and **deletes any scenario folder
it did not publish** — one whose flag was removed, one that was renamed, or one
that was only ever added by hand. So `data/` cannot drift from the model, and
there is no way to keep a scenario in the site that the model does not describe.
Entries carry `synced_from` as a record of which model file each came from.

Two things are deliberately spared:

- **A scenario that is still flagged but could not be read** keeps its folder
  and its index entry. A missing folder usually means a checkout that has not
  finished syncing, which says nothing about whether the data is still wanted.
  Any failure suppresses pruning for the whole run.
- **A run that publishes nothing at all** leaves `data/` untouched and exits
  non-zero, so pointing the script at a bad `Model/` cannot empty the site.

`--no-prune` skips deletion entirely if you need it.

Copies are skipped when the file is already there at the same size and time, so
a re-run after one scenario changes does not rewrite tens of megabytes.

## The tracking data page

`tracking.html` describes what `Model/tracker_data_processing/clean_data.py` does to recorded
GPS journeys — the nine cleaning and map-matching stages, the thresholds each
one uses, and the two files it writes — and what the tracked route animation
then shows. It is static prose: the only thing wired up is the walkthrough link,
which reads the vehicle tracking video out of `model_steps.json` so that url
lives in one place.

It is reached from the Other tools page and from the calibration steps in the
overview. It is the input side of a calibration scenario, which is why it links
on to the global road speed table and the calibration workflow.

## The tools

`tools/` holds the model's standalone HTML utilities — the area setter, the
demand point and frequency editors, the facilities editor, the GeoJSON editor,
the tracked-route animation, the GPS track viewer and the business case
dashboard. `tools.html` indexes them, grouped by the same Define / View /
Analyse stages the overview uses.

Tools are collected from `Model/utilities` and
`Model/tracker_data_processing` — `TOOL_SOURCE_SUBDIRS` in the sync script lists
them, so a further reshuffle is a one-line change. A tool appearing in both is
reported rather than silently published twice.

Four of the model's utilities are **not** published: the area, demand point,
demand frequency and facilities editors, each superseded by a scenario-aware
page in the site. Publishing both would leave two versions of the same editor
differing in what they can do, so `SUPERSEDED_TOOLS` in the sync script skips
them and the overview points at the site's version instead. Their full
create-and-save counterparts remain in `Model/utilities`.

`sync_evtracs.py` refreshes the rest alongside the scenario data, so they cannot
drift from the model. They are copied from `Model/utilities` **unchanged** apart
from two edits, both applied by the script:

- `../web/css/apple.css` becomes `../static/css/apple.css`, the only local asset
  any of them referenced;
- a copy of the theme script, so a viewer who picked dark on the site gets dark
  tools.

Nothing else was touched, and nothing needed to be: each tool already works
entirely in the browser, taking a file you open from your own machine and
exporting what it produces. None of them talks to a model server — the only
network call in the set is `set_area.html` querying Overpass, which the site's
own area page does too. They read only CSS custom properties from `apple.css`,
no component classes, so the site's styling changes cannot break them.

`tools/` mirrors `Model/utilities/*.html` the same way `data/` mirrors the
flagged scenarios: a tool the model no longer has is deleted, unless you pass
`--no-prune`. A filename with a space in it is published with underscores, since
a space would need escaping in every URL. If a tool ever stops referencing
`apple.css`, or still points into the model's own `web/` folder after the
rewrite, the run says so rather than quietly publishing something that will
404.

## The scenario data pages

`area.html`, `demand.html`, `frequencies.html` and `facilities.html` all work
the same way, and `static/js/file-panel.js` is the wiring they share: the
scenario's published file is what you arrive at, you can open a different one
from your own machine to compare, and you can export whatever is on screen.
Nothing is written back, so **Back to published** always returns to the file the
model produced. A page whose scenario published nothing says so and still lets
you open a file.

Each page supplies four things to the panel — how to parse a file, how to draw
it, how to summarise it, and how to serialise it for export — and the panel
handles the rest.

### Which pages a scenario shows

From its model type's `pages` list in `model_steps.json`. A hail-and-rank run
has no demand points, so it is not shown a tile for them at all — not even a
muted one. Within that list, a tile is a link when the data exists and reads
"Not published" when it does not.

| Model type | Pages |
| ---------- | ----- |
| Hail and taxi rank | parameters, area, facilities, animation, stations, outputs |
| Demand model | + demand, frequencies |
| Trip distribution | parameters, area, facilities, animation, stations, outputs |
| Calibration | parameters, area, animation, outputs |

The scenario page offers one tool alongside these: the JSON/GeoJSON editor,
which is useful against any of the model's files and belongs to none of them in
particular. `tools.html` lists the tools that have no page of their own —
the JSON/GeoJSON editor, the tracked route animation, the GPS track viewer and
the business case dashboard.

## Theme

The stylesheet reads light by default, dark under `prefers-color-scheme`, and
either one under `data-bs-theme` on `<html>`, which wins. So no stored choice
means "follow the system", and the toggle in the navbar pins whichever theme the
viewer is not currently looking at. The choice lives in `localStorage` under
`evtracs.theme`.

Each page carries a small inline script in its `<head>` that applies the stored
choice before first paint. It has to be inline and early: waiting for `app.js`
would render every page in one theme and repaint it in the other.

## Branding

The navbar brand is two links, not one — the Moving IMPACT mark goes to the
project site, the EV-TRACS wordmark goes home. Merging them would cost one or
the other. The project URL lives once in `app.js` as `MOVING_IMPACT_URL` and is
reused by the About page, so the logo and the button cannot drift apart.

## The overview page

`overview.html` explains the modelling workflow rather than any one scenario.
Pick a model type and it draws the steps as a flow chart, in the same four
stages the scenario page uses — Define, Run, View, Analyse. Choosing a step
opens its description and a link to the walkthrough video.

It opens on the active scenario's own model type, so arriving from a scenario
shows the workflow that produced it; `?type=<id>` overrides that and is what the
picker writes back, so a particular workflow is linkable.

### `model_steps.json`

```json
{
  "videos": {
    "trip-animation": {
      "name": "Simulation output animation",
      "youtube": "https://www.youtube.com/embed/zBcY4n8fekA"
    }
  },
  "stages": [{ "id": "define", "label": "Define" }],
  "shared": {
    "roads": {
      "title": "Extract the road network",
      "description": "…",
      "video": "osm-road-extractor"
    }
  },
  "types": {
    "calibration": {
      "summary": "…",
      "steps": { "define": ["roads", { "title": "…", "video": "…" }] }
    }
  }
}
```

- `setup` — steps every model type depends on and none of them owns. They are
  shown on the global page, not in any type's flow chart.
- `parameters` — the scenario parameters, each with a label and a line on what
  it controls. The "Set scenario parameters" step shows the ones its model type
  reads, filtered by `parameter_use`.
- `parameter_use` — the parameters only some model types read. See below.
- `tools` — the standalone tools, keyed by id, each with the file it lives in
  and an icon.
- `videos` — the walkthroughs, keyed by id. The urls are copied from
  `instructions/video_catalogue/data.json` and kept in its `/embed/` form; the
  page rewrites them to `/watch?v=` for the link, so the button opens the real
  YouTube page rather than a bare player.
- `shared` — steps common to several model types, referenced by name.
- `types` — each type's `summary` and its steps per stage. A step is either the
  name of a shared step or an object spelling one out, which is how a type says
  what it does differently.

A step may also carry `"tools": ["set-area"]`, naming ids from the `tools`
table. Those become buttons in the step's modal, and they are what the scenario
page shows under each stage — so which tools a scenario offers follows from its
model type, and the flow chart and the scenario page cannot disagree about which
ones matter. Nairobi gets the GPS track viewer and no facilities editor;
Bechem gets the demand point and frequency editors instead.

A step with no `video` still opens; the modal says there is no walkthrough yet
rather than offering a dead button.

## The outputs page

`outputs.html` lists the run's charts down one side and shows the selected one
beside them. The selection goes in the URL as `?output=<filename>`, so a
particular chart is linkable and survives a reload; an unrecognised name falls
back to the first chart rather than showing nothing. Charts render on a white
plate in both themes, because matplotlib draws them on white.

## The animation pages

`animation.html` replays every published agent's day: trips in progress are
interpolated along their route segment by segment, and stops are drawn as dots.
Trip files are fetched a few at a time rather than all at once, so a hundred of
them do not arrive as a hundred simultaneous requests.

`stations.html` draws the swap stations and, on clicking one, plays that
station's queue back from the timestep log. A vehicle keeps the post it started
swapping at, so the bays stay still while the queue moves. The log is an `.xlsx`
parsed in the browser with SheetJS.

Both pages fall back gracefully: a scenario with no swap stations loses that
layer and its legend entry, and one with no animation says so rather than
sitting empty.

## The map page

`area.html` draws the published area and is also a scratchpad: an area can be
drawn, loaded from a file, or pulled from OpenStreetMap so it can be compared
against the published one. None of that is saved anywhere — **Export GeoJSON**
is the only way to keep it, and **Back to published area** always restores the
file's geometry.
