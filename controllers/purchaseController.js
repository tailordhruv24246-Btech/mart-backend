const db = require('../config/db');
const { sendSuccess, sendError, generateOrderNumber } = require('../utils/response');
const { emitAdminNotification } = require('../realtime/socket');

// POST /api/purchases/suppliers
const addSupplier = async (req, res, next) => {
  try {
    const { name, email, phone, address, city, state, pincode, gst_number, bank_name, account_number, ifsc_code } = req.body;
    if (!name) return sendError(res, 'Supplier name is required.', 400);

    const [result] = await db.query(
      `INSERT INTO suppliers (name, email, phone, address, city, state, pincode, gst_number, bank_name, account_number, ifsc_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email||null, phone||null, address||null, city||null, state||null, pincode||null, gst_number||null, bank_name||null, account_number||null, ifsc_code||null]
    );
    const [supplier] = await db.query('SELECT * FROM suppliers WHERE id = ?', [result.insertId]);
    return sendSuccess(res, supplier[0], 'Supplier added', 201);
  } catch (error) {
    next(error);
  }
};

// GET /api/purchases/suppliers
const getSuppliers = async (req, res, next) => {
  try {
    const [suppliers] = await db.query('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name');
    return sendSuccess(res, suppliers, 'Suppliers fetched');
  } catch (error) {
    next(error);
  }
};

// PUT /api/purchases/suppliers/:id
const updateSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, city, state, pincode, gst_number, bank_name, account_number, ifsc_code, is_active } = req.body;

    const [existing] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Supplier not found.', 404);

    const supplier = existing[0];
    await db.query(
      `UPDATE suppliers
       SET name = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, pincode = ?, gst_number = ?, bank_name = ?, account_number = ?, ifsc_code = ?, is_active = ?
       WHERE id = ?`,
      [
        name || supplier.name,
        email ?? supplier.email,
        phone ?? supplier.phone,
        address ?? supplier.address,
        city ?? supplier.city,
        state ?? supplier.state,
        pincode ?? supplier.pincode,
        gst_number ?? supplier.gst_number,
        bank_name ?? supplier.bank_name,
        account_number ?? supplier.account_number,
        ifsc_code ?? supplier.ifsc_code,
        is_active ?? supplier.is_active,
        id,
      ]
    );

    const [updated] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    return sendSuccess(res, updated[0], 'Supplier updated');
  } catch (error) {
    next(error);
  }
};

// DELETE /api/purchases/suppliers/:id
const deleteSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM suppliers WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Supplier not found.', 404);

    await db.query('UPDATE suppliers SET is_active = 0 WHERE id = ?', [id]);
    return sendSuccess(res, {}, 'Supplier deleted');
  } catch (error) {
    next(error);
  }
};

// POST /api/purchases/invoices
const addSupplierInvoice = async (req, res, next) => {
  try {
    const { invoice_number, supplier_id, invoice_date, due_date, subtotal, tax_amount, discount_amount, total_amount, notes } = req.body;

    if (!invoice_number || !supplier_id || !invoice_date) {
      return sendError(res, 'invoice_number, supplier_id and invoice_date are required.', 400);
    }

    const [result] = await db.query(
      `INSERT INTO supplier_invoices (invoice_number, supplier_id, invoice_date, due_date, subtotal, tax_amount, discount_amount, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_number, supplier_id, invoice_date, due_date||null, subtotal||0, tax_amount||0, discount_amount||0, total_amount||0, notes||null, req.user.id]
    );

    const [invoice] = await db.query('SELECT * FROM supplier_invoices WHERE id = ?', [result.insertId]);
    return sendSuccess(res, invoice[0], 'Invoice created', 201);
  } catch (error) {
    next(error);
  }
};

