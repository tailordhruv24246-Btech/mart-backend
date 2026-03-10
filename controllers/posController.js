const db = require('../config/db');
const { sendSuccess, sendError, generateOrderNumber } = require('../utils/response');
const { emitAdminNotification } = require('../realtime/socket');

// POST /api/pos/bill  — Create POS Bill with FIFO batch stock reduction
const createPosBill = async (req, res, next) => {
  try {
    const { customer_id, items, payment_method = 'cash', paid_amount, notes } = req.body;

    if (!items || items.length === 0) return sendError(res, 'Items are required.', 400);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let subtotal = 0;
      let taxAmount = 0;
      let totalProfit = 0;
      const saleItems = [];

      for (const item of items) {
        let qtyNeeded = item.quantity;
        let itemSubtotal = 0;
        let itemTax = 0;
        let itemProfit = 0;

        // FIFO: Get oldest batches first
        const [batches] = await conn.query(
          'SELECT * FROM product_batches WHERE product_id = ? AND quantity_remaining > 0 ORDER BY created_at ASC',
          [item.product_id]
        );

        const totalAvailable = batches.reduce((sum, b) => sum + b.quantity_remaining, 0);
        if (totalAvailable < qtyNeeded) {
          await conn.rollback();
          return sendError(res, `Insufficient stock for product ID ${item.product_id}. Available: ${totalAvailable}`, 400);
        }

        let lastBatchId = null;
        let lastUnitPrice = 0;
        let lastPurchasePrice = 0;

        for (const batch of batches) {
          if (qtyNeeded <= 0) break;
          const deduct = Math.min(qtyNeeded, batch.quantity_remaining);

          await conn.query(
            'UPDATE product_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?',
            [deduct, batch.id]
          );

          const lineSubtotal = batch.selling_price * deduct;
          const lineTax = (lineSubtotal * (item.tax_rate || 0)) / 100;
          const lineProfit = (batch.selling_price - batch.purchase_price) * deduct;

          itemSubtotal += lineSubtotal;
          itemTax += lineTax;
          itemProfit += lineProfit;
          qtyNeeded -= deduct;
          lastBatchId = batch.id;
          lastUnitPrice = batch.selling_price;
          lastPurchasePrice = batch.purchase_price;
        }

        subtotal += itemSubtotal;
        taxAmount += itemTax;
        totalProfit += itemProfit;

        const [product] = await conn.query('SELECT name FROM products WHERE id = ?', [item.product_id]);
        saleItems.push({
          product_id: item.product_id,
          batch_id: lastBatchId,
          product_name: product[0]?.name,
          quantity: item.quantity,
          purchase_price: lastPurchasePrice,
          unit_price: lastUnitPrice,
          tax_rate: item.tax_rate || 0,
          tax_amount: itemTax,
          total_amount: itemSubtotal + itemTax,
          profit_amount: itemProfit,
        });
      }

      const totalAmount = subtotal + taxAmount;
      const changeAmount = (paid_amount || totalAmount) - totalAmount;
      const saleNumber = generateOrderNumber('POS');

      const [saleResult] = await conn.query(
        `INSERT INTO sales (sale_number, customer_id, sale_type, salesman_id, subtotal, tax_amount, total_amount, paid_amount, change_amount, payment_method, notes)
         VALUES (?, ?, 'pos', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleNumber, customer_id||null, req.user.id, subtotal, taxAmount, totalAmount, paid_amount||totalAmount, changeAmount > 0 ? changeAmount : 0, payment_method, notes||null]
      );

      const saleId = saleResult.insertId;

      for (const si of saleItems) {
        await conn.query(
          `INSERT INTO sales_items (sale_id, product_id, batch_id, product_name, quantity, purchase_price, unit_price, tax_rate, tax_amount, total_amount, profit_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleId, si.product_id, si.batch_id, si.product_name, si.quantity, si.purchase_price, si.unit_price, si.tax_rate, si.tax_amount, si.total_amount, si.profit_amount]
        );
      }

      await conn.commit();

      // Return invoice data
      const invoiceData = {
        sale_number: saleNumber,
        sale_id: saleId,
        items: saleItems,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        paid_amount: paid_amount || totalAmount,
        change_amount: changeAmount > 0 ? changeAmount : 0,
        payment_method,
        sale_date: new Date().toISOString(),
      };

      emitAdminNotification({
        type: 'pos:sale',
        title: 'POS Sale Completed',
        message: `Sale #${saleNumber} completed for Rs ${Number(totalAmount || 0).toFixed(2)}.`,
        meta: {
          saleId,
          saleNumber,
          totalAmount: Number(totalAmount || 0),
          paymentMethod: payment_method,
        },
      });

      return sendSuccess(res, invoiceData, 'POS bill created', 201);
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

// GET /api/pos/invoice/:saleId
const getInvoiceData = async (req, res, next) => {
  try {
    const { saleId } = req.params;
    const [sales] = await db.query(
      `SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.name as salesman_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.salesman_id
       WHERE s.id = ?`,
      [saleId]
    );
    if (sales.length === 0) return sendError(res, 'Sale not found.', 404);

    const [items] = await db.query('SELECT * FROM sales_items WHERE sale_id = ?', [saleId]);
    return sendSuccess(res, { ...sales[0], items }, 'Invoice data fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/pos/sales
const getPosSales = async (req, res, next) => {
  try {
    const { date, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = "sale_type = 'pos'";
    const params = [];
    if (date) { where += ' AND DATE(sale_date) = ?'; params.push(date); }

    const [sales] = await db.query(
      `SELECT * FROM sales WHERE ${where} ORDER BY sale_date DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    return sendSuccess(res, sales, 'POS sales fetched');
  } catch (error) {
    next(error);
  }
};

module.exports = { createPosBill, getInvoiceData, getPosSales };
