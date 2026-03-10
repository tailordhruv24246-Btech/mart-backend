const express = require('express');
const router = express.Router();
const { addSupplier, getSuppliers, updateSupplier, deleteSupplier, addSupplierInvoice, addPurchaseEntry, getInvoices, getInvoicesList } = require('../controllers/purchaseController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.get('/suppliers', authMiddleware, roleMiddleware('admin', 'subadmin'), getSuppliers);
router.post('/suppliers', authMiddleware, roleMiddleware('admin', 'subadmin'), addSupplier);
router.put('/suppliers/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), updateSupplier);
router.delete('/suppliers/:id', authMiddleware, roleMiddleware('admin', 'subadmin'), deleteSupplier);
router.get('/invoices/list', authMiddleware, roleMiddleware('admin', 'subadmin'), getInvoicesList);
router.get('/invoices', authMiddleware, roleMiddleware('admin', 'subadmin'), getInvoices);
router.post('/invoices', authMiddleware, roleMiddleware('admin', 'subadmin'), addSupplierInvoice);
router.post('/entry', authMiddleware, roleMiddleware('admin', 'subadmin'), addPurchaseEntry);

module.exports = router;