// POST /api/purchases/entry
const addPurchaseEntry = async (req, res, next) => {
  try {
    const { invoice_id, items } = req.body;
    // items: [{ product_id, quantity, purchase_price, selling_price, mrp, tax_rate, expiry_date, batch_number }]

    if (!invoice_id || !items || items.length === 0) {
      return sendError(res, 'invoice_id and items are required.', 400);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let totalAmount = 0;

      for (const item of items) {
        const taxAmt = ((item.purchase_price * item.quantity) * (item.tax_rate || 0)) / 100;
        const itemTotal = item.purchase_price * item.quantity + taxAmt;
        totalAmount += itemTotal;

        // Create batch
        const [batchResult] = await conn.query(
          `INSERT INTO product_batches (product_id, batch_number, purchase_price, selling_price, mrp, quantity_purchased, quantity_remaining, expiry_date, supplier_id, purchase_invoice_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, supplier_id, id FROM supplier_invoices WHERE id = ?`,
          [item.product_id, item.batch_number||null, item.purchase_price, item.selling_price, item.mrp||null,
           item.quantity, item.quantity, item.expiry_date||null, invoice_id]
        );

        await conn.query(
          `INSERT INTO purchase_details (invoice_id, product_id, batch_id, quantity, purchase_price, selling_price, mrp, tax_rate, tax_amount, total_amount, expiry_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [invoice_id, item.product_id, batchResult.insertId, item.quantity, item.purchase_price,
           item.selling_price, item.mrp||null, item.tax_rate||0, taxAmt, itemTotal, item.expiry_date||null]
        );
      }

      await conn.query('UPDATE supplier_invoices SET total_amount = ? WHERE id = ?', [totalAmount, invoice_id]);
      await conn.commit();

      emitAdminNotification({
        type: 'purchase:entry',
        title: 'Purchase Stock Added',
        message: `${items.length} purchase item(s) posted to invoice #${invoice_id}.`,
        meta: {
          invoiceId: Number(invoice_id),
          itemsCount: Array.isArray(items) ? items.length : 0,
          totalAmount: Number(totalAmount || 0),
        },
      });

      return sendSuccess(res, { invoice_id, items_count: items.length }, 'Purchase entry added');
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

// GET /api/purchases/invoices
const getInvoices = async (req, res, next) => {
  try {
    const [invoices] = await db.query(
      `SELECT si.*, s.name as supplier_name FROM supplier_invoices si
       LEFT JOIN suppliers s ON s.id = si.supplier_id
       ORDER BY si.created_at DESC LIMIT 100`
    );
    return sendSuccess(res, invoices, 'Invoices fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/purchases/invoices/list
const getInvoicesList = async (req, res, next) => {
  try {
    const { supplier_id, product_id, q, from_date, to_date, payment_status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = '1=1';
    const params = [];

    if (supplier_id) {
      whereClause += ' AND si.supplier_id = ?';
      params.push(Number(supplier_id));
    }
    if (payment_status) {
      whereClause += ' AND si.payment_status = ?';
      params.push(payment_status);
    }
    if (from_date) {
      whereClause += ' AND si.invoice_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      whereClause += ' AND si.invoice_date <= ?';
      params.push(to_date);
    }
    if (q) {
      whereClause += ' AND (si.invoice_number LIKE ? OR s.name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (product_id) {
      whereClause += ' AND EXISTS (SELECT 1 FROM purchase_details pdx WHERE pdx.invoice_id = si.id AND pdx.product_id = ?)';
      params.push(Number(product_id));
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s.id = si.supplier_id
       WHERE ${whereClause}`,
      params
    );

    const [rows] = await db.query(
      `SELECT si.id, si.invoice_number, si.invoice_date, si.payment_status, si.total_amount, si.created_at,
              s.id as supplier_id, s.name as supplier_name,
              COUNT(pd.id) as items_count,
              GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') as product_names
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s.id = si.supplier_id
       LEFT JOIN purchase_details pd ON pd.invoice_id = si.id
       LEFT JOIN products p ON p.id = pd.product_id
       WHERE ${whereClause}
       GROUP BY si.id
       ORDER BY si.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return sendSuccess(res, {
      purchases: rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    }, 'Purchase list fetched');
  } catch (error) {
    next(error);
  }
};

module.exports = { addSupplier, getSuppliers, updateSupplier, deleteSupplier, addSupplierInvoice, addPurchaseEntry, getInvoices, getInvoicesList };
