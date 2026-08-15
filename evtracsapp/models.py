from datetime import datetime, timezone as dt_timezone

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

# Longest name we allow. Copy suffixes are trimmed to fit inside this.
SCENARIO_NAME_MAX_LENGTH = 100

# --- Parameter vocabulary ----------------------------------------------------
#
# Mirrors Model/scenario.json. "folder_name" is deliberately not represented:
# a scenario is identified by its own name and owner, not by a folder on disk.

HOURS_PER_DAY = 24

# OSM highway types, in the order they appear in scenario.json.
ROAD_TYPES = [
    "trunk",
    "trunk_link",
    "motorway",
    "motorway_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "residential",
    "unclassified",
    "service",
    "footway",
    "pedestrian",
    "track",
    "cycleway",
    "path",
    "steps",
    "services",
    "rest_area",
    "corridor",
    "raceway",
]

# The JSON key carries a hyphen, which is not a legal Python identifier, so the
# model field is called `road_speeds` and the original key is restored on export.
ROAD_SPEED_JSON_KEY = "road_speed_km-h"

DEFAULT_ROAD_SPEEDS = {
    "trunk": 40,
    "trunk_link": 30,
    "motorway": 40,
    "motorway_link": 30,
    "primary": 30,
    "primary_link": 30,
    "secondary": 30,
    "secondary_link": 20,
    "tertiary": 20,
    "tertiary_link": 10,
    "residential": 20,
    "unclassified": 10,
    "service": 10,
    "footway": 0,
    "pedestrian": 0,
    "track": 10,
    "cycleway": 5,
    "path": 0,
    "steps": 0,
    "services": 0,
    "rest_area": 0,
    "corridor": 0,
    "raceway": 0,
}

# Hourly agent counts, midnight-first.
DEFAULT_AGENT_PROFILE = [
    0, 0, 0, 0, 0, 200, 400, 800, 1000, 1000, 800, 600,
    600, 600, 600, 600, 800, 1000, 1000, 800, 800, 600, 600, 400,
]


def default_agent_profile():
    return list(DEFAULT_AGENT_PROFILE)


def default_road_speeds():
    return dict(DEFAULT_ROAD_SPEEDS)


def default_start_time():
    return datetime(2025, 1, 1, 0, 0, 0, tzinfo=dt_timezone.utc)


def default_end_time():
    return datetime(2025, 1, 2, 0, 0, 0, tzinfo=dt_timezone.utc)


def validate_agent_profile(value):
    """Exactly one non-negative whole number per hour of the day."""
    if not isinstance(value, list):
        raise ValidationError("Agent profile must be a list.")
    if len(value) != HOURS_PER_DAY:
        raise ValidationError(
            f"Agent profile must have exactly {HOURS_PER_DAY} values, got {len(value)}."
        )
    for hour, count in enumerate(value):
        # bool is a subclass of int, so reject it explicitly.
        if isinstance(count, bool) or not isinstance(count, int):
            raise ValidationError(f"Agent count for hour {hour} must be a whole number.")
        if count < 0:
            raise ValidationError(f"Agent count for hour {hour} cannot be negative.")


def validate_road_speeds(value):
    """A non-negative speed for every known road type, and no unknown ones."""
    if not isinstance(value, dict):
        raise ValidationError("Road speeds must be an object.")

    expected = set(ROAD_TYPES)
    actual = set(value)

    missing = sorted(expected - actual)
    if missing:
        raise ValidationError(f"Missing road types: {', '.join(missing)}.")

    unknown = sorted(actual - expected)
    if unknown:
        raise ValidationError(f"Unknown road types: {', '.join(unknown)}.")

    for road_type, speed in value.items():
        if isinstance(speed, bool) or not isinstance(speed, int):
            raise ValidationError(f"Speed for {road_type} must be a whole number.")
        if speed < 0:
            raise ValidationError(f"Speed for {road_type} cannot be negative.")


class ScenarioQuerySet(models.QuerySet):
    def for_user(self, user):
        """Scenarios belong to exactly one user and are never shared."""
        return self.filter(user=user)

    def active(self):
        return self.filter(is_active=True)


