const express = require('express');
const router = express.Router();
const { getAllProducts, getProductById, searchProducts, addProduct, importProducts, addProductBatch, updateProduct, deleteProduct } = require('../controllers/productController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { uploadProductImages } = require('../middleware/uploadMiddleware');
const { responseCache, clearResponseCache } = require('../middleware/responseCache');

const clearProductCache = clearResponseCache(['/api/products', '/api/reports/stock', '/api/reports/reorder-suggestions']);

router.get('/', responseCache(20), getAllProducts);
router.get('/search', responseCache(15), searchProducts);
router.post('/import', authMiddleware, roleMiddleware('admin', 'subadmin'), clearProductCache, importProducts);
router.get('/:id', responseCache(30), getProductById);
router.post('/', authMiddleware, roleMiddleware('admin', 'subadmin'), clearProductCache, uploadProductImages, addProduct);
router.post('/:id/batch', authMiddleware, roleMiddleware('admin', 'subadmin'), clearProductCache, addProductBatch);
router.put('/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), clearProductCache, uploadProductImages, updateProduct);
router.delete('/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), clearProductCache, deleteProduct);

module.exports = router;
