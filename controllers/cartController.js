const crypto = require('crypto');
const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

let cartTableReady = false;

const ensureCartTable = async () => {
  if (cartTableReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      selected_attributes JSON DEFAULT NULL,
      selected_key VARCHAR(64) NOT NULL DEFAULT 'default',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE KEY uk_cart_user_product_variant (user_id, product_id, selected_key),
      INDEX idx_cart_user (user_id),
      INDEX idx_cart_product (product_id)
    ) ENGINE=InnoDB`
  );

  cartTableReady = true;
};

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeSelectedAttributes = (raw) => {
  if (!raw) return null;

  const parsed = typeof raw === 'string' ? safeJsonParse(raw, null) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const normalized = Object.keys(parsed)
    .sort()
    .reduce((acc, key) => {
      const cleanKey = String(key || '').trim();
      const value = parsed[key];
      if (!cleanKey || typeof value === 'undefined' || value === null || value === '') return acc;
      acc[cleanKey] = value;
      return acc;
    }, {});

  return Object.keys(normalized).length ? normalized : null;
};

const getSelectedKey = (selectedAttributes) => {
  if (!selectedAttributes) return 'default';
  const source = JSON.stringify(selectedAttributes);
  return crypto.createHash('md5').update(source).digest('hex');
};

const getLatestPriceForProduct = async (productId) => {
  const [batches] = await db.query(
    `SELECT selling_price, mrp, quantity_remaining
     FROM product_batches
     WHERE product_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [productId]
  );

  if (!batches.length) {
    return { sellingPrice: 0, mrp: 0 };
  }

  return {
    sellingPrice: Number(batches[0].selling_price || 0),
    mrp: Number(batches[0].mrp || batches[0].selling_price || 0),
  };
};

const getAvailableStock = async (productId) => {
  const [rows] = await db.query(
    'SELECT COALESCE(SUM(quantity_remaining), 0) AS stock FROM product_batches WHERE product_id = ?',
    [productId]
  );
  return Number(rows[0]?.stock || 0);
};

const getCartPayload = async (userId) => {
  await ensureCartTable();

  const [rows] = await db.query(
    `SELECT
      ci.id AS cart_item_id,
      ci.product_id,
      ci.quantity,
      ci.unit_price,
      ci.selected_attributes,
      p.name,
      p.images,
      p.tax_rate,
      p.unit,
      p.is_active,
      COALESCE(pb.selling_price, ci.unit_price, 0) AS current_price,
      COALESCE(pb.mrp, pb.selling_price, ci.unit_price, 0) AS mrp
     FROM cart_items ci
     INNER JOIN products p ON p.id = ci.product_id
     LEFT JOIN product_batches pb ON pb.id = (
       SELECT id FROM product_batches WHERE product_id = ci.product_id ORDER BY created_at DESC LIMIT 1
     )
     WHERE ci.user_id = ?
     ORDER BY ci.updated_at DESC`,
    [userId]
  );

  const items = rows.map((row) => ({
    cart_item_id: row.cart_item_id,
    id: row.product_id,
    product_id: row.product_id,
    name: row.name,
    quantity: Number(row.quantity || 1),
    unit_price: Number(row.unit_price || 0),
    current_price: Number(row.current_price || 0),
    mrp: Number(row.mrp || 0),
    tax_rate: Number(row.tax_rate || 0),
    unit: row.unit || 'pcs',
    is_active: Number(row.is_active || 0) === 1,
    images: safeJsonParse(row.images, []),
    selected_attributes: safeJsonParse(row.selected_attributes, null),
  }));

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.current_price * item.quantity, 0);

  return {
    items,
    summary: {
      total_items: totalItems,
      subtotal,
    },
  };
};

const getCart = async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'subadmin'].includes(String(req.user?.role || '').toLowerCase());
    const requestedUserId = Number(req.query?.user_id || 0);
    const targetUserId = isAdmin && requestedUserId > 0 ? requestedUserId : req.user.id;

    const payload = await getCartPayload(targetUserId);
    return sendSuccess(res, payload, 'Cart fetched');
  } catch (error) {
    return next(error);
  }
};

const addCartItem = async (req, res, next) => {
  try {
    await ensureCartTable();

    const productId = Number(req.body?.product_id);
    const quantity = Number(req.body?.quantity || 1);
    const selectedAttributes = normalizeSelectedAttributes(req.body?.selected_attributes);

    if (!productId || quantity < 1) {
      return sendError(res, 'product_id and valid quantity are required.', 400);
    }

    const [products] = await db.query('SELECT id, is_active FROM products WHERE id = ?', [productId]);
    if (!products.length || Number(products[0].is_active || 0) !== 1) {
      return sendError(res, 'Product not available.', 404);
    }

    const availableStock = await getAvailableStock(productId);
    if (availableStock < quantity) {
      return sendError(res, `Only ${availableStock} items available in stock.`, 400);
    }

    const priceMeta = await getLatestPriceForProduct(productId);
    const selectedKey = getSelectedKey(selectedAttributes);

    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity, unit_price, selected_attributes, selected_key)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         quantity = quantity + VALUES(quantity),
         unit_price = VALUES(unit_price),
         selected_attributes = VALUES(selected_attributes)`,
      [
        req.user.id,
        productId,
        quantity,
        priceMeta.sellingPrice,
        selectedAttributes ? JSON.stringify(selectedAttributes) : null,
        selectedKey,
      ]
    );

    const payload = await getCartPayload(req.user.id);
    return sendSuccess(res, payload, 'Item added to cart');
  } catch (error) {
    return next(error);
  }
};

const updateCartItem = async (req, res, next) => {
  try {
    await ensureCartTable();

    const cartItemId = Number(req.params?.itemId);
    const quantity = Number(req.body?.quantity || 0);

    if (!cartItemId) return sendError(res, 'Invalid cart item id.', 400);

    const [existing] = await db.query(
      'SELECT id, product_id FROM cart_items WHERE id = ? AND user_id = ?',
      [cartItemId, req.user.id]
    );
    if (!existing.length) return sendError(res, 'Cart item not found.', 404);

    if (quantity < 1) {
      await db.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [cartItemId, req.user.id]);
      const payload = await getCartPayload(req.user.id);
      return sendSuccess(res, payload, 'Cart item removed');
    }

    const availableStock = await getAvailableStock(existing[0].product_id);
    if (availableStock < quantity) {
      return sendError(res, `Only ${availableStock} items available in stock.`, 400);
    }

    await db.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, cartItemId, req.user.id]);

    const payload = await getCartPayload(req.user.id);
    return sendSuccess(res, payload, 'Cart item updated');
  } catch (error) {
    return next(error);
  }
};

const removeCartItem = async (req, res, next) => {
  try {
    await ensureCartTable();
    const cartItemId = Number(req.params?.itemId);
    if (!cartItemId) return sendError(res, 'Invalid cart item id.', 400);

    await db.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [cartItemId, req.user.id]);
    const payload = await getCartPayload(req.user.id);
    return sendSuccess(res, payload, 'Cart item removed');
  } catch (error) {
    return next(error);
  }
};

const clearCart = async (req, res, next) => {
  try {
    await ensureCartTable();
    await db.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    return sendSuccess(res, { items: [], summary: { total_items: 0, subtotal: 0 } }, 'Cart cleared');
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
};
