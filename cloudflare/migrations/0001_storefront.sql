-- The storefront's data (docs/STOREFRONT.md). The shop's own records stay in the shop's app.

CREATE TABLE shop_profile (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	data TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE customers (
	id TEXT PRIMARY KEY,
	phone TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL DEFAULT '',
	email TEXT NOT NULL DEFAULT '',
	terms_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE otp_challenges (
	phone TEXT PRIMARY KEY,
	code_hash TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	sent_at TEXT NOT NULL
);

CREATE TABLE customer_sessions (
	token_hash TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL
);
CREATE INDEX customer_sessions_customer ON customer_sessions(customer_id);

CREATE TABLE shop_sessions (
	token_hash TEXT PRIMARY KEY,
	expires_at TEXT NOT NULL
);

CREATE TABLE vehicles (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	plate TEXT NOT NULL,
	plate_key TEXT NOT NULL,
	make TEXT NOT NULL DEFAULT '',
	model TEXT NOT NULL DEFAULT '',
	year INTEGER,
	created_at TEXT NOT NULL,
	deleted_at TEXT
);
CREATE UNIQUE INDEX vehicles_one_plate_per_customer ON vehicles(customer_id, plate_key) WHERE deleted_at IS NULL;

CREATE TABLE bookings (
	id TEXT PRIMARY KEY,
	ref TEXT NOT NULL UNIQUE,
	customer_id TEXT NOT NULL REFERENCES customers(id),
	vehicle_id TEXT,
	vehicle TEXT NOT NULL,
	services TEXT NOT NULL,
	complaint TEXT NOT NULL DEFAULT '',
	start TEXT NOT NULL,
	end TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'requested',
	reason TEXT,
	appointment_id TEXT,
	idempotency_key TEXT NOT NULL,
	version INTEGER NOT NULL DEFAULT 1,
	shop_version INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (customer_id, idempotency_key)
);
CREATE INDEX bookings_time ON bookings(status, start, end);
CREATE INDEX bookings_customer ON bookings(customer_id, start);
CREATE INDEX bookings_inbox ON bookings(shop_version, version);

-- When the shop is busy: times only, no names or cars.
CREATE TABLE busy_blocks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	start TEXT NOT NULL,
	end TEXT NOT NULL
);
CREATE INDEX busy_blocks_time ON busy_blocks(start, end);

-- Visit summaries the shop chose to share, only for phones that have an account here.
CREATE TABLE visits (
	id TEXT PRIMARY KEY,
	phone TEXT NOT NULL,
	day TEXT NOT NULL,
	plate TEXT NOT NULL DEFAULT '',
	car TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT '',
	total INTEGER,
	invoice TEXT
);
CREATE INDEX visits_phone ON visits(phone, day);

CREATE TABLE rate_limits (
	key TEXT NOT NULL,
	window INTEGER NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (key, window)
);
