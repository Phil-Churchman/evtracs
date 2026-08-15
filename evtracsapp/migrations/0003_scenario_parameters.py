
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion
import evtracsapp.models


def create_missing_parameters(apps, schema_editor):
    """Give every pre-existing scenario a default parameter set.

    New scenarios get theirs from a post_save receiver, but that never ran for
    rows created before this migration.
    """
    Scenario = apps.get_model("evtracsapp", "Scenario")
    ScenarioParameters = apps.get_model("evtracsapp", "ScenarioParameters")

    missing = Scenario.objects.filter(_parameters__isnull=True)
    ScenarioParameters.objects.bulk_create(
        [ScenarioParameters(scenario=scenario) for scenario in missing]
    )


class Migration(migrations.Migration):

    dependencies = [
        ('evtracsapp', '0002_scenario'),
    ]

    operations = [
        migrations.CreateModel(
            name='ScenarioParameters',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_time', models.DateTimeField(default=evtracsapp.models.default_start_time)),
                ('end_time', models.DateTimeField(default=evtracsapp.models.default_end_time)),
                ('simulation_step_sec', models.PositiveIntegerField(default=10, validators=[django.core.validators.MinValueValidator(1)])),
                ('demand_model', models.BooleanField(default=False)),
                ('speed_based_routing', models.BooleanField(default=True)),
                ('agents', models.JSONField(default=evtracsapp.models.default_agent_profile, help_text='Number of agents active in each hour of the day, midnight first.', validators=[evtracsapp.models.validate_agent_profile])),
                ('animation_agents', models.PositiveIntegerField(default=20)),
                ('probability_hail', models.FloatField(default=0.75, validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(1.0)])),
                ('max_total_distance_m', models.PositiveIntegerField(default=70000)),
                ('buffer_distance', models.PositiveIntegerField(default=15000)),
                ('passenger_max_dist', models.PositiveIntegerField(default=4000)),
                ('deviation_factor', models.FloatField(default=1.4, validators=[django.core.validators.MinValueValidator(1.0)])),
                ('swap_wait_sec', models.PositiveIntegerField(default=300)),
                ('road_speeds', models.JSONField(default=evtracsapp.models.default_road_speeds, help_text='Assumed speed in km/h for each OSM highway type.', validators=[evtracsapp.models.validate_road_speeds])),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scenario', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='_parameters', to='evtracsapp.scenario')),
            ],
            options={
                'verbose_name': 'scenario parameters',
                'verbose_name_plural': 'scenario parameters',
            },
        ),
        migrations.RunPython(
            create_missing_parameters,
            migrations.RunPython.noop,
        ),
    ]
