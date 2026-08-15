"""GeoJSON handling for scenario areas.

Areas arrive from three places - drawn on the map, read from a user's file, or
fetched from OpenStreetMap - and all three are client-side, so none of them can
be trusted. Everything funnels through `normalise_area` before it is stored.
"""

from django.core.exceptions import ValidationError

# An administrative boundary can legitimately be very detailed, but it should
# not be unbounded: these caps keep one scenario from filling the database or
# stalling a request.
MAX_VERTICES = 100_000
MAX_RINGS = 5_000

POLYGON_TYPES = {"Polygon", "MultiPolygon"}


def _check_position(position, where):
    """A GeoJSON position is [lon, lat] with an optional altitude."""
    if not isinstance(position, (list, tuple)) or len(position) < 2:
        raise ValidationError(f"{where}: each position needs a longitude and latitude.")

    lon, lat = position[0], position[1]
    for value, label in ((lon, "Longitude"), (lat, "Latitude")):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValidationError(f"{where}: {label.lower()} must be a number.")

    if not -180 <= lon <= 180:
        raise ValidationError(f"{where}: longitude {lon} is outside -180 to 180.")
    if not -90 <= lat <= 90:
        raise ValidationError(f"{where}: latitude {lat} is outside -90 to 90.")

    # Drop any altitude - it means nothing for a 2D area and only bloats storage.
    return [float(lon), float(lat)]


def _clean_ring(ring, where):
    if not isinstance(ring, (list, tuple)):
        raise ValidationError(f"{where}: ring must be a list of positions.")

    positions = [_check_position(p, where) for p in ring]

    if len(positions) < 3:
        raise ValidationError(f"{where}: a ring needs at least three points.")

    # GeoJSON requires a closed ring; close it rather than rejecting the file.
    if positions[0] != positions[-1]:
        positions.append(list(positions[0]))

    if len(positions) < 4:
        raise ValidationError(f"{where}: a ring needs at least three distinct points.")

    return positions


def _clean_polygon(coordinates, where):
    if not isinstance(coordinates, (list, tuple)) or not coordinates:
        raise ValidationError(f"{where}: polygon must have at least an outer ring.")
    return [_clean_ring(ring, where) for ring in coordinates]


def _clean_geometry(geometry, where):
    """Return a cleaned Polygon/MultiPolygon geometry, or None if not polygonal."""
    if not isinstance(geometry, dict):
        raise ValidationError(f"{where}: geometry must be an object.")

    geometry_type = geometry.get("type")

    if geometry_type == "GeometryCollection":
        cleaned = []
        for index, member in enumerate(geometry.get("geometries") or []):
            member_clean = _clean_geometry(member, f"{where} geometry {index + 1}")
            if member_clean is not None:
                cleaned.append(member_clean)
        if not cleaned:
            return None
        # Flatten the collection into one MultiPolygon.
        parts = []
        for member in cleaned:
            if member["type"] == "Polygon":
                parts.append(member["coordinates"])
            else:
                parts.extend(member["coordinates"])
        return {"type": "MultiPolygon", "coordinates": parts}

    if geometry_type not in POLYGON_TYPES:
        # Lines and points are not areas; the caller decides whether that is fatal.
        return None

    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon":
        return {"type": "Polygon", "coordinates": _clean_polygon(coordinates, where)}

    if not isinstance(coordinates, (list, tuple)) or not coordinates:
        raise ValidationError(f"{where}: multipolygon must contain at least one polygon.")

    return {
        "type": "MultiPolygon",
        "coordinates": [
            _clean_polygon(polygon, f"{where} part {index + 1}")
            for index, polygon in enumerate(coordinates)
        ],
    }


def _iter_rings(geometry):
    if geometry["type"] == "Polygon":
        yield from geometry["coordinates"]
    else:
        for polygon in geometry["coordinates"]:
            yield from polygon


def bounds_of(feature_collection):
    """Return [min_lon, min_lat, max_lon, max_lat] for a cleaned collection."""
    min_lon = min_lat = float("inf")
    max_lon = max_lat = float("-inf")

    for feature in feature_collection["features"]:
        for ring in _iter_rings(feature["geometry"]):
            for lon, lat in ring:
                min_lon = min(min_lon, lon)
                min_lat = min(min_lat, lat)
                max_lon = max(max_lon, lon)
                max_lat = max(max_lat, lat)

    if min_lon == float("inf"):
        raise ValidationError("The area has no coordinates.")

    return [min_lon, min_lat, max_lon, max_lat]


def normalise_area(raw):
    """Validate arbitrary GeoJSON and reduce it to a polygonal FeatureCollection.

    Accepts a FeatureCollection, a single Feature, or a bare geometry - the three
    shapes the drawing, file-import and Overpass paths can produce. Non-polygonal
    geometries are dropped; if nothing polygonal is left, that is an error, since
    an area made only of lines or points is meaningless.
    """
    if not isinstance(raw, dict):
        raise ValidationError("The area must be a GeoJSON object.")

    raw_type = raw.get("type")

    if raw_type == "FeatureCollection":
        candidates = raw.get("features")
        if not isinstance(candidates, list) or not candidates:
            raise ValidationError("The file contains no features.")
    elif raw_type == "Feature":
        candidates = [raw]
    elif raw_type in POLYGON_TYPES or raw_type == "GeometryCollection":
        candidates = [{"type": "Feature", "properties": {}, "geometry": raw}]
    else:
        raise ValidationError(
            "Unsupported GeoJSON. Expected a FeatureCollection, Feature, Polygon "
            "or MultiPolygon."
        )

    features = []
    for index, candidate in enumerate(candidates):
        where = f"Feature {index + 1}"

        if not isinstance(candidate, dict):
            raise ValidationError(f"{where}: must be an object.")

        geometry = candidate.get("geometry") if candidate.get("type") == "Feature" else candidate
        if geometry is None:
            continue

        cleaned = _clean_geometry(geometry, where)
        if cleaned is None:
            continue

        features.append({"type": "Feature", "properties": {}, "geometry": cleaned})

    if not features:
        raise ValidationError(
            "No area found. The area must contain at least one polygon."
        )

    collection = {"type": "FeatureCollection", "features": features}

    rings = vertices = 0
    for feature in features:
        for ring in _iter_rings(feature["geometry"]):
            rings += 1
            vertices += len(ring)

    if rings > MAX_RINGS:
        raise ValidationError(
            f"That area is too complex ({rings:,} rings, limit {MAX_RINGS:,}). "
            "Try a smaller region or a simplified file."
        )
    if vertices > MAX_VERTICES:
        raise ValidationError(
            f"That area is too detailed ({vertices:,} points, limit {MAX_VERTICES:,}). "
            "Try a smaller region or a simplified file."
        )

    return collection, bounds_of(collection), vertices