class Scenario(models.Model):
    """A user's working context.

    Deliberately empty of content for now - a scenario is just an identity that
    belongs to someone. The fields that make up a scenario come later; when they
    do, they hang off this model (or point at it) and `duplicate()` grows to copy
    them too.
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="scenarios"
    )
    name = models.CharField(max_length=SCENARIO_NAME_MAX_LENGTH)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ScenarioQuerySet.as_manager()

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="uniq_scenario_name_per_user",
            ),
            # Enforced by the database rather than by application code, so no
            # combination of concurrent requests can leave a user with two
            # active scenarios.
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(is_active=True),
                name="uniq_active_scenario_per_user",
            ),
        ]

    def __str__(self):
        return self.name

    @transaction.atomic
    def activate(self):
        """Make this the user's active scenario, deactivating any other.

        The other rows are cleared first: doing it the other way round would
        briefly leave two active scenarios and trip the unique constraint.
        """
        Scenario.objects.for_user(self.user).active().exclude(pk=self.pk).update(
            is_active=False
        )
        if not self.is_active:
            self.is_active = True
            self.save(update_fields=["is_active", "updated_at"])

    @transaction.atomic
    def duplicate(self):
        """Copy this scenario, with its parameters, under a free name.

        The copy is never made active - duplicating should not move the user out
        of whatever they are working on.
        """
        copy = Scenario.objects.create(
            user=self.user,
            name=next_copy_name(self.user, self.name),
        )
        # Creating the scenario gave the copy default parameters and an empty
        # area (see the post_save receiver); overwrite both with ours.
        copy.parameters.copy_from(self.parameters)
        copy.area.copy_from(self.area)
        return copy

    @property
    def parameters(self):
        """The scenario's parameters, created on demand if somehow absent.

        Normally the post_save receiver has already made them; this guard keeps
        the property total, so callers never have to handle a missing row.
        """
        try:
            return self._parameters
        except ScenarioParameters.DoesNotExist:
            return ScenarioParameters.objects.create(scenario=self)

    @property
    def area(self):
        """The scenario's area, created on demand if somehow absent."""
        try:
            return self._area
        except ScenarioArea.DoesNotExist:
            return ScenarioArea.objects.create(scenario=self)


