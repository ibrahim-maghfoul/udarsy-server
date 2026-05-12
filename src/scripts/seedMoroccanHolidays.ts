import { connectDatabase } from '../config/database';
import { MoroccanHolidaysController } from '../controllers/moroccanHolidaysController';

async function main() {
    await connectDatabase();
    await MoroccanHolidaysController.seed();
    console.log('Done — 42 Moroccan holidays seeded (2025–2027).');
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
