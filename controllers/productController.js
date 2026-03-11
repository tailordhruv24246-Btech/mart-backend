const db = require('../config/db.js');
const { sendSuccess, sendError } = require('../utils/response');

const slugify = (text) => String(text || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

let productAttributesTableReady = false;

const ensureProductAttributesTable = async () => {
  if (productAttributesTableReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS product_attributes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      attribute_key VARCHAR(120) NOT NULL,
      attribute_value TEXT DEFAULT NULL,
      value_type ENUM('text','number','boolean','date','json') DEFAULT 'text',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE KEY uk_product_attribute (product_id, attribute_key),
      INDEX idx_attribute_key (attribute_key)
    ) ENGINE=InnoDB`
  );

  productAttributesTableReady = true;
};

const detectAttributeType = (value) => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return 'date';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'false') return 'boolean';
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return 'number';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'date';
    return 'text';
  }
  if (typeof value === 'object' && value !== null) return 'json';
  return 'text';
};

const parseAttributesInput = (raw) => {
  if (typeof raw === 'undefined' || raw === null || raw === '') return [];

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        const key = String(item?.key || item?.name || '').trim();
        const value = item?.value;
        if (!key || typeof value === 'undefined' || value === null || value === '') return null;

        const valueType = detectAttributeType(value);
        const safeValue = valueType === 'json' ? JSON.stringify(value) : String(value);
        return { key, value: safeValue, valueType };
      })
      .filter(Boolean);
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return Object.entries(parsed)
      .map(([attributeKey, attributeValue]) => {
        const key = String(attributeKey || '').trim();
        if (!key || typeof attributeValue === 'undefined' || attributeValue === null || attributeValue === '') return null;

        const valueType = detectAttributeType(attributeValue);
        const safeValue = valueType === 'json' ? JSON.stringify(attributeValue) : String(attributeValue);
        return { key, value: safeValue, valueType };
      })
      .filter(Boolean);
  }

  return [];
};

const parseStoredAttributeValue = (attribute) => {
  if (attribute.value_type === 'number') {
    const parsed = Number(attribute.attribute_value);
    return Number.isFinite(parsed) ? parsed : attribute.attribute_value;
  }
  if (attribute.value_type === 'boolean') {
    return String(attribute.attribute_value).toLowerCase() === 'true';
  }
  if (attribute.value_type === 'json') {
    try {
      return JSON.parse(attribute.attribute_value);
    } catch {
      return attribute.attribute_value;
    }
  }
  return attribute.attribute_value;
};

const upsertProductAttributes = async (productId, attributes) => {
  await ensureProductAttributesTable();

  await db.query('DELETE FROM product_attributes WHERE product_id = ?', [productId]);
  if (!attributes.length) return;

  const placeholders = attributes.map(() => '(?, ?, ?, ?)').join(', ');
  const values = attributes.flatMap((attribute) => [
    productId,
    attribute.key,
    attribute.value,
    attribute.valueType,
  ]);

  await db.query(
    `INSERT INTO product_attributes (product_id, attribute_key, attribute_value, value_type)
     VALUES ${placeholders}`,
    values
  );
};

const attachAttributesToProducts = async (products) => {
  await ensureProductAttributesTable();
  if (!products.length) return products;

  const productIds = products.map((product) => product.id);
  const placeholders = productIds.map(() => '?').join(', ');
  const [attributeRows] = await db.query(
    `SELECT product_id, attribute_key, attribute_value, value_type
     FROM product_attributes
     WHERE product_id IN (${placeholders})
     ORDER BY attribute_key ASC`,
    productIds
  );

  const attributeMap = new Map();
  for (const row of attributeRows) {
    if (!attributeMap.has(row.product_id)) {
      attributeMap.set(row.product_id, []);
    }
    attributeMap.get(row.product_id).push({
      key: row.attribute_key,
      value: parseStoredAttributeValue(row),
      valueType: row.value_type,
    });
  }

  return products.map((product) => {
    const attributes = attributeMap.get(product.id) || [];
    const attributeObject = attributes.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    return {
      ...product,
      attributes,
      attributes_map: attributeObject,
    };
  });
};

const parseImagesArray = (imagesValue) => {
  if (!imagesValue) return [];
  if (Array.isArray(imagesValue)) return imagesValue.filter(Boolean).slice(0, 5);
  if (typeof imagesValue === 'string') {
    try {
      const parsed = JSON.parse(imagesValue);
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : imagesValue ? [imagesValue] : [];
    } catch {
      return imagesValue ? [imagesValue] : [];
    }
  }
  return [];
};

const getIncomingImages = (req, fallback = []) => {
  const uploadedImages = Array.isArray(req.files)
    ? req.files.map((file) => `/uploads/products/${file.filename}`)
    : [];
  const hasImagePayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'image_urls')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'images');
  const urlImages = parseImagesArray(req.body?.image_urls || req.body?.images);
  const merged = [...uploadedImages, ...urlImages].filter(Boolean).slice(0, 5);
  if (merged.length) return merged;
  if (hasImagePayload) return [];
  return fallback;
};

const normalizeText = (value) => String(value || '').trim();

const parseNumber = (value, fallback = NaN) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getRowField = (row, aliases) => {
  const entries = Object.entries(row || {});
  for (const [key, value] of entries) {
    const normalizedKey = String(key).trim().toLowerCase();
    if (aliases.includes(normalizedKey)) return value;
  }
  return undefined;
};

const allowedGstRates = new Set([0, 5, 12, 18, 28]);

// POST /api/products/import
const importProducts = async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.products) ? req.body.products : [];
    if (!rows.length) return sendError(res, 'products array is required.', 400);

    const [categoryRows] = await db.query('SELECT id, name FROM categories');
    const [subcategoryRows] = await db.query('SELECT id, category_id, name FROM subcategories');

    const categoryByName = new Map(
      categoryRows.map((category) => [String(category.name).trim().toLowerCase(), category])
    );
    const subcategoryByCatAndName = new Map(
      subcategoryRows.map((subcategory) => [`${subcategory.category_id}:${String(subcategory.name).trim().toLowerCase()}`, subcategory])
    );

    const seenSku = new Set();
    const seenBarcode = new Set();

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const excelRowNo = index + 2;

      try {
        const name = normalizeText(getRowField(row, ['name']));
        const sku = normalizeText(getRowField(row, ['sku']));
        const barcode = normalizeText(getRowField(row, ['barcode']));
        const categoryName = normalizeText(getRowField(row, ['category']));
        const subcategoryName = normalizeText(getRowField(row, ['subcategory']));
        const _price = parseNumber(getRowField(row, ['price', 'sellingprice', 'selling_price']));
        const _mrpRaw = parseNumber(getRowField(row, ['mrp']), _price);
        const _costRaw = parseNumber(getRowField(row, ['cost', 'purchaseprice', 'purchase_price']), _price);
        const gstRate = parseNumber(getRowField(row, ['gstrate', 'gst_rate', 'taxrate', 'tax_rate']), 18);
        const _stock = parseNumber(getRowField(row, ['stock', 'qty', 'quantity']), 0);
        const unit = normalizeText(getRowField(row, ['unit'])) || 'pcs';
        const brand = normalizeText(getRowField(row, ['brand']));
        const description = normalizeText(getRowField(row, ['description']));

        if (!name || !sku) {
          failed += 1;
          errors.push({ row: excelRowNo, message: 'Required fields missing: name, sku' });
          continue;
        }

        if (!allowedGstRates.has(gstRate)) {
          failed += 1;
          errors.push({ row: excelRowNo, message: 'gstRate must be one of 0, 5, 12, 18, 28' });
          continue;
        }

        const skuKey = sku.toLowerCase();
        const barcodeKey = barcode.toLowerCase();
        if (seenSku.has(skuKey) || (barcodeKey && seenBarcode.has(barcodeKey))) {
          skipped += 1;
          errors.push({ row: excelRowNo, message: 'Duplicate SKU/barcode in same file, skipped' });
          continue;
        }

        const [existing] = await db.query(
          "SELECT id FROM products WHERE sku = ? OR (? <> '' AND barcode = ?) LIMIT 1",
          [sku, barcode, barcode]
        );
        if (existing.length > 0) {
          skipped += 1;
          errors.push({ row: excelRowNo, message: 'Duplicate SKU/barcode in database, skipped' });
          continue;
        }

        let categoryId = null;
        if (categoryName) {
          const categoryKey = categoryName.toLowerCase();
          let category = categoryByName.get(categoryKey);
          if (!category) {
            const categorySlug = slugify(categoryName);
            const [insertCategory] = await db.query(
              'INSERT INTO categories (name, slug, is_active, sort_order) VALUES (?, ?, 1, 0)',
              [categoryName, categorySlug || null]
            );
            category = { id: insertCategory.insertId, name: categoryName };
            categoryByName.set(categoryKey, category);
          }
          categoryId = category.id;
        }

        let subcategoryId = null;
        if (subcategoryName && categoryId) {
          const subKey = `${categoryId}:${subcategoryName.toLowerCase()}`;
          let subcategory = subcategoryByCatAndName.get(subKey);
          if (!subcategory) {
            const subSlug = slugify(subcategoryName);
            const [insertSubcategory] = await db.query(
              'INSERT INTO subcategories (category_id, name, slug, is_active, sort_order) VALUES (?, ?, ?, 1, 0)',
              [categoryId, subcategoryName, subSlug || null]
            );
            subcategory = { id: insertSubcategory.insertId, category_id: categoryId, name: subcategoryName };
            subcategoryByCatAndName.set(subKey, subcategory);
          }
          subcategoryId = subcategory.id;
        }

        const composedDescription = [description, brand ? `Brand: ${brand}` : '']
          .filter(Boolean)
          .join(' | ') || null;

        const [insertProduct] = await db.query(
          `INSERT INTO products (name, sku, barcode, category_id, subcategory_id, description, unit, tax_rate, reorder_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [name, sku, barcode || null, categoryId, subcategoryId, composedDescription, unit, gstRate]
        );

        seenSku.add(skuKey);
        if (barcodeKey) seenBarcode.add(barcodeKey);
        success += 1;
      } catch (rowError) {
        failed += 1;
        errors.push({ row: excelRowNo, message: rowError.message || 'Import failed for row' });
      }
    }

    return sendSuccess(res, { success, failed, skipped, errors }, 'Products import completed');
  } catch (error) {
    next(error);
  }
};