class ScenarioParameters(models.Model):
    """Simulation inputs for one scenario, mirroring Model/scenario.json.

    `agents` and `road_speeds` are stored as JSON rather than child tables: both
    are fixed-size vocabularies that are always read and written whole, never
    queried a row at a time, and keeping them here makes copying a scenario a
    single insert. Their shape is enforced by validators instead of by the
    schema, so `full_clean()` is what guarantees integrity - the forms call it.
    """

    scenario = models.OneToOneField(
        Scenario, on_delete=models.CASCADE, related_name="_parameters"
    )

    # --- Simulation window and stepping ---
    start_time = models.DateTimeField(default=default_start_time)
    end_time = models.DateTimeField(default=default_end_time)
    simulation_step_sec = models.PositiveIntegerField(
        default=10, validators=[MinValueValidator(1)]
    )

    # --- Modes ---
    demand_model = models.BooleanField(default=False)
    speed_based_routing = models.BooleanField(default=True)

    # --- Agents ---
    agents = models.JSONField(
        default=default_agent_profile,
        validators=[validate_agent_profile],
        help_text="Number of agents active in each hour of the day, midnight first.",
    )
    animation_agents = models.PositiveIntegerField(default=20)
    probability_hail = models.FloatField(
        default=0.75,
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
    )

    # --- Distances and routing ---
    max_total_distance_m = models.PositiveIntegerField(default=70000)
    buffer_distance = models.PositiveIntegerField(default=15000)
    passenger_max_dist = models.PositiveIntegerField(default=4000)
    deviation_factor = models.FloatField(
        default=1.4, validators=[MinValueValidator(1.0)]
    )
    swap_wait_sec = models.PositiveIntegerField(default=300)

    road_speeds = models.JSONField(
        default=default_road_speeds,
        validators=[validate_road_speeds],
        help_text="Assumed speed in km/h for each OSM highway type.",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "scenario parameters"
        verbose_name_plural = "scenario parameters"

    def __str__(self):
        return f"Parameters for {self.scenario.name}"

    def clean(self):
        super().clean()
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": "End time must be after start time."})

    # --- Convenience -----------------------------------------------------

    @property
    def total_agents(self):
        return sum(self.agents or [])

    @property
    def duration_hours(self):
        if not (self.start_time and self.end_time):
            return None
        return (self.end_time - self.start_time).total_seconds() / 3600

    COPYABLE_FIELDS = (
        "start_time",
        "end_time",
        "simulation_step_sec",
        "demand_model",
        "speed_based_routing",
        "agents",
        "animation_agents",
        "probability_hail",
        "max_total_distance_m",
        "buffer_distance",
        "passenger_max_dist",
        "deviation_factor",
        "swap_wait_sec",
        "road_speeds",
    )

    def copy_from(self, other):
        """Take every parameter value from `other`, leaving the owner alone."""
        for field in self.COPYABLE_FIELDS:
            value = getattr(other, field)
            # Copy the containers, or the two scenarios would share one object.
            if isinstance(value, list):
                value = list(value)
            elif isinstance(value, dict):
                value = dict(value)
            setattr(self, field, value)
        self.save()
        return self

    def as_scenario_dict(self):
        """Render back into the scenario.json shape, minus folder_name.

        Times become [Y, M, D, h, m, s] in the project timezone, matching the
        source file's representation.
        """

        def as_parts(value):
            local = timezone.localtime(value) if timezone.is_aware(value) else value
            return [
                local.year,
                local.month,
                local.day,
                local.hour,
                local.minute,
                local.second,
            ]

        return {
            "demand_model": self.demand_model,
            "speed_based_routing": self.speed_based_routing,
            "agents": list(self.agents),
            "animation_agents": self.animation_agents,
            "probability_hail": self.probability_hail,
            "start_time": as_parts(self.start_time),
            "end_time": as_parts(self.end_time),
            ROAD_SPEED_JSON_KEY: {rt: self.road_speeds[rt] for rt in ROAD_TYPES},
            "swap_wait_sec": self.swap_wait_sec,
            "max_total_distance_m": self.max_total_distance_m,
            "buffer_distance": self.buffer_distance,
            "passenger_max_dist": self.passenger_max_dist,
            "simulation_step_sec": self.simulation_step_sec,
            "deviation_factor": self.deviation_factor,
        }


class ScenarioArea(models.Model):
    """The geographic area a scenario covers, as GeoJSON.

    The row always exists; `geojson` being null means the user has not defined an
    area yet. Geometry is stored in WGS84 (EPSG:4326) - the projection GeoJSON
    mandates and what OpenStreetMap and exported files use - so no reprojection
    happens server-side.
    """

    class Source(models.TextChoices):
        DRAWN = "drawn", "Drawn on map"
        FILE = "file", "Imported from file"
        OSM = "osm", "Imported from OpenStreetMap"

    scenario = models.OneToOneField(
        Scenario, on_delete=models.CASCADE, related_name="_area"
    )

    geojson = models.JSONField(
        null=True,
        blank=True,
        help_text="Polygonal FeatureCollection in EPSG:4326, or null if unset.",
    )
    source = models.CharField(max_length=10, choices=Source.choices, blank=True)
    source_label = models.CharField(
        max_length=200,
        blank=True,
        help_text="Where it came from: a filename, or the OSM region name.",
    )
    osm_relation_id = models.BigIntegerField(null=True, blank=True)

    # Cached from the geometry so listings and summaries need not parse the JSON.
    min_lon = models.FloatField(null=True, blank=True)
    min_lat = models.FloatField(null=True, blank=True)
    max_lon = models.FloatField(null=True, blank=True)
    max_lat = models.FloatField(null=True, blank=True)
    vertex_count = models.PositiveIntegerField(default=0)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "scenario area"
        verbose_name_plural = "scenario areas"

    def __str__(self):
        return f"Area for {self.scenario.name}"

    @property
    def is_defined(self):
        return self.geojson is not None

    @property
    def bounds(self):
        """[min_lon, min_lat, max_lon, max_lat], or None when undefined."""
        if not self.is_defined or self.min_lon is None:
            return None
        return [self.min_lon, self.min_lat, self.max_lon, self.max_lat]

    @property
    def polygon_count(self):
        if not self.is_defined:
            return 0
        return len(self.geojson.get("features", []))

    def set_geometry(self, collection, bounds, vertex_count, *, source="", label="", relation_id=None):
        """Store an already-validated collection. Callers must use geo.normalise_area."""
        self.geojson = collection
        self.min_lon, self.min_lat, self.max_lon, self.max_lat = bounds
        self.vertex_count = vertex_count
        self.source = source
        self.source_label = label[:200]
        self.osm_relation_id = relation_id
        self.save()
        return self

    def clear(self):
        self.geojson = None
        self.source = ""
        self.source_label = ""
        self.osm_relation_id = None
        self.min_lon = self.min_lat = self.max_lon = self.max_lat = None
        self.vertex_count = 0
        self.save()
        return self

    def copy_from(self, other):
        self.geojson = other.geojson  # replaced wholesale, never mutated in place
        self.source = other.source
        self.source_label = other.source_label
        self.osm_relation_id = other.osm_relation_id
        self.min_lon, self.min_lat = other.min_lon, other.min_lat
        self.max_lon, self.max_lat = other.max_lon, other.max_lat
        self.vertex_count = other.vertex_count
        self.save()
        return self


@receiver(post_save, sender=Scenario)
def create_scenario_parameters(sender, instance, created, **kwargs):
    """Every scenario gets a parameter set and an area row, however it was created."""
    if created:
        ScenarioParameters.objects.get_or_create(scenario=instance)
        ScenarioArea.objects.get_or_create(scenario=instance)


def next_copy_name(user, name):
    """Pick a free name for a copy: "Plan" -> "Plan (copy)" -> "Plan (copy 2)".

    The base is trimmed so the suffix always fits within the column, otherwise
    copying a maximum-length name would raise a database error.
    """
    taken = set(
        Scenario.objects.for_user(user).values_list("name", flat=True)
    )

    for attempt in range(1, 1000):
        suffix = " (copy)" if attempt == 1 else f" (copy {attempt})"
        base = name[: SCENARIO_NAME_MAX_LENGTH - len(suffix)].rstrip()
        candidate = f"{base}{suffix}"
        if candidate not in taken:
            return candidate

    # Pathological case: fall back to something guaranteed to be free.
    return f"{name[:SCENARIO_NAME_MAX_LENGTH - 25]} (copy {user.scenarios.count() + 1})"
