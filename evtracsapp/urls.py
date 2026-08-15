from django.urls import path, include
from . import views

urlpatterns = [
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("django.contrib.auth.urls")),
    path("change_password/", views.change_password, name="change_password"),

    path("scenarios/", views.scenarios, name="scenarios"),
    path("scenarios/<int:pk>/activate/", views.scenario_activate, name="scenario_activate"),
    path("scenarios/<int:pk>/rename/", views.scenario_rename, name="scenario_rename"),
    path("scenarios/<int:pk>/parameters/", views.scenario_parameters, name="scenario_parameters"),
    path("scenarios/<int:pk>/area/", views.scenario_area, name="scenario_area"),
    path("scenarios/<int:pk>/area/clear/", views.scenario_area_clear, name="scenario_area_clear"),
    path("scenarios/<int:pk>/area/export/", views.scenario_area_export, name="scenario_area_export"),
    path("scenarios/<int:pk>/copy/", views.scenario_copy, name="scenario_copy"),
    path("scenarios/<int:pk>/delete/", views.scenario_delete, name="scenario_delete"),

    path("home/", views.home, name="home"),
    path("", views.home, name="home"),
]
