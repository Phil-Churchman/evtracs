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
| `data/`                  | Everything the site displays                         |
| `static/`                | CSS, icons, images and the page scripts              |

Each page takes an optional `?scenario=<id>` parameter. Without one it uses the
scenario this browser last selected, falling back to the first in the index.
The selection lives in `localStorage` and is per-browser — it is a view
preference, not stored data.

## The data files

`data/scenarios.json` is the index. Everything else hangs off it:

```json
{
  "scenarios": [
    {
      "id": "nairobi",
      "name": "Nairobi",
      "parameters": "data/nairobi/parameters.json",
      "area": "data/nairobi/area.geojson",
      "area_source": "Imported from file",
      "area_source_label": "area.geojson"
    }
  ]
}
```

- `id` — used in URLs, so keep it short and URL-safe.
- `parameters` — path to that scenario's parameters (required).
- `area` — path to its area, or `null` if it has none.
- `area_source` / `area_source_label` — where the area came from, shown as a
  label on the map page. Both are optional.

### `parameters.json`

The same shape the simulation model reads (`Model/scenario.json`), so a file can
be moved between the two unchanged. Times are
`[year, month, day, hour, minute, second]`, and road speeds live under the
hyphenated `road_speed_km-h` key:

```json
{
  "demand_model": false,
  "speed_based_routing": true,
  "agents": [0, 0, 0, "…24 values, midnight first"],
  "animation_agents": 20,
  "probability_hail": 0.75,
  "start_time": [2025, 1, 1, 0, 0, 0],
  "end_time": [2025, 1, 2, 0, 0, 0],
  "road_speed_km-h": { "trunk": 40, "…": 0 },
  "swap_wait_sec": 300,
  "max_total_distance_m": 70000,
  "buffer_distance": 15000,
  "passenger_max_dist": 4000,
  "simulation_step_sec": 10,
  "deviation_factor": 1.4
}
```

The parameters page shows the known road types first, in the model's order, then
any extra ones the file defines.

### `area.geojson`

A plain GeoJSON `FeatureCollection` of polygons in EPSG:4326, the projection
GeoJSON requires and what OpenStreetMap exports use.

## Adding or changing a scenario

Edit the files by hand: add a folder under `data/`, drop in a `parameters.json`
and an `area.geojson`, and add an entry to `data/scenarios.json`. Nothing else
needs to change.

## The map page

`area.html` draws the published area and is also a scratchpad: an area can be
drawn, loaded from a file, or pulled from OpenStreetMap so it can be compared
against the published one. None of that is saved anywhere — **Export GeoJSON**
is the only way to keep it, and **Back to published area** always restores the
file's geometry.
