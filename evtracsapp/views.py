import json

from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template import loader
from django.urls import reverse
from django.views.decorators.http import require_POST

from . import geo
from .forms import ScenarioForm, ScenarioParametersForm
from .models import Scenario, ScenarioArea


def home(request):
    if request.user.is_authenticated:
        template = loader.get_template('home.html')
        return HttpResponse(template.render({}, request))
    else:
        return HttpResponseRedirect("/accounts/login/")


def change_password(request):
    if request.method == 'POST':
        form = PasswordChangeForm(request.user, data=request.POST)
        if form.is_valid():
            form.save()
            update_session_auth_hash(request, form.user)  # dont logout the user.
            return redirect("/")
    else:
        form = PasswordChangeForm(request.user)

    return render(request, "registration/change_password.html", {'form': form})


# --- Scenarios ---------------------------------------------------------------
#
# Every lookup goes through `_owned_scenario`, so a user can only ever reach
# their own rows - guessing another user's scenario id gives a 404, not access.

# The create and rename forms share a page, so the rename fields are prefixed to
# keep their input names and element ids distinct.
RENAME_PREFIX = "rename"


def _owned_scenario(request, pk):
    return get_object_or_404(Scenario, pk=pk, user=request.user)


def _back_to_scenarios(request):
    """Return to the scenarios page, preserving nothing else from the request."""
    return redirect(reverse("scenarios"))


def _render_scenarios(request, *, create_form=None, rename_form=None, editing_id=None):
    """Render the scenarios page.

    `editing_id` puts one row into inline-rename mode. Rename is driven by a
    plain GET parameter rather than JavaScript, so it degrades gracefully and
    the failed-validation case can re-render the row with its errors.
    """
    if create_form is None:
        create_form = ScenarioForm(user=request.user, autofocus=editing_id is None)

    return render(
        request,
        "scenarios.html",
        {
            "form": create_form,
            "rename_form": rename_form,
            "editing_id": editing_id,
            "scenarios": Scenario.objects.for_user(request.user),
        },
    )


@login_required
def scenarios(request):
    """List the user's scenarios and handle creation of new ones."""
    if request.method == "POST":
        form = ScenarioForm(request.POST, user=request.user, autofocus=True)
        if form.is_valid():
            scenario = form.save()
            # A user's first scenario becomes active automatically, so they are
            # never left with scenarios but nothing selected.
            if not Scenario.objects.for_user(request.user).active().exists():
                scenario.activate()
            messages.success(request, f'Created "{scenario.name}".')
            return _back_to_scenarios(request)
        return _render_scenarios(request, create_form=form)

    # ?edit=<pk> opens that row for renaming. Unknown or other users' ids are
    # ignored rather than erroring - the page is still perfectly renderable.
    editing_id = None
    rename_form = None
    requested = request.GET.get("edit", "")
    if requested.isdigit():
        target = Scenario.objects.for_user(request.user).filter(pk=int(requested)).first()
        if target is not None:
            editing_id = target.pk
            rename_form = ScenarioForm(
                instance=target, user=request.user, prefix=RENAME_PREFIX, autofocus=True
            )

    return _render_scenarios(request, rename_form=rename_form, editing_id=editing_id)


@login_required
@require_POST
def scenario_rename(request, pk):
    scenario = _owned_scenario(request, pk)
    previous = scenario.name

    form = ScenarioForm(
        request.POST, instance=scenario, user=request.user, prefix=RENAME_PREFIX
    )
    if form.is_valid():
        renamed = form.save()
        if renamed.name == previous:
            messages.info(request, "Name unchanged.")
        else:
            messages.success(request, f'Renamed "{previous}" to "{renamed.name}".')
        return _back_to_scenarios(request)

    # Keep the row open so the user can see and fix the problem.
    return _render_scenarios(request, rename_form=form, editing_id=scenario.pk)


@login_required
@require_POST
def scenario_activate(request, pk):
    scenario = _owned_scenario(request, pk)
    scenario.activate()
    messages.success(request, f'"{scenario.name}" is now active.')
    return _back_to_scenarios(request)


