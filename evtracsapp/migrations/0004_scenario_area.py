
from django.db import migrations, models
import django.db.models.deletion


def create_missing_areas(apps, schema_editor):
    """Give every pre-existing scenario an (empty) area row."""
    Scenario = apps.get_model("evtracsapp", "Scenario")
    ScenarioArea = apps.get_model("evtracsapp", "ScenarioArea")

    missing = Scenario.objects.filter(_area__isnull=True)
    ScenarioArea.objects.bulk_create(
        [ScenarioArea(scenario=scenario) for scenario in missing]
    )


class Migration(migrations.Migration):

    dependencies = [
        ('evtracsapp', '0003_scenario_parameters'),
    ]

    operations = [
        migrations.CreateModel(
            name='ScenarioArea',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('geojson', models.JSONField(blank=True, help_text='Polygonal FeatureCollection in EPSG:4326, or null if unset.', null=True)),
                ('source', models.CharField(blank=True, choices=[('drawn', 'Drawn on map'), ('file', 'Imported from file'), ('osm', 'Imported from OpenStreetMap')], max_length=10)),
                ('source_label', models.CharField(blank=True, help_text='Where it came from: a filename, or the OSM region name.', max_length=200)),
                ('osm_relation_id', models.BigIntegerField(blank=True, null=True)),
                ('min_lon', models.FloatField(blank=True, null=True)),
                ('min_lat', models.FloatField(blank=True, null=True)),
                ('max_lon', models.FloatField(blank=True, null=True)),
                ('max_lat', models.FloatField(blank=True, null=True)),
                ('vertex_count', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scenario', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='_area', to='evtracsapp.scenario')),
            ],
            options={
                'verbose_name': 'scenario area',
                'verbose_name_plural': 'scenario areas',
            },
        ),
        migrations.RunPython(
            create_missing_areas,
            migrations.RunPython.noop,
        ),
    ]
