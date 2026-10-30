const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    passengerName: { type: String, default: 'Passenger' },
    passengerPhone: { type: String, default: '9999999999' },
    passengerEmail: { type: String, default: 'passenger@ethree.in' },
    rideName: { type: String, default: 'Ride Fare' },
    pickupLocation: { type: String },
    dropLocation: { type: String },
    fare: { type: Number, required: true },
    amount: { type: Number },
    txnid: { type: String, required: true, unique: true, index: true },
    easepayid: { type: String },
    gatewayTransactionId: { type: String },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'failed', 'cancelled'], 
        default: 'pending',
        index: true
    },
    rideStatus: { 
        type: String, 
        enum: ['requested', 'accepted', 'in_progress', 'completed', 'cancelled'], 
        default: 'completed' 
    },
    paymentGateway: { type: String, default: 'easebuzz' },
    udf1: { type: String },
    udf2: { type: String },
    udf3: { type: String },
    udf4: { type: String },
    udf5: { type: String },
    paidAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Ride || mongoose.model('Ride', rideSchema);
