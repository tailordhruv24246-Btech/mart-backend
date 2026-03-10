const db = require('../config/db');
const { sendSuccess, sendError, generateOrderNumber } = require('../utils/response');
const { emitAdminNotification } = require('../realtime/socket');

const CANCEL_WINDOW_MINUTES = Number(process.env.ORDER_CANCEL_WINDOW_MINUTES || 10);
const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing', 'packed'];
let cancellationAuditColumnsReady = false;

const addColumnIfMissing = async (sql) => {
  try {
    await db.query(sql);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
};

const ensureCancellationAuditColumns = async () => {
  if (cancellationAuditColumnsReady) return;

  await addColumnIfMissing(
    'ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL AFTER delivered_at'
  );
  await addColumnIfMissing(
    'ALTER TABLE orders ADD COLUMN cancelled_by_user_id INT DEFAULT NULL AFTER cancelled_at'
  );
  await addColumnIfMissing(
    'ALTER TABLE orders ADD COLUMN cancelled_by_role VARCHAR(30) DEFAULT NULL AFTER cancelled_by_user_id'
  );
  await addColumnIfMissing(
    'ALTER TABLE orders ADD COLUMN cancel_elapsed_minutes INT DEFAULT NULL AFTER cancelled_by_role'
  );

  cancellationAuditColumnsReady = true;
};

const canCancelByTime = (createdAt) => {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const ageMinutes = (Date.now() - created.getTime()) / (1000 * 60);
  return ageMinutes <= CANCEL_WINDOW_MINUTES;
};

// POST /api/orders
const placeOrder = async (req, res, next) => {
  try {
    const { customer_id, items, shipping_address, billing_address, payment_method = 'cod', notes, shipping_charge = 0 } = req.body;

    if (!items || items.length === 0) return sendError(res, 'Order items are required.', 400);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let subtotal = 0;
      let taxAmount = 0;

      // Validate items and get prices
      const processedItems = [];
      for (const item of items) {
        const [batches] = await conn.query(
          'SELECT * FROM product_batches WHERE product_id = ? AND quantity_remaining >= ? ORDER BY created_at ASC LIMIT 1',
          [item.product_id, item.quantity]
        );
        if (batches.length === 0) {
          await conn.rollback();
          return sendError(res, `Insufficient stock for product ID ${item.product_id}`, 400);
        }

        const batch = batches[0];
        const itemSubtotal = batch.selling_price * item.quantity;
        const itemTax = (itemSubtotal * (item.tax_rate || 0)) / 100;
        subtotal += itemSubtotal;
        taxAmount += itemTax;

        processedItems.push({ ...item, batch_id: batch.id, unit_price: batch.selling_price, tax_amount: itemTax, total: itemSubtotal + itemTax });
      }

      const totalAmount = subtotal + taxAmount + parseFloat(shipping_charge);
      const orderNumber = generateOrderNumber('ORD');

      const [orderResult] = await conn.query(
        `INSERT INTO orders (order_number, customer_id, user_id, order_type, payment_method, shipping_address, billing_address, subtotal, tax_amount, shipping_charge, total_amount, notes)
         VALUES (?, ?, ?, 'online', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNumber, customer_id||null, req.user.id, payment_method, shipping_address||null, billing_address||null, subtotal, taxAmount, shipping_charge, totalAmount, notes||null]
      );

      const orderId = orderResult.insertId;

      for (const item of processedItems) {
        const [product] = await conn.query('SELECT name FROM products WHERE id = ?', [item.product_id]);

        await conn.query(
          `INSERT INTO order_items (order_id, product_id, batch_id, product_name, quantity, unit_price, tax_rate, tax_amount, total_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.batch_id, product[0]?.name, item.quantity, item.unit_price, item.tax_rate||0, item.tax_amount, item.total]
        );

        // Reserve stock
        await conn.query(
          'UPDATE product_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?',
          [item.quantity, item.batch_id]
        );
      }

      await conn.commit();
      const [order] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);

      emitAdminNotification({
        type: 'order:new',
        priority: 'high',
        title: 'New Online Order',
        message: `Order #${orderNumber} placed for Rs ${Number(totalAmount || 0).toFixed(2)}.`,
        meta: { orderId, orderNumber, totalAmount: Number(totalAmount || 0) },
      });

      return sendSuccess(res, order[0], 'Order placed successfully', 201);
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

// GET /api/orders/user
const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [orders] = await db.query(
      `SELECT o.*, COUNT(oi.id) as item_count FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ? GROUP BY o.id ORDER BY o.created_at DESC`,
      [userId]
    );
    return sendSuccess(res, orders, 'Orders fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/orders/:id
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) return sendError(res, 'Order not found.', 404);

    const [items] = await db.query(
      `SELECT oi.*, p.images FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [id]
    );
    return sendSuccess(res, { ...orders[0], items }, 'Order fetched');
  } catch (error) {
    next(error);
  }
};

// PUT /api/orders/:id/status
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;

    const [existing] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Order not found.', 404);

    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (payment_status) { updates.push('payment_status = ?'); params.push(payment_status); }
    if (status === 'delivered') { updates.push('delivered_at = NOW()'); }

    if (updates.length === 0) return sendError(res, 'No fields to update.', 400);
    params.push(id);

    await db.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);
    const [updated] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);

    emitAdminNotification({
      type: 'order:status',
      title: 'Order Status Updated',
      message: `Order #${updated[0]?.order_number || id} is now ${status || updated[0]?.status}.`,
      meta: {
        orderId: Number(id),
        orderNumber: updated[0]?.order_number || null,
        status: status || updated[0]?.status || null,
        paymentStatus: payment_status || updated[0]?.payment_status || null,
      },
    });

    return sendSuccess(res, updated[0], 'Order status updated');
  } catch (error) {
    next(error);
  }
};

