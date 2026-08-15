"""Initial migration for evtracsapp.

The app was previously called ``loggerapp`` and owned the GeoLogger tracking
models (``Device`` and ``Location``). Both the feature and the models are gone,
so this app now has no models at all and there is nothing to create.

What is left to do is clean up after the old app:

* drop the ``loggerapp_device`` / ``loggerapp_location`` tables, and
* delete the bookkeeping rows (migration history, content types, permissions)
  that still point at the ``loggerapp`` label.

All of it is guarded, so this is a no-op on a fresh database.
"""

from django.db import migrations

LEGACY_APP_LABEL = "loggerapp"

# Child first - loggerapp_location has a foreign key to loggerapp_device.
LEGACY_TABLES = ("loggerapp_location", "loggerapp_device")


def drop_legacy_geologger_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing = set(connection.introspection.table_names())

    with connection.cursor() as cursor:
        for table in LEGACY_TABLES:
            if table in existing:
                cursor.execute(f"DROP TABLE {connection.ops.quote_name(table)}")

        cursor.execute(
            "DELETE FROM django_migrations WHERE app = %s", [LEGACY_APP_LABEL]
        )

    ContentType = apps.get_model("contenttypes", "ContentType")
    Permission = apps.get_model("auth", "Permission")

    stale = ContentType.objects.filter(app_label=LEGACY_APP_LABEL)
    Permission.objects.filter(content_type__in=stale).delete()
    stale.delete()


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("contenttypes", "__first__"),
        ("auth", "__first__"),
    ]

    operations = [
        migrations.RunPython(
            drop_legacy_geologger_tables,
            # The dropped tables cannot be reconstructed, so unapplying this
            # migration simply leaves the database as it is.
            migrations.RunPython.noop,
        ),
    ]
