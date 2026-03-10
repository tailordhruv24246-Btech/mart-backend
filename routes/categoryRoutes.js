const express = require('express');
const router = express.Router();
const { getAllCategories, addCategory, updateCategory, deleteCategory, getSubcategories, addSubcategory, updateSubcategory, deleteSubcategory } = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { uploadCategoryImage } = require('../middleware/uploadMiddleware');
const { responseCache, clearResponseCache } = require('../middleware/responseCache');

const clearCategoryCache = clearResponseCache(['/api/categories', '/api/products']);

router.get('/', responseCache(60), getAllCategories);
router.get('/:id/subcategories', responseCache(45), getSubcategories);
router.post('/', authMiddleware, roleMiddleware('admin', 'subadmin'), clearCategoryCache, uploadCategoryImage, addCategory);
router.put('/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), clearCategoryCache, uploadCategoryImage, updateCategory);
router.delete('/:id', authMiddleware, roleMiddleware('admin'), clearCategoryCache, deleteCategory);
router.get('/subcategory', responseCache(45), getSubcategories);
router.post('/subcategory', authMiddleware, roleMiddleware('admin', 'subadmin'), clearCategoryCache, uploadCategoryImage, addSubcategory);
router.put('/subcategory/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), clearCategoryCache, uploadCategoryImage, updateSubcategory);
router.delete('/subcategory/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), clearCategoryCache, deleteSubcategory);

module.exports = router;
