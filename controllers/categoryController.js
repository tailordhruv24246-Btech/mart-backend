const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const slugify = (text) => text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// GET /api/categories
const getAllCategories = async (req, res, next) => {
  try {
    const [categories] = await db.query(
      `SELECT c.*, COUNT(s.id) as subcategory_count, COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN subcategories s ON s.category_id = c.id AND s.is_active = 1
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       GROUP BY c.id ORDER BY c.sort_order, c.name`
    );
    return sendSuccess(res, categories, 'Categories fetched');
  } catch (error) {
    next(error);
  }
};

// POST /api/categories
const addCategory = async (req, res, next) => {
  try {
    const { name, description, image, is_active = 1, sort_order = 0 } = req.body;
    if (!name) return sendError(res, 'Category name is required.', 400);

    const uploadedImagePath = req.file ? `/uploads/categories/${req.file.filename}` : null;
    const finalImage = uploadedImagePath || image || null;

    const slug = slugify(name);
    const [result] = await db.query(
      'INSERT INTO categories (name, slug, description, image, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [name, slug, description || null, finalImage, is_active, sort_order]
    );
    const [cat] = await db.query('SELECT * FROM categories WHERE id = ?', [result.insertId]);
    return sendSuccess(res, cat[0], 'Category added successfully', 201);
  } catch (error) {
    next(error);
  }
};

// PUT /api/categories/:id
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, image, is_active, sort_order } = req.body;

    const [existing] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Category not found.', 404);

    const slug = name ? slugify(name) : existing[0].slug;
    const uploadedImagePath = req.file ? `/uploads/categories/${req.file.filename}` : null;
    const finalImage = uploadedImagePath || (image ?? existing[0].image);
    await db.query(
      'UPDATE categories SET name = ?, slug = ?, description = ?, image = ?, is_active = ?, sort_order = ? WHERE id = ?',
      [
        name || existing[0].name,
        slug,
        description ?? existing[0].description,
        finalImage,
        is_active ?? existing[0].is_active,
        sort_order ?? existing[0].sort_order,
        id,
      ]
    );
    const [updated] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    return sendSuccess(res, updated[0], 'Category updated successfully');
  } catch (error) {
    next(error);
  }
};

// DELETE /api/categories/:id
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM categories WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Category not found.', 404);
    await db.query('DELETE FROM categories WHERE id = ?', [id]);
    return sendSuccess(res, {}, 'Category deleted successfully');
  } catch (error) {
    next(error);
  }
};

// GET /api/categories/:id/subcategories
const getSubcategories = async (req, res, next) => {
  try {
    const categoryId = req.params.id || req.query.category_id || req.query.categoryId;

    let query = `SELECT s.*, c.name as category_name
                 FROM subcategories s
                 LEFT JOIN categories c ON c.id = s.category_id`;
    const params = [];

    if (categoryId) {
      query += ' WHERE s.category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY s.sort_order, s.name';

    const [subs] = await db.query(query, params);
    return sendSuccess(res, subs, 'Subcategories fetched');
  } catch (error) {
    next(error);
  }
};

// POST /api/categories/subcategory
const addSubcategory = async (req, res, next) => {
  try {
    const { category_id, name, description, image, is_active = 1, sort_order = 0 } = req.body;
    if (!category_id || !name) return sendError(res, 'category_id and name are required.', 400);

    const uploadedImagePath = req.file ? `/uploads/categories/${req.file.filename}` : null;
    const finalImage = uploadedImagePath || image || null;

    const slug = slugify(name);
    const [result] = await db.query(
      'INSERT INTO subcategories (category_id, name, slug, description, image, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [category_id, name, slug, description || null, finalImage, is_active, sort_order]
    );
    const [sub] = await db.query('SELECT * FROM subcategories WHERE id = ?', [result.insertId]);
    return sendSuccess(res, sub[0], 'Subcategory added successfully', 201);
  } catch (error) {
    next(error);
  }
};

// PUT /api/categories/subcategory/:id
const updateSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category_id, name, description, image, is_active, sort_order } = req.body;

    const [existing] = await db.query('SELECT * FROM subcategories WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Subcategory not found.', 404);

    const current = existing[0];
    const slug = name ? slugify(name) : current.slug;
    const uploadedImagePath = req.file ? `/uploads/categories/${req.file.filename}` : null;
    const finalImage = uploadedImagePath || (image ?? current.image);

    await db.query(
      'UPDATE subcategories SET category_id = ?, name = ?, slug = ?, description = ?, image = ?, is_active = ?, sort_order = ? WHERE id = ?',
      [
        category_id || current.category_id,
        name || current.name,
        slug,
        description ?? current.description,
        finalImage,
        is_active ?? current.is_active,
        sort_order ?? current.sort_order,
        id,
      ]
    );

    const [updated] = await db.query('SELECT * FROM subcategories WHERE id = ?', [id]);
    return sendSuccess(res, updated[0], 'Subcategory updated successfully');
  } catch (error) {
    next(error);
  }
};

// DELETE /api/categories/subcategory/:id
const deleteSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM subcategories WHERE id = ?', [id]);
    if (existing.length === 0) return sendError(res, 'Subcategory not found.', 404);
    await db.query('DELETE FROM subcategories WHERE id = ?', [id]);
    return sendSuccess(res, {}, 'Subcategory deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllCategories, addCategory, updateCategory, deleteCategory, getSubcategories, addSubcategory, updateSubcategory, deleteSubcategory };
