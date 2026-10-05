ALTER TABLE orders ADD COLUMN address_line1 VARCHAR(200);
ALTER TABLE orders ADD COLUMN address_line2 VARCHAR(200);
ALTER TABLE orders ADD COLUMN delivery_city VARCHAR(100);
ALTER TABLE orders ADD COLUMN delivery_state VARCHAR(100);
ALTER TABLE orders ADD COLUMN delivery_pincode VARCHAR(6);
ALTER TABLE orders ADD COLUMN delivery_country VARCHAR(50);
ALTER TABLE orders ADD COLUMN delivery_phone VARCHAR(10);
ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'COD';
ALTER TABLE orders ADD CONSTRAINT orders_demo_payment CHECK (payment_method IN ('COD','ONLINE_DEMO'));