@login_required
@require_POST
def scenario_copy(request, pk):
    scenario = _owned_scenario(request, pk)
    try:
        copy = scenario.duplicate()
    except IntegrityError:
        messages.error(request, "Could not copy that scenario. Please try again.")
        return _back_to_scenarios(request)

    messages.success(request, f'Copied to "{copy.name}".')
    return _back_to_scenarios(request)


@login_required
@require_POST
def scenario_delete(request, pk):
    scenario = _owned_scenario(request, pk)
    was_active = scenario.is_active
    name = scenario.name
    scenario.delete()

    # Deleting the active scenario would otherwise leave the user with no
    # selection at all, so promote the most recently updated survivor.
    if was_active:
        successor = (
            Scenario.objects.for_user(request.user).order_by("-updated_at").first()
        )
        if successor:
            successor.activate()

    messages.success(request, f'Deleted "{name}".')
    return _back_to_scenarios(request)


@login_required
def scenario_parameters(request, pk):
    """View and edit the simulation parameters for one scenario."""
    scenario = _owned_scenario(request, pk)
    parameters = scenario.parameters

    if request.method == "POST":
        form = ScenarioParametersForm(request.POST, instance=parameters)
        if form.is_valid():
            form.save()
            messages.success(request, f'Saved parameters for "{scenario.name}".')
            return redirect(reverse("scenario_parameters", args=[scenario.pk]))
    else:
        form = ScenarioParametersForm(instance=parameters)

    return render(
        request,
        "scenario_parameters.html",
        {
            "scenario": scenario,
            "parameters": parameters,
            "form": form,
        },
    )


# --- Scenario area -----------------------------------------------------------
#
# Areas can be drawn, read from a file, or fetched from OpenStreetMap. All three
# are client-side, so all three post here and are validated the same way before
# anything is stored.


@login_required
def scenario_area(request, pk):
    """View, draw, import and save the geographic area for one scenario."""
    scenario = _owned_scenario(request, pk)
    area = scenario.area

    if request.method == "POST":
        raw = request.POST.get("geojson", "").strip()
        if not raw:
            messages.error(request, "No area was submitted.")
            return redirect(reverse("scenario_area", args=[scenario.pk]))

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            messages.error(request, "That area is not valid JSON.")
            return redirect(reverse("scenario_area", args=[scenario.pk]))

        try:
            collection, bounds, vertices = geo.normalise_area(parsed)
        except ValidationError as error:
            messages.error(request, "; ".join(error.messages))
            return redirect(reverse("scenario_area", args=[scenario.pk]))

        source = request.POST.get("source", "")
        if source not in ScenarioArea.Source.values:
            source = ""

        relation_id = request.POST.get("osm_relation_id", "")
        relation_id = int(relation_id) if relation_id.isdigit() else None

        area.set_geometry(
            collection,
            bounds,
            vertices,
            source=source,
            label=request.POST.get("source_label", ""),
            relation_id=relation_id,
        )

        messages.success(request, f'Saved the area for "{scenario.name}".')
        return redirect(reverse("scenario_area", args=[scenario.pk]))

    return render(
        request,
        "scenario_area.html",
        {
            "scenario": scenario,
            "area": area,
            "area_json": json.dumps(area.geojson) if area.is_defined else "",
            "source_choices": ScenarioArea.Source,
        },
    )


@login_required
@require_POST
def scenario_area_clear(request, pk):
    scenario = _owned_scenario(request, pk)
    scenario.area.clear()
    messages.success(request, f'Cleared the area for "{scenario.name}".')
    return redirect(reverse("scenario_area", args=[scenario.pk]))


@login_required
def scenario_area_export(request, pk):
    """Download the saved area as a .geojson file."""
    scenario = _owned_scenario(request, pk)
    area = scenario.area

    if not area.is_defined:
        messages.error(request, "There is no area to export yet.")
        return redirect(reverse("scenario_area", args=[scenario.pk]))

    filename = _area_filename(scenario.name)
    response = JsonResponse(area.geojson)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _area_filename(scenario_name):
    """A safe, recognisable download name derived from the scenario."""
    safe = "".join(
        character if character.isalnum() or character in "-_" else "-"
        for character in scenario_name.strip().lower().replace(" ", "-")
    ).strip("-")
    return f"{safe or 'scenario'}-area.geojson"
