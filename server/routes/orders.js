const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const crypto = require('crypto');
const { auth, optionalAuth, admin } = require('../middleware/auth');

/**
 * Helper to determine active public base URL
 */
const getBaseUrl = (req) => {
    return (
        process.env.PUBLIC_BASE_URL ||
        process.env.NGROK_URL ||
        'https://swampland-situated-barbell.ngrok-free.dev'
    );
};

/**
 * Helper to get configured Merchant UPI details
 */
const getMerchantUpi = () => {
    return {
        upiId: process.env.MERCHANT_UPI_ID || 'ethree@okhdfcbank',
        name: process.env.MERCHANT_NAME || 'ETHREE ENTERTAINMENT'
    };
};

/**
 * Helper to generate NPCI-standard UPI Intent URI
 */
const generateUpiUri = ({ upiId, merchantName, amount, txnid, note }) => {
    const cleanAmount = Number(amount || 0).toFixed(2);
    const cleanNote = encodeURIComponent(note || `Order ${txnid}`);
    const cleanName = encodeURIComponent(merchantName);
    return `upi://pay?pa=${upiId}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}&tr=${txnid}`;
};

const easebuzzService = require('../services/easebuzzService');
const { syncPaymentStatus } = require('../services/ridePaymentSync');

/**
 * Initiate Easebuzz payment session using production service
 */
async function initiateEasebuzz({ txnid, amount, productinfo, firstname, email, phone, surl, furl, udf1 }) {
    const res = await easebuzzService.initiatePayment({
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        phone,
        surl,
        furl,
        udf1
    });
    return res.payment_url;
}


/**
 * Initiate Razorpay Payment Link
 */
async function initiateRazorpay({ txnid, amount, customerName, customerEmail, customerPhone, callbackUrl }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify({
            amount: Math.round(Number(amount) * 100),
            currency: 'INR',
            reference_id: txnid,
            description: `ETHREE POS Order ${txnid}`,
            customer: {
                name: customerName || 'Customer',
                email: customerEmail || 'customer@ethree.in',
                contact: customerPhone || '9999999999'
            },
            notify: { sms: false, email: false },
            callback_url: callbackUrl,
            callback_method: 'get'
        })
    });

    const data = await response.json();
    if (data.short_url) {
        return data.short_url;
    } else {
        throw new Error(data.error?.description || 'Razorpay initiation failed');
    }
}

/**
 * @swagger
 * /api/orders/all:
 *   get:
 *     summary: Get all orders (Admin only)
 *     tags: [Orders]
 */
