const crypto = require('crypto');

/**
 * Official Easebuzz Live Production Endpoints
 */
const EASEBUZZ_ENDPOINTS = {
    INITIATE: process.env.EASEBUZZ_URL || 'https://pay.easebuzz.in/payment/initiateLink',
    PAYMENT_PORTAL: 'https://pay.easebuzz.in/pay/',
    TRANSACTION_STATUS: 'https://dashboard.easebuzz.in/transaction/v2.1/retrieve',
    TRANSACTION_STATUS_V1: 'https://pay.easebuzz.in/transaction/v1/retrieve'
};


/**
 * Retrieve Easebuzz credentials from environment
 */
function getCredentials() {
    const key = process.env.EASEBUZZ_KEY;
    const salt = process.env.EASEBUZZ_SALT;

    if (!key || !salt) {
        throw new Error('EASEBUZZ_KEY or EASEBUZZ_SALT is not configured in environment variables');
    }

    return { key, salt };
}

/**
 * Production Sanitization Rules
 */
function sanitizeAmount(rawAmount) {
    const parsed = parseFloat(rawAmount || 0);
    if (isNaN(parsed) || parsed < 0) {
        throw new Error(`Invalid amount: ${rawAmount}`);
    }
    // Must be formatted as string with exactly 2 decimal places
    return parsed.toFixed(2);
}

function sanitizeProductInfo(rawInfo) {
    // Strictly alphanumeric, spaces, and hyphens/dots/underscores/commas. Max 45 chars.
    return (rawInfo || 'Ride Payment')
        .replace(/[^a-zA-Z0-9\s\-_.,]/g, '')
        .trim()
        .slice(0, 45) || 'Ride Payment';
}

function sanitizeFirstName(rawName) {
    // Alphabets and spaces only. Max 50 chars.
    return (rawName || 'Customer')
        .replace(/[^a-zA-Z\s]/g, '')
        .trim()
        .slice(0, 50) || 'Customer';
}

function sanitizePhone(rawPhone) {
    // Clean 10-digit number
    const cleaned = String(rawPhone || '').replace(/\D/g, '');
    const tenDigit = cleaned.slice(-10);
    return tenDigit.length === 10 ? tenDigit : '9999999999';
}

function sanitizeEmail(rawEmail) {
    const email = String(rawEmail || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? email : 'passenger@ethree.in';
}

/**
 * Live SHA-512 Hash Calculations
 */

/**
 * Initiate Payment Hash Formula:
 * key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt
 */
function generateInitiateHash({
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1 = '',
    udf2 = '',
    udf3 = '',
    udf4 = '',
    udf5 = '',
    udf6 = '',
    udf7 = '',
    udf8 = '',
    udf9 = '',
    udf10 = '',
    salt
}) {
    const hashString = [
        key,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        udf1 || '',
        udf2 || '',
        udf3 || '',
        udf4 || '',
        udf5 || '',
        udf6 || '',
        udf7 || '',
        udf8 || '',
        udf9 || '',
        udf10 || '',
        salt
    ].join('|');

    return crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
}

/**
 * Transaction Status Hash Formula:
 * key|txnid|salt
 */
function generateStatusHash({ key, txnid, salt }) {
    const hashString = `${key}|${txnid}|${salt}`;
    return crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
}

/**
 * Reverse Webhook & SURL Verification Hash Formula:
 * salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 */
function verifyReverseHash(payload, key, salt) {
    if (!payload || !payload.hash) {
        return false;
    }

    const {
        status = '',
        udf10 = '',
        udf9 = '',
        udf8 = '',
        udf7 = '',
        udf6 = '',
        udf5 = '',
        udf4 = '',
        udf3 = '',
        udf2 = '',
        udf1 = '',
        email = '',
        firstname = '',
        productinfo = '',
        amount = '',
        txnid = '',
        hash = ''
    } = payload;

    const hashString = [
        salt,
        status,
        udf10 || '',
        udf9 || '',
        udf8 || '',
        udf7 || '',
        udf6 || '',
        udf5 || '',
        udf4 || '',
        udf3 || '',
        udf2 || '',
        udf1 || '',
        email,
        firstname,
        productinfo,
        amount,
        txnid,
        key
    ].join('|');

    const calculatedHash = crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
    const matches = calculatedHash === String(hash).toLowerCase();

    if (!matches) {
        console.warn('[EASEBUZZ REVERSE HASH MISMATCH]');
        console.warn(`Calculated: ${calculatedHash}`);
        console.warn(`Received:   ${hash}`);
    }

    return matches;
}

/**
 * Initiate Payment with Easebuzz (Production Mode Only)
 */
async function initiatePayment({
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
    udf1 = '',
    udf2 = '',
    udf3 = '',
    udf4 = '',
    udf5 = '',
    udf6 = '',
    udf7 = '',
    udf8 = '',
    udf9 = '',
    udf10 = ''
}) {
    const { key, salt } = getCredentials();

    const formattedAmount = sanitizeAmount(amount);
    const safeProductInfo = sanitizeProductInfo(productinfo);
    const safeFirstName = sanitizeFirstName(firstname);
    const safePhone = sanitizePhone(phone);
    const safeEmail = sanitizeEmail(email);

    // Compute initiate hash
    const hash = generateInitiateHash({
        key,
        txnid,
        amount: formattedAmount,
        productinfo: safeProductInfo,
        firstname: safeFirstName,
        email: safeEmail,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
        udf6,
        udf7,
        udf8,
        udf9,
        udf10,
        salt
    });

    // Easebuzz Form-Urlencoded Body
    // Rule: When posting form-urlencoded data to Easebuzz, only append non-empty UDF fields
    const params = new URLSearchParams();
    params.append('key', key);
    params.append('txnid', txnid);
    params.append('amount', formattedAmount);
    params.append('productinfo', safeProductInfo);
    params.append('firstname', safeFirstName);
    params.append('email', safeEmail);
    params.append('phone', safePhone);
    params.append('surl', surl);
    params.append('furl', furl);
    params.append('hash', hash);

    const udfs = { udf1, udf2, udf3, udf4, udf5, udf6, udf7, udf8, udf9, udf10 };
    for (const [k, v] of Object.entries(udfs)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            params.append(k, String(v).trim());
        }
    }

    const iframeVal = process.env.EASEBUZZ_IFRAME;
    if (iframeVal !== undefined && iframeVal !== null && iframeVal !== '') {
        params.append('iframe', String(iframeVal));
    }

    console.log(`[EASEBUZZ INITIATE] Calling ${EASEBUZZ_ENDPOINTS.INITIATE} for txnid: ${txnid}, amount: ${formattedAmount}`);

    const response = await fetch(EASEBUZZ_ENDPOINTS.INITIATE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: params.toString()
    });

    const result = await response.json();

    if (result.status === 1) {
        const accessKey = result.data;
        const paymentUrl = (typeof accessKey === 'string' && accessKey.startsWith('http'))
            ? accessKey
            : `${EASEBUZZ_ENDPOINTS.PAYMENT_PORTAL}${accessKey}`;

        return {
            status: 1,
            success: true,
            payment_url: paymentUrl,
            url: paymentUrl, // backwards compatible
            access_key: accessKey,
            txnid
        };
    } else {
        const errorMsg = result.error_desc || result.data || 'Easebuzz gateway initiation failed';
        console.error('[EASEBUZZ INITIATE FAILED]', errorMsg);
        throw new Error(errorMsg);
    }
}

