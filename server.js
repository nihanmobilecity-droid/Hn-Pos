const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ১. ডাটাবেজ টেবিল চেক ও স্বয়ংক্রিয় তৈরি
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    stock_quantity INTEGER DEFAULT 0,
    buy_price REAL DEFAULT 0,
    sale_price REAL NOT NULL,
    supplier TEXT DEFAULT '-'
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount REAL NOT NULL,
    discount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    due_amount REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    sale_date TEXT,
    sale_time TEXT
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    unit_price REAL,
    buy_price REAL DEFAULT 0,
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

// টেবিল কলাম মিসিং থাকলে স্বয়ংক্রিয় অ্যাড
try { db.exec("ALTER TABLE products ADD COLUMN supplier TEXT DEFAULT '-';"); } catch (e) {}
try { db.exec("ALTER TABLE sales ADD COLUMN total_cost REAL DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE sale_items ADD COLUMN buy_price REAL DEFAULT 0;"); } catch (e) {}

// ২. সব প্রোডাক্ট দেখা (স্টকসহ)
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ৩. নতুন প্রোডাক্ট যোগ করা (সাপ্লায়ার ও কেনা দামসহ)
app.post('/api/products', (req, res) => {
  const { name, category, stock_quantity, buy_price, sale_price, supplier } = req.body;
  try {
    const stmt = db.prepare(`
      INSERT INTO products (name, category, stock_quantity, buy_price, sale_price, supplier)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      name,
      category || 'Accessories',
      parseInt(stock_quantity) || 0,
      parseFloat(buy_price) || 0,
      parseFloat(sale_price) || 0,
      supplier || '-'
    );
    res.json({ id: info.lastInsertRowid, message: 'Product added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৪. প্রোডাক্ট এডিট করা
app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, stock_quantity, buy_price, sale_price, supplier } = req.body;
  try {
    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, category = ?, stock_quantity = ?, buy_price = ?, sale_price = ?, supplier = ?
      WHERE id = ?
    `);
    stmt.run(
      name,
      category || 'Accessories',
      parseInt(stock_quantity) || 0,
      parseFloat(buy_price) || 0,
      parseFloat(sale_price) || 0,
      supplier || '-',
      id
    );
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৫. প্রোডাক্ট ডিলিট করা
app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৬. বিক্রয় সম্পন্ন করা (সঠিক লাভ ও কেনা দাম হিসাবসহ)
app.post('/api/sales', (req, res) => {
  const { customer_name, customer_phone, discount = 0, paid_amount = 0, items = [] } = req.body;
  
  try {
    let total_amount = 0;
    let total_cost = 0;

    // মোট বিক্রি ও মোট কেনা খরচ হিসাব
    items.forEach(item => {
      const qty = parseInt(item.quantity) || 1;
      const uPrice = parseFloat(item.unit_price) || 0;
      const bPrice = parseFloat(item.buy_price) || 0;

      total_amount += (uPrice * qty);
      total_cost += (bPrice * qty); // মোট কেনা খরচ
    });

    const net_total = Math.max(0, total_amount - parseFloat(discount));
    const paid = parseFloat(paid_amount) || 0;
    const due_amount = Math.max(0, net_total - paid);
    
    const now = new Date();
    const sale_date = now.toISOString().slice(0, 10);
    const sale_time = now.toTimeString().slice(0, 8);

    // Sales টেবিলে কেনা খরচসহ (total_cost) ডাটা সংরক্ষণ
    const insertSale = db.prepare(`
      INSERT INTO sales (customer_name, customer_phone, total_amount, discount, paid_amount, due_amount, total_cost, sale_date, sale_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertSale.run(
      customer_name || 'Walk-in Customer',
      customer_phone || '-',
      net_total,
      parseFloat(discount),
      paid,
      due_amount,
      total_cost,
      sale_date,
      sale_time
    );

    const saleId = result.lastInsertRowid;

    // বিক্রিত আইটেম সংরক্ষণ এবং স্টক মাইনাস
    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, buy_price)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateStock = db.prepare(`
      UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?
    `);

    items.forEach(item => {
      const qty = parseInt(item.quantity) || 1;
      insertItem.run(saleId, item.product_id, qty, parseFloat(item.unit_price), parseFloat(item.buy_price) || 0);
      updateStock.run(qty, item.product_id);
    });

    res.json({ success: true, saleId: saleId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ৭. দৈনিক বিক্রয় রিপোর্ট ও লগ
app.get('/api/reports/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const sales = db.prepare(`
      SELECT id, sale_date, sale_time, customer_name, customer_phone, total_amount, discount, paid_amount, due_amount, total_cost
      FROM sales 
      WHERE sale_date = ? 
      ORDER BY id DESC
    `).all(date);

    res.json({ date, sales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৮. মেমো ডিলিট করা (স্টক পুনরায় ফেরত যাবে)
app.delete('/api/sales/:id', (req, res) => {
  const { id } = req.params;
  try {
    const items = db.prepare('SELECT product_id, quantity FROM sale_items WHERE sale_id = ?').all(id);
    const updateStock = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?');
    
    for (const item of items) {
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);
    db.prepare('DELETE FROM sales WHERE id = ?').run(id);

    res.json({ success: true, message: 'Memo deleted and stock restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৯. মাসিক রিপোর্ট ও লাভ হিসাব API
app.get('/api/reports/monthly', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  try {
    const summary = db.prepare(`
      SELECT 
        COUNT(id) AS total_invoices,
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(due_amount), 0) AS total_due,
        COALESCE(SUM(total_cost), 0) AS total_cost,
        COALESCE(SUM(total_amount - total_cost), 0) AS total_profit
      FROM sales 
      WHERE sale_date LIKE ?
    `).get(`${month}%`);

    const salesList = db.prepare(`
      SELECT id, sale_date, sale_time, customer_name, total_amount, paid_amount, due_amount, (total_amount - total_cost) AS profit
      FROM sales 
      WHERE sale_date LIKE ?
      ORDER BY id DESC
    `).all(`${month}%`);

    res.json({ month, summary, sales: salesList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ১০. প্রোডাক্ট অনুযায়ী মোট লাভ হিসাব API
app.get('/api/reports/product-profit', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        p.name AS product_name,
        p.category,
        SUM(si.quantity) AS total_sold_qty,
        SUM(si.quantity * si.unit_price) AS total_sales_amount,
        SUM(si.quantity * COALESCE(p.buy_price, 0)) AS total_cost_amount,
        SUM(si.quantity * (si.unit_price - COALESCE(p.buy_price, 0))) AS total_product_profit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY p.id
      ORDER BY total_product_profit DESC
    `).all();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// সার্ভার চালু
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});