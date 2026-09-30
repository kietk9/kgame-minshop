ALTER TABLE staff_accounts ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]';
-- Retain only the basic role access; never infer financial privileges from old UI access.
UPDATE staff_accounts SET permissions_json=CASE WHEN role='CASHIER'
 THEN '["sales.view","sales.create","sales.collect","sales.fulfill"]'
 ELSE '["sales.view"]' END, session_version=session_version+1;
DELETE FROM staff_sessions;
