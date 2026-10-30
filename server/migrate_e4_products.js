const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables for target DB
dotenv.config({ path: path.join(__dirname, '.env') });

const TARGET_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const SOURCE_URI = "mongodb+srv://Vercel-Admin-EFOUR:52sxxM83PIPKobvk@efour.ojwn6t6.mongodb.net/ethree?retryWrites=true&w=majority";

// Product Schema (Simplified/Flexible for migration)
const productSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    image: { type: String },
    stall: { type: String },
    status: { type: String, enum: ['on', 'off'], default: 'on' },
    type: { type: String },
    allowedPos: { type: [String], default: [] }
}, { strict: false });

async function migrate() {
    console.log('🚀 Starting Product Migration: e4 -> e3');

    if (!TARGET_URI) {
        console.error('❌ Target URI not found in .env');
        process.exit(1);
    }

    let sourceConn, targetConn;

    try {
        // Connect to Source
        console.log('Connecting to Source DB (e4)...');
        sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
        const SourceProduct = sourceConn.model('Product', productSchema);
        console.log('✅ Source Connected');

        // Connect to Target
        console.log('Connecting to Target DB (e3)...');
        targetConn = await mongoose.createConnection(TARGET_URI).asPromise();
        const TargetProduct = targetConn.model('Product', productSchema);
        console.log('✅ Target Connected');

        // Fetch Source Products
        const sourceProducts = await SourceProduct.find({});
        console.log(`Found ${sourceProducts.length} products in source.`);

        if (sourceProducts.length === 0) {
            console.log('No products to migrate.');
            process.exit(0);
        }

        let migratedCount = 0;
        let updatedCount = 0;

        for (const sp of sourceProducts) {
            const productData = sp.toObject();
            delete productData._id; // Remove source internal ID
            delete productData.__v;

            // Ensure allowedPos is initialized if missing
            if (!productData.allowedPos) {
                productData.allowedPos = [];
            }

            // Upsert based on 'id'
            const result = await TargetProduct.findOneAndUpdate(
                { id: productData.id },
                { $set: productData },
                { upsert: true, new: true, runValidators: false }
            );

            if (result) {
                process.stdout.write('.');
                migratedCount++;
            }
        }

        console.log(`\n\n🎉 Migration Complete!`);
        console.log(`Total Products Processed: ${migratedCount}`);

        await sourceConn.close();
        await targetConn.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration Failed:', error);
        if (sourceConn) await sourceConn.close();
        if (targetConn) await targetConn.close();
        process.exit(1);
    }
}

migrate();