// GET /api/products
const getAllProducts = async (req, res, next) => {
  try {
    const { category_id, subcategory_id, is_active, include_attributes, page = 1, limit = 20 } = req.query;
    const shouldIncludeAttributes = ['1', 'true', 'yes'].includes(String(include_attributes || '').toLowerCase());
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = '1=1';
    const params = [];

    if (category_id) { whereClause += ' AND p.category_id = ?'; params.push(category_id); }
    if (subcategory_id) { whereClause += ' AND p.subcategory_id = ?'; params.push(subcategory_id); }

    const hasIsActiveFilter = typeof is_active !== 'undefined' && is_active !== null && is_active !== '';
    if (hasIsActiveFilter) {
      whereClause += ' AND p.is_active = ?';
      params.push(is_active);
    } else {
      whereClause += ' AND p.is_active = 1';
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`,
      params
    );

    const [pageRows] = await db.query(
      `SELECT p.id
       FROM products p
       WHERE ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const productIds = pageRows.map((row) => row.id);

    if (productIds.length === 0) {
      return sendSuccess(res, {
        products: [],
        pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      }, 'Products fetched');
    }

    const idPlaceholders = productIds.map(() => '?').join(', ');

    const [productRows] = await db.query(
      `SELECT p.id, p.name, p.sku, p.barcode, p.images, p.category_id, p.subcategory_id, p.unit, p.tax_rate, p.is_active, p.created_at, p.updated_at,
              c.name as category_name, sc.name as subcategory_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
       WHERE p.id IN (${idPlaceholders})`,
      [...productIds]
    );

    const [stockRows] = await db.query(
      `SELECT product_id,
              SUM(quantity_remaining) as stock_quantity,
              MAX(selling_price) as current_price,
              MAX(mrp) as mrp
       FROM product_batches
       WHERE quantity_remaining > 0 AND product_id IN (${idPlaceholders})
       GROUP BY product_id`,
      [...productIds]
    );

    const stockByProductId = new Map(stockRows.map((row) => [row.product_id, row]));
    const productById = new Map(
      productRows.map((row) => {
        const stock = stockByProductId.get(row.id);
        return [row.id, {
          ...row,
          stock_quantity: Number(stock?.stock_quantity || 0),
          current_price: stock?.current_price ?? null,
          mrp: stock?.mrp ?? null,
        }];
      })
    );

    const orderedProducts = productIds.map((id) => productById.get(id)).filter(Boolean);
    const products = shouldIncludeAttributes
      ? await attachAttributesToProducts(orderedProducts)
      : orderedProducts.map((product) => ({ ...product, attributes: [], attributes_map: {} }));

    return sendSuccess(res, { products, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } }, 'Products fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/products/:id
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [products] = await db.query(
      `SELECT p.*, c.name as category_name, sc.name as subcategory_name,
        COALESCE(SUM(CASE WHEN pb.quantity_remaining > 0 THEN pb.quantity_remaining ELSE 0 END), 0) as stock_quantity,
        COALESCE(
          MAX(CASE WHEN pb.quantity_remaining > 0 THEN pb.selling_price END),
          MAX(pb.selling_price),
          0
        ) as current_price,
        COALESCE(
          MAX(CASE WHEN pb.quantity_remaining > 0 THEN pb.mrp END),
          MAX(pb.mrp),
          0
        ) as mrp
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
       LEFT JOIN product_batches pb ON pb.product_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`,
      [id]
    );
    if (products.length === 0) return sendError(res, 'Product not found.', 404);

    const [batches] = await db.query(
      'SELECT * FROM product_batches WHERE product_id = ? ORDER BY created_at ASC',
      [id]
    );

    const [enrichedProduct] = await attachAttributesToProducts(products);

    return sendSuccess(res, { ...enrichedProduct, batches }, 'Product fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/products/search
const searchProducts = async (req, res, next) => {
  try {
    const { q, barcode, limit = 20 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    if (barcode) {
      const [products] = await db.query(
        `SELECT p.*, COALESCE(SUM(pb.quantity_remaining), 0) as stock_quantity,
          MAX(pb.selling_price) as current_price, MAX(pb.mrp) as mrp
         FROM products p
         LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.quantity_remaining > 0
         WHERE p.barcode = ? AND p.is_active = 1 GROUP BY p.id`,
        [barcode]
      );
      return sendSuccess(res, products, 'Search results');
    }

    if (!q || !String(q).trim()) return sendError(res, 'Search query or barcode is required.', 400);

    const searchQuery = String(q).trim();
    if (searchQuery.length < 2) {
      return sendSuccess(res, [], 'Search results');
    }

    const [products] = await db.query(
      `SELECT p.id, p.name, p.sku, p.barcode, p.images, p.category_id, p.subcategory_id, p.unit, p.tax_rate, p.is_active, p.created_at, p.updated_at,
              c.name as category_name,
              COALESCE(agg.stock_quantity, 0) as stock_quantity,
              agg.current_price,
              agg.mrp
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT product_id,
                SUM(quantity_remaining) as stock_quantity,
                MAX(selling_price) as current_price,
                MAX(mrp) as mrp
         FROM product_batches
         WHERE quantity_remaining > 0
         GROUP BY product_id
       ) agg ON agg.product_id = p.id
      WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
       ORDER BY p.created_at DESC
       LIMIT ?`,
      [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, limitNum]
    );
    return sendSuccess(res, products, 'Search results');
  } catch (error) {
    next(error);
  }
};

// POST /api/products
const addProduct = async (req, res, next) => {
  try {
    const { name, sku, barcode, category_id, subcategory_id, description, unit, tax_rate, hsn_code, reorder_level } = req.body;

    if (!name) return sendError(res, 'Product name is required.', 400);

     const images = getIncomingImages(req);

    const [result] = await db.query(
      `INSERT INTO products (name, sku, barcode, category_id, subcategory_id, description, unit, tax_rate, hsn_code, reorder_level, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, sku || null, barcode || null, category_id || null, subcategory_id || null,
       description || null, unit || 'pcs', tax_rate || 0, hsn_code || null,
       reorder_level || 0, images.length ? JSON.stringify(images) : null]
    );

    const attributes = parseAttributesInput(req.body?.attributes);
    await upsertProductAttributes(result.insertId, attributes);

    const [product] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    const [enrichedProduct] = await attachAttributesToProducts(product);
    return sendSuccess(res, enrichedProduct, 'Product added successfully', 201);
  } catch (error) {
    next(error);
  }
};

// POST /api/products/:id/batch
const addProductBatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { batch_number, purchase_price, selling_price, mrp, quantity, expiry_date, manufacturing_date, supplier_id, purchase_invoice_id } = req.body;

    if (!purchase_price || !selling_price || !quantity) {
      return sendError(res, 'purchase_price, selling_price and quantity are required.', 400);
    }

    const [product] = await db.query('SELECT id FROM products WHERE id = ?', [id]);
    if (product.length === 0) return sendError(res, 'Product not found.', 404);

    const [result] = await db.query(
      `INSERT INTO product_batches (product_id, batch_number, purchase_price, selling_price, mrp, quantity_purchased, quantity_remaining, expiry_date, manufacturing_date, supplier_id, purchase_invoice_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, batch_number || null, purchase_price, selling_price, mrp || null, quantity, quantity, expiry_date || null, manufacturing_date || null, supplier_id || null, purchase_invoice_id || null]
    );

    const [batch] = await db.query('SELECT * FROM product_batches WHERE id = ?', [result.insertId]);
    return sendSuccess(res, batch[0], 'Batch added successfully', 201);
  } catch (error) {
    next(error);
  }
};

// PUT /api/products/:id
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, sku, barcode, category_id, subcategory_id, description, unit, tax_rate, hsn_code, reorder_level, is_active } = req.body;

    const [existing] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Product not found.', 404);

    const p = existing[0];
     const existingImages = parseImagesArray(p.images);
     const mergedImages = getIncomingImages(req, existingImages);
    await db.query(
      `UPDATE products SET name=?, sku=?, barcode=?, category_id=?, subcategory_id=?, description=?, unit=?, tax_rate=?, hsn_code=?, reorder_level=?, images=?, is_active=? WHERE id=?`,
      [name||p.name, sku||p.sku, barcode||p.barcode, category_id||p.category_id, subcategory_id||p.subcategory_id,
       description||p.description, unit||p.unit, tax_rate||p.tax_rate, hsn_code||p.hsn_code,
       reorder_level||p.reorder_level, mergedImages.length ? JSON.stringify(mergedImages) : null, is_active !== undefined ? is_active : p.is_active, id]
    );

    if (typeof req.body?.attributes !== 'undefined') {
      const attributes = parseAttributesInput(req.body.attributes);
      await upsertProductAttributes(id, attributes);
    }

    const [updated] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    const [enrichedProduct] = await attachAttributesToProducts(updated);
    return sendSuccess(res, enrichedProduct, 'Product updated');
  } catch (error) {
    next(error);
  }
};

// DELETE /api/products/:id
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM products WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Product not found.', 404);
    await db.query('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    return sendSuccess(res, {}, 'Product deleted (soft delete)');
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllProducts, getProductById, searchProducts, addProduct, importProducts, addProductBatch, updateProduct, deleteProduct };
