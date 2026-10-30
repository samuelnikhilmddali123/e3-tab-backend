const mongoose = require('mongoose');
const uri = "mongodb+srv://Vercel-Admin-ethree_data:zEx6FeaB7XIaDOgr@ethree-data.asjikyd.mongodb.net/ethree_pos?retryWrites=true&w=majority";

async function run() {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const products = await db.collection('products').find({}).toArray();
    console.log("First 5 Products in live database:");
    products.slice(0,5).forEach((p, i) => console.log(`${i+1}. ${p.name} - ${p.price}`));
    process.exit(0);
}
run().catch(console.error);
