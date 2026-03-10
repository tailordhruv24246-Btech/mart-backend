const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

let wishlistTableReady = false;

const ensureWishlistTable = async () => {
  if (wishlistTableReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS wishlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE KEY uk_wishlist_user_product (user_id, product_id),
      INDEX idx_wishlist_user (user_id)
    ) ENGINE=InnoDB`
  );

  wishlistTableReady = true;
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

const getWishlistPayload = async (userId) => {
  await ensureWishlistTable();

  const [rows] = await db.query(
    `SELECT
      w.id AS wishlist_item_id,
      w.product_id,
      p.name,
      p.images,
      p.tax_rate,
      p.unit,
      p.is_active,
      COALESCE(pb.selling_price, 0) AS current_price,
      COALESCE(pb.mrp, pb.selling_price, 0) AS mrp
     FROM wishlists w
     INNER JOIN products p ON p.id = w.product_id
     LEFT JOIN product_batches pb ON pb.id = (
       SELECT id FROM product_batches WHERE product_id = w.product_id ORDER BY created_at DESC LIMIT 1
     )
     WHERE w.user_id = ?
     ORDER BY w.created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    wishlist_item_id: row.wishlist_item_id,
    id: row.product_id,
    product_id: row.product_id,
    name: row.name,
    images: safeJsonParse(row.images, []),
    tax_rate: Number(row.tax_rate || 0),
    unit: row.unit || 'pcs',
    is_active: Number(row.is_active || 0) === 1,
    current_price: Number(row.current_price || 0),
    mrp: Number(row.mrp || 0),
  }));
};

const getWishlist = async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'subadmin'].includes(String(req.user?.role || '').toLowerCase());
    const requestedUserId = Number(req.query?.user_id || 0);
    const targetUserId = isAdmin && requestedUserId > 0 ? requestedUserId : req.user.id;

    const items = await getWishlistPayload(targetUserId);
    return sendSuccess(res, items, 'Wishlist fetched');
  } catch (error) {
    return next(error);
  }
};

const addWishlistItem = async (req, res, next) => {
  try {
    await ensureWishlistTable();

    const productId = Number(req.params?.productId || req.body?.product_id);
    if (!productId) return sendError(res, 'Valid product id is required.', 400);

    const [products] = await db.query('SELECT id, is_active FROM products WHERE id = ?', [productId]);
    if (!products.length || Number(products[0].is_active || 0) !== 1) {
      return sendError(res, 'Product not available.', 404);
    }

    await db.query(
      'INSERT INTO wishlists (user_id, product_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)',
      [req.user.id, productId]
    );

    const items = await getWishlistPayload(req.user.id);
    return sendSuccess(res, items, 'Added to wishlist');
  } catch (error) {
    return next(error);
  }
};

const removeWishlistItem = async (req, res, next) => {
  try {
    await ensureWishlistTable();

    const productId = Number(req.params?.productId || req.body?.product_id);
    if (!productId) return sendError(res, 'Valid product id is required.', 400);

    await db.query('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, productId]);

    const items = await getWishlistPayload(req.user.id);
    return sendSuccess(res, items, 'Removed from wishlist');
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
};
