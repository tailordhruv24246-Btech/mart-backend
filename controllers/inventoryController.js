const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const { emitAdminNotification } = require('../realtime/socket');

let inventoryAdjustmentsTableReady = false;

const ensureInventoryAdjustmentsTable = async () => {
  if (inventoryAdjustmentsTableReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      batch_id INT DEFAULT NULL,
      adjustment_type ENUM('purchase_return','damage','expired','manual_in','manual_out') NOT NULL,
      quantity INT NOT NULL,
      unit_cost DECIMAL(15,2) DEFAULT 0.00,
      total_loss DECIMAL(15,2) DEFAULT 0.00,
      reason TEXT DEFAULT NULL,
      reference_no VARCHAR(120) DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_inv_adj_product (product_id),
      INDEX idx_inv_adj_type (adjustment_type),
      INDEX idx_inv_adj_created (created_at)
    ) ENGINE=InnoDB`
  );

  inventoryAdjustmentsTableReady = true;
};

const getCurrentStock = async (productId) => {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(quantity_remaining), 0) as stock
     FROM product_batches
     WHERE product_id = ?`,
    [productId]
  );
  return Number(row?.stock || 0);
};

const createInventoryAdjustment = async (req, res, next) => {
  try {
    await ensureInventoryAdjustmentsTable();

    const {
      product_id,
      adjustment_type,
      quantity,
      reason,
      reference_no,
      purchase_price,
      selling_price,
      mrp,
      batch_number,
    } = req.body;

    const productId = Number(product_id);
    const qty = Number(quantity);

    if (!productId || !adjustment_type || !qty || qty <= 0) {
      return sendError(res, 'product_id, adjustment_type and quantity (>0) are required.', 400);
    }

    const allowedTypes = ['purchase_return', 'damage', 'expired', 'manual_in', 'manual_out'];
    if (!allowedTypes.includes(adjustment_type)) {
      return sendError(res, 'Invalid adjustment_type.', 400);
    }

    const [productRows] = await db.query('SELECT id, name FROM products WHERE id = ?', [productId]);
    if (!productRows.length) return sendError(res, 'Product not found.', 404);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let totalLoss = 0;
      let firstBatchId = null;

      if (['damage', 'expired', 'purchase_return', 'manual_out'].includes(adjustment_type)) {
        const [batches] = await conn.query(
          `SELECT id, quantity_remaining, purchase_price
           FROM product_batches
           WHERE product_id = ? AND quantity_remaining > 0
           ORDER BY created_at ASC`,
          [productId]
        );

        const available = batches.reduce((sum, batch) => sum + Number(batch.quantity_remaining || 0), 0);
        if (available < qty) {
          await conn.rollback();
          return sendError(res, `Insufficient stock. Available: ${available}`, 400);
        }

        let qtyNeeded = qty;
        for (const batch of batches) {
          if (qtyNeeded <= 0) break;
          const deduct = Math.min(qtyNeeded, Number(batch.quantity_remaining || 0));

          await conn.query(
            'UPDATE product_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?',
            [deduct, batch.id]
          );

          if (!firstBatchId) firstBatchId = batch.id;
          if (adjustment_type === 'damage' || adjustment_type === 'expired') {
            totalLoss += deduct * Number(batch.purchase_price || 0);
          }

          qtyNeeded -= deduct;
        }
      }

      if (adjustment_type === 'manual_in') {
        const safePurchase = Number(purchase_price || 0);
        const safeSelling = Number(selling_price || safePurchase || 0);
        const safeMrp = Number(mrp || safeSelling || 0);

        const [result] = await conn.query(
          `INSERT INTO product_batches
           (product_id, batch_number, purchase_price, selling_price, mrp, quantity_purchased, quantity_remaining)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            productId,
            batch_number || `ADJ-${Date.now()}`,
            safePurchase,
            safeSelling,
            safeMrp,
            qty,
            qty,
          ]
        );

        firstBatchId = result.insertId;
      }

      await conn.query(
        `INSERT INTO inventory_adjustments
          (product_id, batch_id, adjustment_type, quantity, unit_cost, total_loss, reason, reference_no, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          firstBatchId,
          adjustment_type,
          qty,
          qty > 0 ? totalLoss / qty : 0,
          totalLoss,
          reason || null,
          reference_no || null,
          req.user?.id || null,
        ]
      );

      await conn.commit();

      const currentStock = await getCurrentStock(productId);

      emitAdminNotification({
        type: 'inventory:adjusted',
        title: 'Inventory Updated',
        message: `${productRows[0].name} adjusted (${adjustment_type}) by ${qty}. Current stock: ${currentStock}.`,
        priority: ['damage', 'expired', 'purchase_return', 'manual_out'].includes(adjustment_type) ? 'high' : 'normal',
        meta: {
          productId,
          productName: productRows[0].name,
          adjustmentType: adjustment_type,
          quantity: qty,
          currentStock,
        },
      });

      return sendSuccess(
        res,
        {
          product_id: productId,
          product_name: productRows[0].name,
          adjustment_type,
          quantity: qty,
          total_loss: Number(totalLoss.toFixed(2)),
          current_stock: currentStock,
        },
        'Inventory adjustment saved successfully',
        201
      );
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

const getInventoryAdjustments = async (req, res, next) => {
  try {
    await ensureInventoryAdjustmentsTable();

    const {
      adjustment_type,
      product_id,
      from_date,
      to_date,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = '1=1';
    const params = [];

    if (adjustment_type) {
      whereClause += ' AND ia.adjustment_type = ?';
      params.push(adjustment_type);
    }

    if (product_id) {
      whereClause += ' AND ia.product_id = ?';
      params.push(Number(product_id));
    }

    if (from_date) {
      whereClause += ' AND DATE(ia.created_at) >= ?';
      params.push(from_date);
    }

    if (to_date) {
      whereClause += ' AND DATE(ia.created_at) <= ?';
      params.push(to_date);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM inventory_adjustments ia WHERE ${whereClause}`,
      params
    );

    const [rows] = await db.query(
      `SELECT ia.*, p.name as product_name, p.sku, u.name as created_by_name
       FROM inventory_adjustments ia
       LEFT JOIN products p ON p.id = ia.product_id
       LEFT JOIN users u ON u.id = ia.created_by
       WHERE ${whereClause}
       ORDER BY ia.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [[summary]] = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN ia.adjustment_type IN ('damage','expired') THEN ia.total_loss ELSE 0 END), 0) as total_loss,
         COALESCE(SUM(CASE WHEN ia.adjustment_type IN ('damage','expired','purchase_return','manual_out') THEN ia.quantity ELSE 0 END), 0) as total_out_qty,
         COALESCE(SUM(CASE WHEN ia.adjustment_type = 'manual_in' THEN ia.quantity ELSE 0 END), 0) as total_in_qty
       FROM inventory_adjustments ia
       WHERE ${whereClause}`,
      params
    );

    return sendSuccess(res, {
      adjustments: rows,
      summary,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    }, 'Inventory adjustments fetched');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInventoryAdjustment,
  getInventoryAdjustments,
};
