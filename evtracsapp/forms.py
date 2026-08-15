from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.forms import ValidationError
from django_recaptcha.fields import ReCaptchaField
from django_recaptcha.widgets import ReCaptchaV3

from .models import (
    HOURS_PER_DAY,
    ROAD_TYPES,
    Scenario,
    ScenarioParameters,
)


class RegisterForm(UserCreationForm):
    captcha = ReCaptchaField(widget=ReCaptchaV3)

    class Meta:
        model = User
        fields = ['username', 'email', 'password1', 'password2']

    def clean_email(self):
        email = self.cleaned_data["email"]
        if User.objects.filter(email=email).exists():
            raise ValidationError("A user with this email already exists!")
        return email

    def __init__(self, *args, **kwargs):
        super(RegisterForm, self).__init__(*args, **kwargs)
        self.fields["email"].required = True


class ScenarioForm(forms.ModelForm):
    """Create or rename a scenario.

    The owner is never taken from the form - it is passed in by the view, so a
    crafted POST cannot create a scenario against another account.
    """

    class Meta:
        model = Scenario
        fields = ["name"]
        widgets = {
            "name": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Scenario name",
                    "autocomplete": "off",
                    "maxlength": Scenario._meta.get_field("name").max_length,
                }
            )
        }
        labels = {"name": "Name"}
        # CharField strips input and raises "required" before clean_name runs,
        # so a whitespace-only name is caught here rather than there.
        error_messages = {"name": {"required": "Please give the scenario a name."}}

    def __init__(self, *args, user=None, autofocus=False, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        # Only one field on the page may claim focus, and which one depends on
        # whether the user is creating or renaming, so the view decides.
        if autofocus:
            self.fields["name"].widget.attrs["autofocus"] = "autofocus"

    def clean_name(self):
        name = self.cleaned_data["name"].strip()
        if not name:
            raise ValidationError("Please give the scenario a name.")

        clashes = Scenario.objects.for_user(self.user).filter(name__iexact=name)
        if self.instance.pk:
            clashes = clashes.exclude(pk=self.instance.pk)
        if clashes.exists():
            raise ValidationError("You already have a scenario with that name.")

        return name

    def save(self, commit=True):
        scenario = super().save(commit=False)
        scenario.user = self.user
        if commit:
            if scenario.pk:
                # Write only the name. A full save would also rewrite is_active
                # from a possibly stale instance, undoing a concurrent activate.
                scenario.save(update_fields=["name", "updated_at"])
            else:
                scenario.save()
        return scenario


HOUR_FIELD_PREFIX = "hour_"
ROAD_FIELD_PREFIX = "road_"


class ScenarioParametersForm(forms.ModelForm):
    """Edit one scenario's parameters.

    The 24 hourly agent counts and the 23 road speeds are stored as JSON, but
    editing raw JSON in a textarea is miserable and gives poor errors. So each
    entry gets its own real form field, built here and packed back into the JSON
    structures on save - the user sees one input per hour and per road type,
    with per-field validation messages.
    """

    class Meta:
        model = ScenarioParameters
        fields = [
            "start_time",
            "end_time",
            "simulation_step_sec",
            "demand_model",
            "speed_based_routing",
            "animation_agents",
            "probability_hail",
            "max_total_distance_m",
            "buffer_distance",
            "passenger_max_dist",
            "deviation_factor",
            "swap_wait_sec",
        ]
        labels = {
            "start_time": "Start time",
            "end_time": "End time",
            "simulation_step_sec": "Simulation step (s)",
            "demand_model": "Use demand model",
            "speed_based_routing": "Speed-based routing",
            "animation_agents": "Animation agents",
            "probability_hail": "Probability of hailing",
            "max_total_distance_m": "Max total distance (m)",
            "buffer_distance": "Buffer distance (m)",
            "passenger_max_dist": "Passenger max distance (m)",
            "deviation_factor": "Deviation factor",
            "swap_wait_sec": "Swap wait (s)",
        }
        widgets = {
            "start_time": forms.DateTimeInput(
                attrs={"type": "datetime-local", "class": "form-control"},
                format="%Y-%m-%dT%H:%M",
            ),
            "end_time": forms.DateTimeInput(
                attrs={"type": "datetime-local", "class": "form-control"},
                format="%Y-%m-%dT%H:%M",
            ),
            "simulation_step_sec": forms.NumberInput(attrs={"class": "form-control", "min": 1}),
            "animation_agents": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            "probability_hail": forms.NumberInput(
                attrs={"class": "form-control", "min": 0, "max": 1, "step": "0.01"}
            ),
            "max_total_distance_m": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            "buffer_distance": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            "passenger_max_dist": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            "deviation_factor": forms.NumberInput(
                attrs={"class": "form-control", "min": 1, "step": "0.1"}
            ),
            "swap_wait_sec": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Browsers send datetime-local as "YYYY-MM-DDTHH:MM".
        for name in ("start_time", "end_time"):
            self.fields[name].input_formats = ["%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"]

        self.fields["demand_model"].widget.attrs["class"] = "form-check-input"
        self.fields["speed_based_routing"].widget.attrs["class"] = "form-check-input"

        agents = list(getattr(self.instance, "agents", None) or [])
        for hour in range(HOURS_PER_DAY):
            self.fields[f"{HOUR_FIELD_PREFIX}{hour}"] = forms.IntegerField(
                label=f"{hour:02d}:00",
                min_value=0,
                initial=agents[hour] if hour < len(agents) else 0,
                widget=forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            )

        speeds = dict(getattr(self.instance, "road_speeds", None) or {})
        for road_type in ROAD_TYPES:
            self.fields[f"{ROAD_FIELD_PREFIX}{road_type}"] = forms.IntegerField(
                label=road_type.replace("_", " "),
                min_value=0,
                initial=speeds.get(road_type, 0),
                widget=forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            )

    # --- Grouping helpers for the template -------------------------------

    def hour_fields(self):
        return [self[f"{HOUR_FIELD_PREFIX}{hour}"] for hour in range(HOURS_PER_DAY)]

    def road_fields(self):
        return [self[f"{ROAD_FIELD_PREFIX}{road_type}"] for road_type in ROAD_TYPES]

    def collection_errors(self):
        """Errors from the hour/road fields, which render without their own labels."""
        problems = []
        for field in self.hour_fields() + self.road_fields():
            for error in field.errors:
                problems.append(f"{field.label}: {error}")
        return problems

    # --- Validation and save ---------------------------------------------

    def clean(self):
        cleaned = super().clean()

        start, end = cleaned.get("start_time"), cleaned.get("end_time")
        if start and end and end <= start:
            self.add_error("end_time", "End time must be after start time.")

        # Only rebuild the collections if every entry validated; a partial list
        # would fail the model validators with a confusing message.
        if not any(
            f"{HOUR_FIELD_PREFIX}{hour}" in self.errors for hour in range(HOURS_PER_DAY)
        ):
            cleaned["agents"] = [
                cleaned[f"{HOUR_FIELD_PREFIX}{hour}"] for hour in range(HOURS_PER_DAY)
            ]

        if not any(f"{ROAD_FIELD_PREFIX}{rt}" in self.errors for rt in ROAD_TYPES):
            cleaned["road_speeds"] = {
                rt: cleaned[f"{ROAD_FIELD_PREFIX}{rt}"] for rt in ROAD_TYPES
            }

        return cleaned

    def save(self, commit=True):
        parameters = super().save(commit=False)

        if "agents" in self.cleaned_data:
            parameters.agents = self.cleaned_data["agents"]
        if "road_speeds" in self.cleaned_data:
            parameters.road_speeds = self.cleaned_data["road_speeds"]

        if commit:
            # Runs the JSON validators too, so the stored shape is always valid.
            parameters.full_clean()
            parameters.save()
        return parameters
