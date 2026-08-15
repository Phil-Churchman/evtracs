from django.contrib import admin

from .models import Scenario, ScenarioArea, ScenarioParameters


class ScenarioParametersInline(admin.StackedInline):
    model = ScenarioParameters
    can_delete = False
    extra = 0


class ScenarioAreaInline(admin.StackedInline):
    model = ScenarioArea
    can_delete = False
    extra = 0
    readonly_fields = ("min_lon", "min_lat", "max_lon", "max_lat", "vertex_count")


@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "is_active", "updated_at")
    list_filter = ("is_active", "user")
    search_fields = ("name", "user__username")
    ordering = ("user__username", "name")
    inlines = [ScenarioParametersInline, ScenarioAreaInline]
