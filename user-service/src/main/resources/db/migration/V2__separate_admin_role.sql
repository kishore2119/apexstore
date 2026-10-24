DELETE FROM user_roles
WHERE role IN ('CUSTOMER', 'SELLER')
  AND user_id IN (SELECT user_id FROM user_roles WHERE role = 'ADMIN');
