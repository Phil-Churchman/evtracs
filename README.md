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
| `index.html`             | Home: the active scenario at a glance                |
| `scenarios.html`         | The published scenarios; pick which one is active    |
| `parameters.html`        | Read-only view of one scenario's parameters          |
| `area.html`              | Map view of one scenario's area                      |
| `global.html`            | Parameters shared by every scenario                  |
| `animation.html`         | Agent trips played back over the area                |
| `stations.html`          | Swap stations, and each one's queue through the day  |
| `outputs.html`           | The charts a scenario's run produced                 |
| `data/`                  | Everything the site displays                         |
| `static/`                | CSS, icons, images and the page scripts              |

Each page takes an optional `?scenario=<id>` parameter. Without one it uses the
scenario this browser last selected, falling back to the first in the index.
The selection lives in `localStorage` and is per-browser — it is a view
preference, not stored data.

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
  "parameters": "data/nairobi/parameters.json",
  "area": "data/nairobi/area.geojson",
  "area_source": "Imported from file",
  "area_source_label": "Model_data/nairobi/geojson_files/area.geojson",
  "swap_stations": null,
  "taxi_ranks": null,
  "animation": {
    "mode": "demand_model",
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
- `parameters` — path to that scenario's parameters (required).
- `area` — path to its area, or `null` if it has none.
- `area_source` / `area_source_label` — where the area came from, shown as a
  label on the map page. Both are optional.
- `swap_stations` / `taxi_ranks` — point geometry drawn on the animation and
  station pages, or `null`.
- `animation` — the published animation run, or `null`. See below.
- `outputs` — the run's charts, or `[]`. `title` is derived from the filename
  and `bytes` is shown beside it in the picker.

Anything set to `null` disables the page that needs it: the link stays visible
but disabled, so every scenario's row reads the same.

### `animation`

```json
{
  "mode": "distribution",
  "agent_count": 100,
  "agent_path": "data/accra-okada/animation/agents/",
  "station_log": "data/accra-okada/animation/swap_station_timesteps.xlsx"
}
```

- `mode` — one of `hail_rank`, `demand_model`, `distribution`. Only `hail_rank`
  puts pickups at taxi ranks, so only that mode draws the rank layer and its
  legend entries.
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
the keys that steer the model rather than describe the run — `folder_name`,
`sync_evtracs`, `evtracs_name`. Times are
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

Road speeds are **not** here. They are calibrated once and applied to every
run, so they live in `data/road_speeds.json` and are shown on `global.html`.
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
any extra ones the file defines.

### `area.geojson`

A plain GeoJSON `FeatureCollection` of polygons in EPSG:4326, the projection
GeoJSON requires and what OpenStreetMap exports use.

### `simulation_mode`

The mode used to be a `demand_model` boolean. Files written before that change
are still read the old way, so both spellings work.

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
