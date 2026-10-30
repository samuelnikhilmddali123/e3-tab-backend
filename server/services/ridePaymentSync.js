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

    // 3. Update Ticket Record (if exists)
    try {
        const ticket = await Ticket.findOne({ id: txnid });
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
        }
    } catch (err) {
        console.error('[PAYMENT SYNC] Error updating Ticket:', err.message);
    }

    return results;
}

module.exports = {
    findRide,
    findOrder,
    syncPaymentStatus
};
