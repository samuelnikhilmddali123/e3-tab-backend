const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Schemas (Simplified for migration)
const ticketSchema = new mongoose.Schema({}, { strict: false });
const userSchema = new mongoose.Schema({}, { strict: false });
const productSchema = new mongoose.Schema({}, { strict: false });

const migrate = async () => {
    console.log('🚀 Starting Migration: Local DB -> Cloud DB');

    const LOCAL_URI = 'mongodb://localhost:27017/ethree_pos';
    const CLOUD_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!CLOUD_URI) {
        console.error('❌ Cloud URI not found in .env');
        process.exit(1);
    }

    try {
        // Connect to Local
        console.log('Connecting to Local DB...');
        const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
        const LocalTicket = localConn.model('Ticket', ticketSchema);
        const LocalUser = localConn.model('User', userSchema);
        const LocalProduct = localConn.model('Product', productSchema);
        console.log('✅ Local Connected');

        // Connect to Cloud
        console.log('Connecting to Cloud DB...');
        const cloudConn = await mongoose.createConnection(CLOUD_URI).asPromise();
        const CloudTicket = cloudConn.model('Ticket', ticketSchema);
        const CloudUser = cloudConn.model('User', userSchema);
        const CloudProduct = cloudConn.model('Product', productSchema);
        console.log('✅ Cloud Connected');

        // --- MIGRATE TICKETS ---
        const tickets = await LocalTicket.find({});
        console.log(`Found ${tickets.length} tickets locally.`);
        if (tickets.length > 0) {
            for (const t of tickets) {
                // Check if exists
                const exists = await CloudTicket.findOne({ id: t.get('id') });
                if (!exists) {
                    await CloudTicket.create(t.toObject());
                    process.stdout.write('.');
                }
            }
        }
        console.log('\nTickets Migrated.');

        // --- MIGRATE USERS ---
        const users = await LocalUser.find({});
        console.log(`Found ${users.length} users locally.`);
        if (users.length > 0) {
            for (const u of users) {
                const exists = await CloudUser.findOne({ email: u.get('email') });
                if (!exists) {
                    await CloudUser.create(u.toObject());
                    process.stdout.write('.');
                }
            }
        }
        console.log('\nUsers Migrated.');

        // --- MIGRATE PRODUCTS ---
        const products = await LocalProduct.find({});
        console.log(`Found ${products.length} products locally.`);
        if (products.length > 0) {
            for (const p of products) {
                const exists = await CloudProduct.findOne({ name: p.get('name') }); // Assuming name is unique or sufficient
                if (!exists) {
                    await CloudProduct.create(p.toObject());
                    process.stdout.write('.');
                }
            }
        }
        console.log('\nProducts Migrated.');

        console.log('🎉 Migration Complete!');
        process.exit(0);

    } catch (e) {
        console.error('Migration Failed:', e);
        process.exit(1);
    }
};

migrate();
