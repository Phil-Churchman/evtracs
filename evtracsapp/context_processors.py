from .models import Scenario


def scenarios(request):
    """Expose the user's scenarios so the nav switcher works on every page.

    Anonymous requests get empty values rather than a query - the login and
    signup pages render through the same base template.
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return {"user_scenarios": Scenario.objects.none(), "active_scenario": None}

    user_scenarios = list(Scenario.objects.for_user(user))
    active = next((s for s in user_scenarios if s.is_active), None)

    return {"user_scenarios": user_scenarios, "active_scenario": active}
