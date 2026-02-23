const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    let settings = await prisma.globalSettings.findFirst();
    
    if (!settings) {
      console.log("No settings found, creating default...");
      settings = await prisma.globalSettings.create({
        data: {
          inventoryIntervalMinutes: 60,
          updateCheckIntervalMinutes: 120
        }
      });
    }
    console.log("SUCCESS:", settings);
  } catch (e) {
    console.error("PRISMA ERROR:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