// PUT /api/orders/:id/assign-delivery
const assignDeliveryBoy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { delivery_boy_id } = req.body;

    const [existingOrder] = await db.query('SELECT id, status FROM orders WHERE id = ?', [id]);
    if (existingOrder.length === 0) return sendError(res, 'Order not found.', 404);

    const [deliveryUser] = await db.query('SELECT id FROM users WHERE id = ? AND role = ?', [delivery_boy_id, 'delivery']);
    if (deliveryUser.length === 0) return sendError(res, 'Delivery user not found.', 404);

    const currentStatus = String(existingOrder[0].status || '').toLowerCase();
    const nextStatus = ['pending', 'processing'].includes(currentStatus) ? 'packed' : currentStatus;

    await db.query('UPDATE orders SET delivery_boy_id = ?, status = ? WHERE id = ?', [delivery_boy_id, nextStatus, id]);

    emitAdminNotification({
      type: 'order:assigned',
      title: 'Delivery Assigned',
      message: `Order #${id} assigned to delivery user ${delivery_boy_id}.`,
      meta: {
        orderId: Number(id),
        deliveryBoyId: Number(delivery_boy_id),
        status: nextStatus,
      },
    });

    return sendSuccess(res, {}, 'Delivery boy assigned');
  } catch (error) {
    next(error);
  }
};

// POST /api/orders/:id/cancel
const cancelOrder = async (req, res, next) => {
  try {
    await ensureCancellationAuditColumns();

    const { id } = req.params;
    const reason = String(req.body?.reason || '').trim();
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'subadmin'].includes(role);

    const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (!orders.length) return sendError(res, 'Order not found.', 404);

    const order = orders[0];
    const status = String(order.status || '').toLowerCase();
    const createdAtTs = new Date(order.created_at).getTime();
    const cancelElapsedMinutes = Number.isNaN(createdAtTs)
      ? null
      : Math.max(0, Math.ceil((Date.now() - createdAtTs) / (1000 * 60)));

    if (!isAdmin && Number(order.user_id) !== Number(req.user.id)) {
      return sendError(res, 'You are not allowed to cancel this order.', 403);
    }

    if (status === 'cancelled') {
      return sendError(res, 'Order is already cancelled.', 400);
    }

    if (!CANCELLABLE_STATUSES.includes(status)) {
      return sendError(res, `Order cannot be cancelled when status is '${status}'.`, 400);
    }

    if (!canCancelByTime(order.created_at)) {
      return sendError(res, `Order can only be cancelled within ${CANCEL_WINDOW_MINUTES} minutes.`, 400);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [items] = await conn.query(
        'SELECT id, product_id, batch_id, quantity FROM order_items WHERE order_id = ?',
        [id]
      );

      for (const item of items) {
        await conn.query(
          'UPDATE product_batches SET quantity_remaining = quantity_remaining + ? WHERE id = ? AND product_id = ?',
          [Number(item.quantity || 0), item.batch_id, item.product_id]
        );
      }

      const actor = req.user?.name || req.user?.email || `user-${req.user?.id}`;
      const noteParts = [
        order.notes ? String(order.notes).trim() : '',
        `[Cancelled at ${new Date().toISOString()} by ${actor}${reason ? ` | reason: ${reason}` : ''}]`,
      ].filter(Boolean);

      await conn.query(
        `UPDATE orders
         SET status = ?, notes = ?, cancelled_at = NOW(), cancelled_by_user_id = ?, cancelled_by_role = ?, cancel_elapsed_minutes = ?
         WHERE id = ?`,
        ['cancelled', noteParts.join('\n'), req.user?.id || null, role || null, cancelElapsedMinutes, id]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [updated] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);

    emitAdminNotification({
      type: 'order:cancelled',
      priority: 'high',
      title: 'Order Cancelled',
      message: `Order #${updated[0]?.order_number || id} cancelled in ${cancelElapsedMinutes || 0} min.`,
      meta: {
        orderId: Number(id),
        orderNumber: updated[0]?.order_number || null,
        cancelledByRole: role || null,
        cancelElapsedMinutes,
      },
    });

    return sendSuccess(res, updated[0], 'Order cancelled successfully');
  } catch (error) {
    return next(error);
  }
};

// GET /api/orders (admin - all orders)
const getAllOrders = async (req, res, next) => {
  try {
    await ensureCancellationAuditColumns();

    const { status, page = 1, limit = 20, delivery_boy_id, assigned_to_me } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = '1=1';
    const params = [];
    if (status) { where += ' AND o.status = ?'; params.push(status); }

    const isDeliveryUser = String(req.user?.role || '').toLowerCase() === 'delivery';
    if (isDeliveryUser || String(assigned_to_me || '').toLowerCase() === 'true' || String(assigned_to_me) === '1') {
      where += ' AND o.delivery_boy_id = ?';
      params.push(req.user.id);
    } else if (delivery_boy_id) {
      where += ' AND o.delivery_boy_id = ?';
      params.push(Number(delivery_boy_id));
    }

    const [orders] = await db.query(
      `SELECT o.*, c.name as customer_name, u.name as delivery_boy_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.delivery_boy_id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    return sendSuccess(res, orders, 'All orders fetched');
  } catch (error) {
    next(error);
  }
};

module.exports = { placeOrder, getUserOrders, getOrderById, updateOrderStatus, assignDeliveryBoy, cancelOrder, getAllOrders };
