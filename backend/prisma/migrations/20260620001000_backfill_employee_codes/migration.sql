UPDATE "User"
SET "employeeCode" = 'NV0001'
WHERE "email" = 'admin@homex.com'
  AND "employeeCode" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" existing_user WHERE existing_user."employeeCode" = 'NV0001'
  );

UPDATE "User"
SET "employeeCode" = 'NV0002'
WHERE "email" = 'cashier@homex.com'
  AND "employeeCode" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" existing_user WHERE existing_user."employeeCode" = 'NV0002'
  );
