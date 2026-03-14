This migration converts the Feature -> Plan one-to-many relation into a many-to-many
relation using an explicit join table `PlanFeatures`.

Steps performed by this SQL migration:
- Create the `PlanFeatures` join table (planId, featureId)
- Copy existing Feature.planId relations into the new join table
- Recreate the `Feature` table without the `planId` column

Notes:
- This migration is written for SQLite. If you use a different provider, adapt accordingly.
- Backup your database before running migrations.