/**
 * Retrieve Transaction Status via Easebuzz Transaction Status API (v2.1)
 */
async function retrieveTransactionStatus(txnid) {
    const { key, salt } = getCredentials();

    if (!txnid) {
        throw new Error('Transaction reference (txnid) is required');
    }

    const hash = generateStatusHash({ key, txnid, salt });

    const params = new URLSearchParams();
    params.append('key', key);
    params.append('txnid', txnid);
    params.append('hash', hash);

    console.log(`[EASEBUZZ RETRIEVE] Checking status for txnid: ${txnid}`);

    let result = null;

    // 1. Try v2.1 retrieve
    try {
        const response = await fetch(EASEBUZZ_ENDPOINTS.TRANSACTION_STATUS, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params.toString()
        });
        result = await response.json();
    } catch (err) {
        console.warn('[EASEBUZZ RETRIEVE v2.1 warning]', err.message);
    }

    // 2. If v2.1 failed or not found, try v1 retrieve endpoint
    if (!result || !result.status) {
        try {
            const responseV1 = await fetch(EASEBUZZ_ENDPOINTS.TRANSACTION_STATUS_V1, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: params.toString()
            });
            const resultV1 = await responseV1.json();
            if (resultV1 && (resultV1.status === 1 || resultV1.status === true || resultV1.msg?.status)) {
                result = resultV1;
            }
        } catch (errV1) {
            console.warn('[EASEBUZZ RETRIEVE v1 warning]', errV1.message);
        }
    }

    // Easebuzz retrieve response format:
    // Can be { status: true, msg: [ { ... } ] } or { status: true, msg: { ... } } or { msg: ... }
    const txnRecord = Array.isArray(result?.msg)
        ? result.msg[0]
        : (result?.msg && typeof result.msg === 'object' ? result.msg : (Array.isArray(result?.data) ? result.data[0] : (result?.data || result)));

    const rawStatus = String(txnRecord?.status || '').toLowerCase();
    const isSuccess = rawStatus === 'success';
    const isFailed = rawStatus === 'failure' || rawStatus === 'usercancelled';
    const normalizedStatus = isSuccess ? 'success' : (isFailed ? 'failure' : 'pending');

    return {
        status: normalizedStatus,
        isPaid: isSuccess,
        txnid,
        amount: txnRecord?.amount,
        easepayid: txnRecord?.easepayid,
        rawStatus: txnRecord?.status,
        data: txnRecord || result
    };
}



module.exports = {
    EASEBUZZ_ENDPOINTS,
    getCredentials,
    sanitizeAmount,
    sanitizeProductInfo,
    sanitizeFirstName,
    sanitizePhone,
    sanitizeEmail,
    generateInitiateHash,
    generateStatusHash,
    verifyReverseHash,
    initiatePayment,
    retrieveTransactionStatus
};