router.get('/all', auth, admin, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get user orders
 *     tags: [Orders]
 */
router.get('/', auth, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/orders/checkout:
 *   post:
 *     summary: Initiate live payment gateway session and create order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     price: { type: number }
 *                     quantity: { type: number }
 *                     id: { type: string }
 *               amount:
 *                 type: number
 *                 description: Total order amount in INR
 *               txnid:
 *                 type: string
 *                 description: Optional custom transaction ID
 *               customerName:
 *                 type: string
 *               customerPhone:
 *                 type: string
 *               customerEmail:
 *                 type: string
 *     responses:
 *       200:
 *         description: Live checkout session initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 txnid: { type: string }
 *                 url: { type: string, description: "Live hosted checkout URL" }
 *                 upiUri: { type: string, description: "NPCI UPI Intent URI for QR code" }
 *                 amount: { type: number }
 *                 status: { type: string }
 */
router.post('/checkout', optionalAuth, async (req, res) => {
    try {
        const {
            items = [],
            amount,
            totalAmount,
            txnid,
            customerName,
            customerPhone,
            customerEmail,
            firstname,
            phone,
            email,
            productinfo
        } = req.body;

        // Calculate final amount
        let calculatedAmount = 0;
        if (amount !== undefined && amount !== null && !isNaN(Number(amount))) {
            calculatedAmount = Number(amount);
        } else if (totalAmount !== undefined && totalAmount !== null && !isNaN(Number(totalAmount))) {
            calculatedAmount = Number(totalAmount);
        } else if (Array.isArray(items) && items.length > 0) {
            calculatedAmount = items.reduce(
                (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)),
                0
            );
        }

        const finalTxnId = txnid || `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const finalCustomerName = customerName || firstname || (req.user ? req.user.name : 'Customer');
        const finalCustomerPhone = customerPhone || phone || '9999999999';
        const finalCustomerEmail = customerEmail || email || (req.user ? req.user.email : 'customer@ethree.in');
        const finalProductInfo = productinfo || (items.length > 0 ? items.map(i => i.name).join(', ').substring(0, 50) : 'ETHREE POS Order');

        // Create Order in MongoDB
        const order = await Order.create({
            user: req.user ? req.user.id : null,
            txnid: finalTxnId,
            items: (items || []).map(item => ({
                name: item.name || 'Ticket',
                price: Number(item.price) || 0,
                quantity: Number(item.quantity) || 1,
                product: (item.id && mongoose.Types.ObjectId.isValid(item.id)) ? item.id : null
            })),
            totalAmount: calculatedAmount,
            customerName: finalCustomerName,
            customerPhone: finalCustomerPhone,
            customerEmail: finalCustomerEmail,
            paymentMethod: 'upi',
            paymentStatus: 'pending',
            orderStatus: 'placed'
        });

        const baseUrl = getBaseUrl(req);
        const { upiId, name: merchantName } = getMerchantUpi();

        // Exact redirect URLs as requested:
        // On success: https://swampland-situated-barbell.ngrok-free.dev/api/payments/response?status=success&txnid=<TXN_ID>
        // On failure: https://swampland-situated-barbell.ngrok-free.dev/api/payments/response?status=failure&txnid=<TXN_ID>
        const surl = `${baseUrl}/api/payments/response?status=success&txnid=${finalTxnId}`;
        const furl = `${baseUrl}/api/payments/response?status=failure&txnid=${finalTxnId}`;

        let checkoutUrl;

        // 1. Easebuzz Gateway (if configured in .env)
        if (process.env.EASEBUZZ_KEY && process.env.EASEBUZZ_SALT) {
            try {
                checkoutUrl = await initiateEasebuzz({
                    txnid: finalTxnId,
                    amount: calculatedAmount,
                    productinfo: finalProductInfo,
                    firstname: finalCustomerName.split(' ')[0] || 'Customer',
                    email: finalCustomerEmail,
                    phone: finalCustomerPhone,
                    surl,
                    furl
                });
                order.paymentGateway = 'easebuzz';
                await order.save();
            } catch (err) {
                console.warn('Easebuzz initiation failed, falling back to hosted checkout:', err.message);
                checkoutUrl = `${baseUrl}/api/payments/checkout/${finalTxnId}`;
                order.paymentGateway = 'hosted_upi';
                await order.save();
            }
        }
        // 2. Razorpay Gateway (if configured in .env)
        else if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
            try {
                checkoutUrl = await initiateRazorpay({
                    txnid: finalTxnId,
                    amount: calculatedAmount,
                    customerName: finalCustomerName,
                    customerEmail: finalCustomerEmail,
                    customerPhone: finalCustomerPhone,
                    callbackUrl: surl
                });
                order.paymentGateway = 'razorpay';
                await order.save();
            } catch (err) {
                console.warn('Razorpay initiation failed, falling back to hosted checkout:', err.message);
                checkoutUrl = `${baseUrl}/api/payments/checkout/${finalTxnId}`;
                order.paymentGateway = 'hosted_upi';
                await order.save();
            }
        }
        // 3. Built-in Live Hosted Checkout Page with Dynamic UPI QR
        else {
            checkoutUrl = `${baseUrl}/api/payments/checkout/${finalTxnId}`;
            order.paymentGateway = 'hosted_upi';
            await order.save();
        }

        // Dynamic NPCI UPI Intent URI
        const upiUri = generateUpiUri({
            upiId,
            merchantName,
            amount: calculatedAmount,
            txnid: finalTxnId,
            note: `ETHREE POS ${finalTxnId}`
        });

        // Response formatted for tablet app
        res.json({
            id: order._id.toString(),
            txnid: finalTxnId,
            url: checkoutUrl,
            upiUri,
            amount: calculatedAmount,
            status: 'PENDING'
        });
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/orders/{orderId}/status:
 *   get:
 *     summary: Check payment status of an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB Order ID or Transaction Reference ID (txnid)
 *     responses:
 *       200:
 *         description: Payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [SUCCESS, PENDING, FAILED]
 *                 orderId:
 *                   type: string
 *                 txnid:
 *                   type: string
 *                 amount:
 *                   type: number
 */
router.get('/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        let order = null;

        // 1. Search by txnid
        order = await Order.findOne({ txnid: orderId });

        // 2. Search by MongoDB _id
        if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findById(orderId);
        }

        if (!order) {
            return res.status(404).json({
                status: 'FAILED',
                message: `Order not found with ID: ${orderId}`
            });
        }

        // If order is still pending and txnid is present, auto-check live Easebuzz status
        if (order.paymentStatus === 'pending' && order.txnid) {
            const hasEasebuzzCreds = Boolean(process.env.EASEBUZZ_KEY && process.env.EASEBUZZ_SALT);
            if (hasEasebuzzCreds && process.env.EASEBUZZ_KEY !== 'your_production_merchant_key') {
                try {
                    const verifyResult = await easebuzzService.retrieveTransactionStatus(order.txnid);
                    if (verifyResult.isPaid) {
                        order.paymentStatus = 'paid';
                        order.paidAt = new Date();
                        if (verifyResult.easepayid) {
                            order.gatewayTransactionId = verifyResult.easepayid;
                        }
                        await order.save();
                    }
                } catch (verifyErr) {
                    console.log(`[ORDER STATUS] Easebuzz status check for ${order.txnid}: ${verifyErr.message}`);
                }
            }
        }

        // Map status to uppercase requested format: SUCCESS | PENDING | FAILED
        let status = 'PENDING';
        if (order.paymentStatus === 'paid') {
            status = 'SUCCESS';
        } else if (order.paymentStatus === 'failed') {
            status = 'FAILED';
        } else {
            status = 'PENDING';
        }


        res.json({
            status,
            orderId: order._id.toString(),
            txnid: order.txnid || order._id.toString(),
            amount: order.totalAmount,
            paidAt: order.paidAt || null
        });
    } catch (err) {
        res.status(500).json({ status: 'FAILED', message: err.message });
    }
});

/**
 * @swagger
 * /api/orders/{orderId}/mark-paid:
 *   post:
 *     summary: Manually mark an order as paid (Verification / Testing)
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 */
router.post('/:orderId/mark-paid', async (req, res) => {
    try {
        const { orderId } = req.params;
        let order = await Order.findOne({ txnid: orderId });
        if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findById(orderId);
        }

        if (!order) {
            return res.status(404).json({ status: 'FAILED', message: 'Order not found' });
        }

        order.paymentStatus = 'paid';
        order.paidAt = new Date();
        await order.save();

        res.json({
            status: 'SUCCESS',
            orderId: order._id,
            txnid: order.txnid,
            amount: order.totalAmount,
            paidAt: order.paidAt
        });
    } catch (err) {
        res.status(500).json({ status: 'FAILED', message: err.message });
    }
});

/**
 * @swagger
 * /api/orders/clear-all:
 *   delete:
 *     summary: Delete all orders (Admin only)
 *     tags: [Orders]
 */
router.delete('/clear-all', auth, admin, async (req, res) => {
    try {
        await Order.deleteMany({});
        res.json({ message: 'All orders cleared successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
