const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Ride = require('../models/Ride');
const Ticket = require('../models/Ticket');
const { optionalAuth, auth } = require('../middleware/auth');
const easebuzzService = require('../services/easebuzzService');
const { syncPaymentStatus, findRide, findOrder } = require('../services/ridePaymentSync');

/**
 * Helper to determine active public base URL for gateway callbacks
 */
const getBaseUrl = (req) => {
    return (
        process.env.PUBLIC_BASE_URL ||
        process.env.NGROK_URL ||
        `${req.protocol}://${req.get('host')}` ||
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
    const cleanNote = encodeURIComponent(note || `Ride Payment ${txnid}`);
    const cleanName = encodeURIComponent(merchantName);
    return `upi://pay?pa=${upiId}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}&tr=${txnid}`;
};

/**
 * @swagger
 * /api/payments/config:
 *   get:
 *     summary: Get public payment configuration and active gateway details
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Active payment gateway status and UPI details
 */
router.get('/config', (req, res) => {
    const { upiId, name } = getMerchantUpi();
    const isEasebuzzConfigured = Boolean(process.env.EASEBUZZ_KEY && process.env.EASEBUZZ_SALT);
    const isRazorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

    const activeGateway = isEasebuzzConfigured
        ? 'easebuzz'
        : isRazorpayConfigured
        ? 'razorpay'
        : 'hosted_upi';

    res.json({
        merchantUpiId: upiId,
        merchantName: name,
        activeGateway,
        easebuzzEnv: process.env.EASEBUZZ_ENV || 'prod',
        appCallbackScheme: process.env.APP_CALLBACK_SCHEME || 'yourrideapp://payment/callback',
        publicBaseUrl: getBaseUrl(req)
    });
});

/**
 * @swagger
 * /api/payments/initiate:
 *   post:
 *     summary: Initiate Live Easebuzz Payment Gateway for ride/trip fare payments
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rideId: { type: string, description: "Existing ride reference ID" }
 *               fare: { type: number, description: "Ride fare amount" }
 *               amount: { type: number, description: "Total payable amount" }
 *               txnid: { type: string, description: "Unique transaction reference" }
 *               rideName: { type: string, description: "Name of the ride or route" }
 *               productinfo: { type: string, description: "Sanitized product information" }
 *               passengerName: { type: string }
 *               firstname: { type: string }
 *               passengerEmail: { type: string }
 *               email: { type: string }
 *               passengerPhone: { type: string }
 *               phone: { type: string }
 *               surl: { type: string, description: "Success callback URL" }
 *               furl: { type: string, description: "Failure callback URL" }
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: number, example: 1 }
 *                 payment_url: { type: string }
 *                 access_key: { type: string }
 *                 txnid: { type: string }
 */
const handleInitiatePayment = async (req, res) => {
    try {
        const {
            rideId,
            orderId,
            fare,
            amount,
            totalAmount,
            rideName,
            pickupLocation,
            dropLocation,
            passengerName,
            customerName,
            firstname,
            passengerEmail,
            customerEmail,
            email,
            passengerPhone,
            customerPhone,
            phone,
            productinfo,
            rawInfo,
            surl,
            furl,
            udf1,
            udf2,
            udf3,
            udf4,
            udf5
        } = req.body;

        // 1. Resolve payable amount from request or database
        let payableAmount = 0;
        if (fare !== undefined && fare !== null && !isNaN(Number(fare))) {
            payableAmount = Number(fare);
        } else if (amount !== undefined && amount !== null && !isNaN(Number(amount))) {
            payableAmount = Number(amount);
        } else if (totalAmount !== undefined && totalAmount !== null && !isNaN(Number(totalAmount))) {
            payableAmount = Number(totalAmount);
        }

        // Check if an existing ride record exists
        let existingRide = null;
        if (rideId) {
            existingRide = await findRide(rideId);
            if (existingRide && (!payableAmount || payableAmount <= 0)) {
                payableAmount = existingRide.fare || existingRide.amount || 0;
            }
        }

        // Check if an existing order record exists
        let existingOrder = null;
        if (orderId) {
            existingOrder = await findOrder(orderId);
            if (existingOrder && (!payableAmount || payableAmount <= 0)) {
                payableAmount = existingOrder.totalAmount || 0;
            }
        }

        if (!payableAmount || payableAmount <= 0) {
            return res.status(400).json({
                status: 0,
                message: 'A valid ride fare or amount is required to initiate payment'
            });
        }

        // 2. Extract passenger details from authenticated user, existing ride, or request body
        const resolvedName = (
            passengerName ||
            firstname ||
            customerName ||
            (existingRide ? existingRide.passengerName : null) ||
            (existingOrder ? existingOrder.customerName : null) ||
            (req.user ? req.user.name : null) ||
            'Passenger'
        );

        const resolvedPhone = (
            passengerPhone ||
            phone ||
            customerPhone ||
            (existingRide ? existingRide.passengerPhone : null) ||
            (existingOrder ? existingOrder.customerPhone : null) ||
            (req.user ? req.user.phone : null) ||
            '9999999999'
        );

        const resolvedEmail = (
            passengerEmail ||
            email ||
            customerEmail ||
            (existingRide ? existingRide.passengerEmail : null) ||
            (existingOrder ? existingOrder.customerEmail : null) ||
            (req.user ? req.user.email : null) ||
            'passenger@ethree.in'
        );

        const resolvedProductInfo = (
            productinfo ||
            rawInfo ||
            rideName ||
            (existingRide ? existingRide.rideName : null) ||
            'Ride Payment'
        );

        // 3. Generate unique transaction reference (txnid)
        const finalTxnId = req.body.txnid || `RIDE-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        // 4. Update or create the ride record in the database with txnid and pending payment status
        if (existingRide) {
            existingRide.txnid = finalTxnId;
            existingRide.paymentStatus = 'pending';
            existingRide.fare = payableAmount;
            existingRide.amount = payableAmount;
            existingRide.paymentGateway = 'easebuzz';
            if (rideId) existingRide.udf1 = String(rideId);
            await existingRide.save();
        } else {
            await Ride.create({
                passenger: req.user ? req.user.id : null,
                passengerName: resolvedName,
                passengerPhone: resolvedPhone,
                passengerEmail: resolvedEmail,
                rideName: resolvedProductInfo,
                pickupLocation: pickupLocation || '',
                dropLocation: dropLocation || '',
                fare: payableAmount,
                amount: payableAmount,
                txnid: finalTxnId,
                paymentStatus: 'pending',
                rideStatus: 'requested',
                paymentGateway: 'easebuzz',
                udf1: rideId ? String(rideId) : finalTxnId
            });
        }

        // If an order ID was passed, update that existing order too
        if (existingOrder) {
            existingOrder.txnid = finalTxnId;
            existingOrder.paymentStatus = 'pending';
            existingOrder.paymentGateway = 'easebuzz';
            await existingOrder.save();
        }

        // 5. Set surl and furl to backend callback endpoint (as requested)
        const baseUrl = getBaseUrl(req);
        const finalSurl = surl || `${baseUrl}/api/payments/response?status=success`;
        const finalFurl = furl || `${baseUrl}/api/payments/response?status=failure`;

        // 6. Initiate Live Production Easebuzz Payment Session
        try {
            console.log(`[EASEBUZZ INITIATE] Calling Live Easebuzz for txnid: ${finalTxnId}, amount: ${payableAmount.toFixed(2)}`);
            const easebuzzRes = await easebuzzService.initiatePayment({
                txnid: finalTxnId,
                amount: payableAmount,
                productinfo: resolvedProductInfo || 'Ride Fare',
                firstname: resolvedName || 'Passenger',
                email: resolvedEmail || 'customer@ethree.in',
                phone: resolvedPhone,
                surl: finalSurl,
                furl: finalFurl,
                udf1: udf1 || (rideId ? String(rideId) : finalTxnId),
                udf2: udf2 || '',
                udf3: udf3 || '',
                udf4: udf4 || '',
                udf5: udf5 || ''
            });

            // Return official response structure required by mobile app:
            // { status: 1, success: true, payment_url: https://pay.easebuzz.in/pay/${access_key}, access_key: access_key, txnid: txnid }
            return res.json({
                status: 1,
                success: true,
                payment_url: easebuzzRes.payment_url,
                access_key: easebuzzRes.access_key,
                txnid: finalTxnId
            });
        } catch (gatewayErr) {
            console.error('[EASEBUZZ INITIATE ERROR]', gatewayErr.message);
            return res.status(502).json({
                status: 0,
                success: false,
                message: gatewayErr.message || 'Easebuzz gateway payment initiation failed',
                txnid: finalTxnId
            });
        }
    } catch (err) {
        console.error('[PAYMENT INITIATE EXCEPTION]', err);
        res.status(500).json({ status: 0, success: false, message: err.message });
    }
};

router.post('/initiate', optionalAuth, handleInitiatePayment);
router.post('/ride/initiate', optionalAuth, handleInitiatePayment);

/**
 * @swagger
 * /api/payments/verify/{txnid}:
 *   get:
 *     summary: Verify transaction status with Easebuzz / Backend DB
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: txnid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verified payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [success, failure, pending] }
 *                 txnid: { type: string }
 *                 amount: { type: string }
 *                 isPaid: { type: boolean }
 */
const handleStatusVerification = async (req, res) => {
    try {
        const txnidParam = req.params?.txnid || req.query?.txnid || req.body?.txnid;
        const rideRef = req.body?.rideId || req.query?.rideId || req.body?.orderId || req.query?.orderId;

        let txnid = txnidParam;

        // If txnid not given directly, lookup ride/order by reference
        let ride = null;
        let order = null;

        if (txnid) {
            ride = await findRide(txnid);
            order = await findOrder(txnid);
        } else if (rideRef) {
            ride = await findRide(rideRef);
            if (ride && ride.txnid) {
                txnid = ride.txnid;
            } else {
                order = await findOrder(rideRef);
                if (order && order.txnid) {
                    txnid = order.txnid;
                }
            }
        }

        if (!txnid) {
            return res.status(400).json({
                status: 'failure',
                message: 'txnid is required for verification'
            });
        }

        // 1. If already marked as paid in local database, return success immediately
        const alreadyPaid = (ride && ride.paymentStatus === 'paid') || (order && order.paymentStatus === 'paid');
        const dbAmount = (ride ? (ride.fare || ride.amount) : (order ? order.totalAmount : 0)) || 0;

        if (alreadyPaid) {
            return res.json({
                status: 'success',
                txnid,
                amount: parseFloat(dbAmount).toFixed(2),
                isPaid: true
            });
        }

        // 2. Query Easebuzz Transaction API to verify live state
        try {
            const verifyResult = await easebuzzService.retrieveTransactionStatus(txnid);

            if (verifyResult.isPaid) {
                // Update existing ride and order in database to paid
                await syncPaymentStatus({
                    txnid,
                    status: 'success',
                    easepayid: verifyResult.easepayid,
                    amount: verifyResult.amount
                });

                return res.json({
                    status: 'success',
                    txnid,
                    amount: parseFloat(verifyResult.amount || dbAmount).toFixed(2),
                    isPaid: true
                });
            } else if (verifyResult.status === 'failure' || verifyResult.status === 'userCancelled') {
                await syncPaymentStatus({
                    txnid,
                    status: 'failed',
                    easepayid: verifyResult.easepayid,
                    amount: verifyResult.amount
                });

                return res.json({
                    status: 'failure',
                    txnid,
                    amount: parseFloat(verifyResult.amount || dbAmount).toFixed(2),
                    isPaid: false
                });
            } else {
                // Still pending or awaiting confirmation
                return res.json({
                    status: 'pending',
                    txnid,
                    amount: parseFloat(dbAmount).toFixed(2),
                    isPaid: false
                });
            }
        } catch (apiErr) {
            console.warn(`[STATUS VERIFY] Easebuzz retrieve failed for ${txnid}:`, apiErr.message);
            // Fallback to local DB state
            const currentStatus = (ride?.paymentStatus || order?.paymentStatus || 'pending');
            return res.json({
                status: currentStatus === 'paid' ? 'success' : (currentStatus === 'failed' ? 'failure' : 'pending'),
                txnid,
                amount: parseFloat(dbAmount).toFixed(2),
                isPaid: currentStatus === 'paid'
            });
        }
    } catch (err) {
        console.error('[STATUS VERIFY ERROR]', err);
        res.status(500).json({ status: 'failure', message: err.message });
    }
};

router.get('/verify/:txnid', handleStatusVerification);
router.post('/verify/:txnid', handleStatusVerification);
router.get('/verify', handleStatusVerification);
router.post('/verify', handleStatusVerification);
router.get('/status/:txnid', handleStatusVerification);
router.post('/status/:txnid', handleStatusVerification);
router.get('/status', handleStatusVerification);
router.post('/status', handleStatusVerification);


/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Server-to-Server (S2S) Webhook Endpoint for Easebuzz live payment notifications
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Webhook received and verified
 */
const handleS2SWebhook = async (req, res) => {
    try {
        const payload = req.body || {};
        console.log('[EASEBUZZ S2S WEBHOOK RECEIVED]', {
            txnid: payload.txnid,
            status: payload.status,
            easepayid: payload.easepayid,
            amount: payload.amount
        });

        const key = process.env.EASEBUZZ_KEY;
        const salt = process.env.EASEBUZZ_SALT;

        if (!key || !salt) {
            console.error('[EASEBUZZ S2S] Missing Easebuzz credentials in environment');
            return res.status(500).json({ status: 'error', message: 'Gateway not configured' });
        }

        // Verify incoming reverse SHA-512 hash formula:
        // salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
        const isValid = easebuzzService.verifyReverseHash(payload, key, salt);

        // If credentials are live, enforce signature check
        if (key !== 'your_production_merchant_key' && !isValid) {
            console.warn('[EASEBUZZ S2S] Signature verification failed for txnid:', payload.txnid);
            return res.status(400).json({
                status: 'failed',
                message: 'Invalid reverse SHA-512 hash signature'
            });
        }

        const txnid = payload.txnid;
        const rawStatus = String(payload.status || '').toLowerCase();
        const isSuccess = rawStatus === 'success';

        // Update corresponding ride / order in database
        const syncResult = await syncPaymentStatus({
            txnid,
            status: isSuccess ? 'success' : 'failed',
            easepayid: payload.easepayid,
            amount: payload.amount
        });

        console.log(`[EASEBUZZ S2S PROCESSED] txnid: ${txnid}, status: ${rawStatus}, syncResult:`, syncResult);

        return res.status(200).json({
            status: 'success',
            message: 'Webhook verified and processed successfully',
            txnid
        });
    } catch (err) {
        console.error('[EASEBUZZ S2S ERROR]', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

router.post('/webhook', handleS2SWebhook);
router.post('/s2s', handleS2SWebhook);

/**
/**
 * @swagger
 * /api/payments/response:
 *   get:
 *     summary: Browser Callback Endpoint (surl / furl)
 *     tags: [Payments]
 *   post:
 *     summary: Handle browser POST/GET redirect sent by Easebuzz after customer checkout
 *     tags: [Payments]
 */
const handleBrowserCallback = async (req, res) => {
    try {
        const data = req.method === 'POST' ? req.body : req.query;
        const txnid = data.txnid || data.txnId || req.query.txnid || data.orderId || req.query.orderId;
        const status = String(data.status || req.query.status || '').toLowerCase();
        const easebuzzid = data.easebuzzid || data.easepayid || req.query.easepayid || req.query.easebuzzid || '';
        const isSuccess = status === 'success' || status === 'paid';

        console.log(`[PAYMENT RESPONSE] Method: ${req.method}, txnid: ${txnid}, status: ${status}, easebuzzid: ${easebuzzid}`);

        // 1. Update Database / Payment Status Immediately
        if (isSuccess && txnid) {
            await syncPaymentStatus({
                txnid,
                status: 'success',
                easepayid: easebuzzid,
                amount: data.amount
            });
            console.log(`[PAYMENT RESPONSE] txnid ${txnid} marked as PAID in database.`);
        } else if (txnid && (status === 'failure' || status === 'usercancelled')) {
            await syncPaymentStatus({
                txnid,
                status: 'failed',
                easepayid: easebuzzid,
                amount: data.amount
            });
            console.log(`[PAYMENT RESPONSE] txnid ${txnid} marked as FAILED in database.`);
        }

        const appCallbackUrl = `yourrideapp://payment/callback?status=${isSuccess ? 'success' : 'failure'}&txnid=${txnid || ''}&easebuzzid=${easebuzzid}`;
        const androidIntentUrl = `intent://payment/callback?status=${isSuccess ? 'success' : 'failure'}&txnid=${txnid || ''}&easebuzzid=${easebuzzid}#Intent;scheme=yourrideapp;package=com.tab;end;`;

        // 2. Return HTML with Auto-Redirect + Android Intent + Tap Button
        return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? 'Payment Successful' : 'Payment Failed'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }
    .card {
      background: #1e293b;
      border-radius: 20px;
      padding: 36px 24px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      border: 1px solid #334155;
    }
    .icon {
      width: 72px;
      height: 72px;
      border-radius: 36px;
      background: ${isSuccess ? '#10b981' : '#ef4444'};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 36px;
    }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: ${isSuccess ? '#34d399' : '#f87171'}; }
    p { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
    .btn {
      display: block;
      width: 100%;
      background: ${isSuccess ? '#10b981' : '#3b82f6'};
      color: #ffffff;
      font-size: 17px;
      font-weight: 700;
      padding: 16px;
      border-radius: 12px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: opacity 0.2s;
    }
    .btn:active { opacity: 0.8; }
    .txn { font-size: 12px; color: #64748b; margin-top: 16px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '✓' : '✕'}</div>
    <h1>${isSuccess ? 'Payment Successful!' : 'Payment Cancelled'}</h1>
    <p>${isSuccess ? 'Returning to POS app and printing tickets...' : 'Returning to checkout screen...'}</p>
    
    <a id="returnBtn" class="btn" href="${androidIntentUrl}">
      ${isSuccess ? 'Tap to Return & Print Ticket' : 'Tap to Return to POS'}
    </a>
    <div class="txn">Txn ID: ${txnid || 'N/A'}</div>
  </div>
  <script>
    // Automatic redirect back to POS app via Custom Scheme & Intent
    function returnToApp() {
      try {
        window.location.href = "${appCallbackUrl}";
      } catch (e) {}
      setTimeout(function() {
        try {
          window.location.href = "${androidIntentUrl}";
        } catch (err) {}
      }, 300);
    }
    // Trigger immediately on page load
    returnToApp();
  </script>
</body>
</html>`);
    } catch (error) {
        console.error('Payment response handler error:', error);
        return res.status(500).send('Internal Server Error');
    }
};

router.all('/response', handleBrowserCallback);
router.all('/callback', handleBrowserCallback);
router.get('/response', handleBrowserCallback);
router.post('/response', handleBrowserCallback);
router.get('/callback', handleBrowserCallback);
router.post('/callback', handleBrowserCallback);


/**
 * @swagger
 * /api/payments/checkout/{id}:
 *   get:
 *     summary: Hosted checkout page with dynamic UPI QR code
 *     tags: [Payments]
 */
router.get('/checkout/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const baseUrl = getBaseUrl(req);
        const { upiId, name: merchantName } = getMerchantUpi();

        let ride = await findRide(id);
        let order = await findOrder(id);

        const amount = ride ? (ride.fare || ride.amount) : (order ? order.totalAmount : 0);
        const txnid = (ride ? ride.txnid : (order ? order.txnid : id)) || id;

        const upiUri = generateUpiUri({
            upiId,
            merchantName,
            amount,
            txnid,
            note: `Ride Payment ${txnid}`
        });

        const successRedirect = `${baseUrl}/api/payments/callback?status=success&txnid=${encodeURIComponent(txnid)}`;
        const failureRedirect = `${baseUrl}/api/payments/callback?status=failure&txnid=${encodeURIComponent(txnid)}`;

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ride Payment - Checkout</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: #0b0f19; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #131a29; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 28px 24px; width: 100%; max-width: 440px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
        .brand { font-size: 13px; font-weight: 800; letter-spacing: 2px; color: #818cf8; text-transform: uppercase; margin-bottom: 6px; }
        .title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .txnid { font-size: 12px; color: #94a3b8; margin-bottom: 20px; word-break: break-all; }
        .amount-badge { background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 16px; padding: 18px; margin-bottom: 24px; }
        .amount-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85; }
        .amount-val { font-size: 34px; font-weight: 800; margin-top: 4px; }
        .qr-wrapper { background: #ffffff; border-radius: 18px; padding: 16px; display: inline-flex; justify-content: center; align-items: center; margin-bottom: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .upi-hint { font-size: 12px; color: #cbd5e1; margin-bottom: 20px; line-height: 1.5; }
        .upi-id { font-weight: 700; color: #38bdf8; background: rgba(56,189,248,0.1); padding: 4px 10px; border-radius: 8px; display: inline-block; margin-top: 4px; }
        .btn { display: block; width: 100%; padding: 14px; border-radius: 14px; font-size: 14px; font-weight: 700; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; margin-bottom: 10px; }
        .btn-primary { background: #10b981; color: #ffffff; }
        .btn-primary:hover { background: #059669; }
        .btn-upi { background: #6366f1; color: #ffffff; }
        .btn-upi:hover { background: #4f46e5; }
        .btn-cancel { background: transparent; color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); }
        .btn-cancel:hover { background: rgba(255,255,255,0.05); color: #ef4444; }
        .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; margin-right: 6px; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.9); } }
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">Ethree Entertainment</div>
        <h1 class="title">Scan to Pay via UPI</h1>
        <div class="txnid">Ref: <code>${txnid}</code></div>

        <div class="amount-badge">
            <div class="amount-label">Payable Fare</div>
            <div class="amount-val">₹${Number(amount).toFixed(2)}</div>
        </div>

        <div class="qr-wrapper">
            <div id="qrcode"></div>
        </div>

        <div class="upi-hint">
            Scan using <strong>PhonePe, Google Pay, Paytm</strong> or any UPI App<br>
            <span class="upi-id">${upiId}</span>
        </div>

        <a href="${upiUri}" class="btn btn-upi" id="upiAppBtn">
            ⚡ Open in UPI App (Mobile / Tablet)
        </a>

        <button onclick="confirmPayment()" class="btn btn-primary" id="confirmBtn">
            <span class="status-dot"></span> I Have Completed Payment
        </button>

        <a href="${failureRedirect}" class="btn btn-cancel">Cancel Transaction</a>
    </div>

    <script>
        const upiUri = ${JSON.stringify(upiUri)};
        const txnid = ${JSON.stringify(txnid)};
        const successUrl = ${JSON.stringify(successRedirect)};

        new QRCode(document.getElementById("qrcode"), {
            text: upiUri,
            width: 200,
            height: 200,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });

        // Polling payment status
        let pollTimer = setInterval(async () => {
            try {
                const res = await fetch('/api/payments/status/' + encodeURIComponent(txnid));
                const data = await res.json();
                if (data.status === 'success' || data.isPaid) {
                    clearInterval(pollTimer);
                    window.location.href = successUrl;
                }
            } catch (e) {
                console.log('Status polling...', e);
            }
        }, 2000);

        function confirmPayment() {
            document.getElementById('confirmBtn').innerText = 'Verifying & Completing...';
            document.getElementById('confirmBtn').disabled = true;
            window.location.href = successUrl;
        }
    </script>
</body>
</html>`);
    } catch (err) {
        res.status(500).send(`Error rendering checkout: ${err.message}`);
    }
});

module.exports = router;
