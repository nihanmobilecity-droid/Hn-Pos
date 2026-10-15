const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'inventory.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  -- প্রোডাক্ট টেবিল (মোবাইল, চার্জার, কেবল সবকিছুর জন্য)
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,            -- যেমন: Mobile, Charger, Cable
    barcode TEXT UNIQUE,       -- সাধারণ বারকোড (যদি থাকে, অপশনাল)
    cost_price REAL DEFAULT 0, -- কেনা দাম
    sale_price REAL NOT NULL,  -- বিক্রয় দাম
    stock_quantity INTEGER DEFAULT 0, -- সাধারণ পণ্যের ক্ষেত্রে সরাসরি স্টক
    has_imei INTEGER DEFAULT 0,       -- ১ হলে IMEI লাগবে, ০ হলে লাগবে না
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- শুধু যে পণ্যের IMEI বা সিরিয়াল লাগবে (যেমন: মোবাইল)
  CREATE TABLE IF NOT EXISTS product_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    imei_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'SOLD', 'DEFECTIVE'
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  -- বিক্রয় হিসাব
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount REAL NOT NULL,
    discount REAL DEFAULT 0,
    paid_amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'CASH', -- CASH, BKASH, CARD
    sale_date DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- বিক্রিত আইটেম তালিকা
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    imei_id INTEGER,                   -- মোবাইল হলে IMEI ID, চার্জার/কেবলের জন্য NULL
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (imei_id) REFERENCES product_serials(id)
  );
`);

module.exports = db;