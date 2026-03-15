This migration converts the Feature -> Plan one-to-many relation into a many-to-many
relation using an explicit join table `PlanFeatures`.

Steps performed by this SQL migration:
- Create the `PlanFeatures` join table (planId, featureId)
- Copy existing Feature.planId relations into the new join table
- Recreate the `Feature` table without the `planId` column

Notes:
- Historical note: this migration originated in the SQLite era.
- On the current PostgreSQL flow it is intentionally superseded by baseline migration `20260206_add_plans`.
- Backup your database before running migrations.
