const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');

/**
 * Find ride by transaction reference or MongoDB ObjectId
 */
async function findRide(ref) {
    if (!ref) return null;
    let ride = await Ride.findOne({ txnid: ref });
    if (!ride && mongoose.Types.ObjectId.isValid(ref)) {
        ride = await Ride.findById(ref);
    }
    if (!ride) {
        ride = await Ride.findOne({ udf1: ref });
    }
    return ride;
}

/**
 * Find order by transaction reference or MongoDB ObjectId
 */
async function findOrder(ref) {
    if (!ref) return null;
    let order = await Order.findOne({ txnid: ref });
    if (!order && mongoose.Types.ObjectId.isValid(ref)) {
        order = await Order.findById(ref);
    }
    return order;
}

/**
 * Update payment status across Ride, Order, and Ticket
 */
async function syncPaymentStatus({ txnid, status, easepayid, amount }) {
    const isSuccess = String(status || '').toLowerCase() === 'success' || String(status || '').toLowerCase() === 'paid';
    const finalPaymentStatus = isSuccess ? 'paid' : 'failed';
    const now = new Date();

    const results = {
        txnid,
        status: finalPaymentStatus,
        rideUpdated: false,
        orderUpdated: false,
        ticketUpdated: false
    };

    // 1. Update Ride Record
    try {
        const ride = await findRide(txnid);
        if (ride) {
            ride.paymentStatus = finalPaymentStatus;
            if (isSuccess) {
                ride.paidAt = now;
                if (easepayid) {
                    ride.easepayid = easepayid;
                    ride.gatewayTransactionId = easepayid;
                }
            }
            await ride.save();
            results.rideUpdated = true;
            console.log(`[PAYMENT SYNC] Ride ${ride._id} (txnid: ${txnid}) updated to ${finalPaymentStatus}`);
        }
    } catch (err) {
        console.error('[PAYMENT SYNC] Error updating Ride:', err.message);
    }

    // 2. Update Order Record
    try {
        const order = await findOrder(txnid);
        if (order) {
            order.paymentStatus = finalPaymentStatus;
            if (isSuccess) {
                order.paidAt = now;
                if (easepayid) {
                    order.gatewayTransactionId = easepayid;
                }
            }
            await order.save();
            results.orderUpdated = true;
            console.log(`[PAYMENT SYNC] Order ${order._id} (txnid: ${txnid}) updated to ${finalPaymentStatus}`);
        }
    } catch (err) {
        console.error('[PAYMENT SYNC] Error updating Order:', err.message);
    }

    // 3. Update or Create Ticket Record
    try {
        let ticket = await Ticket.findOne({ id: txnid });
        if (ticket) {
            if (isSuccess) {
                ticket.paymentMode = 'upi';
                ticket.status = 'valid';
            } else {
                ticket.status = 'invalid';
            }
            await ticket.save();
            results.ticketUpdated = true;
            console.log(`[PAYMENT SYNC] Ticket ${ticket.id} updated to ${ticket.status}`);
        } else if (isSuccess) {
            // Auto-create Master Ticket from Ride if missing
            const ride = await findRide(txnid);
            const totalAmount = Number(amount || ride?.amount || ride?.fare || 0);
            const rideName = ride?.rideName || 'Ride Ticket';
            const match = rideName.match(/^(.+?)\s*\(x(\d+)\)$/i);
            const itemName = match ? match[1].trim() : rideName;
            const quantity = match ? (parseInt(match[2], 10) || 1) : 1;
            const unitPrice = quantity > 0 ? Math.round(totalAmount / quantity) : totalAmount;
            const posId = (ride?.passengerEmail && ride.passengerEmail.toLowerCase().includes('pos2')) ? 'pos2' : 'pos1';
            const createdBy = ride?.passengerName || 'POS Terminal 1';
            const mobile = ride?.passengerPhone || '';
            const dateStr = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

            ticket = await Ticket.create({
                id: txnid,
                amount: totalAmount,
                date: dateStr,
                items: [{
                    id: itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    name: itemName,
                    price: unitPrice,
                    quantity: quantity
                }],
                status: 'valid',
                mobile: mobile,
                paymentMode: 'upi',
                createdBy: createdBy,
                posId: posId,
                createdAt: now,
                isCoupon: false
            });

            // Create individual coupons
            for (let i = 0; i < quantity; i++) {
                await Ticket.create({
                    id: `${txnid}-${i}`,
                    amount: unitPrice,
                    date: dateStr,
                    items: [{
                        id: itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        name: itemName,
                        price: unitPrice,
                        quantity: 1
                    }],
                    status: 'valid',
                    mobile: mobile,
                    paymentMode: 'upi',
                    createdBy: createdBy,
                    posId: posId,
                    createdAt: now,
                    isCoupon: true,
                    parentId: txnid
                });
            }

            results.ticketUpdated = true;
            console.log(`[PAYMENT SYNC] Auto-created Ticket ${txnid} with ${quantity} coupons`);
        }
    } catch (err) {
        console.error('[PAYMENT SYNC] Error updating/creating Ticket:', err.message);
    }

    // 4. If neither Ride nor Order existed, create a completed Ride record so subsequent status checks find it
    if (!results.rideUpdated && !results.orderUpdated && txnid && isSuccess) {
        try {
            await Ride.create({
                txnid,
                fare: Number(amount) || 0,
                amount: Number(amount) || 0,
                paymentStatus: 'paid',
                rideStatus: 'completed',
                paymentGateway: 'easebuzz',
                easepayid: easepayid || '',
                gatewayTransactionId: easepayid || '',
                paidAt: now
            });
            results.rideUpdated = true;
            console.log(`[PAYMENT SYNC] Auto-created paid Ride record for txnid: ${txnid}`);
        } catch (e) {
            console.error('[PAYMENT SYNC] Error creating fallback Ride:', e.message);
        }
    }

    return results;
}


module.exports = {
    findRide,
    findOrder,
    syncPaymentStatus
};
