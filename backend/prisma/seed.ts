import { PrismaClient, AccountType, Role, Tier, ListingStatus, Grade } from "@prisma/client";
import argon2 from "argon2";
import { customAlphabet } from "nanoid";

const prisma = new PrismaClient();
const ref = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

const naira = (n: number) => BigInt(n) * 100n;

// The chart of accounts. Without these every journal posting fails, so this
// runs first and is safe to re-run.
const SYSTEM_ACCOUNTS = [
  { code: "cash:paystack", name: "Cash held at Paystack", type: AccountType.ASSET },
  { code: "cash:bank", name: "Operating bank account", type: AccountType.ASSET },
  { code: "asset:inventory", name: "Inventory on hand", type: AccountType.ASSET },
  { code: "liability:seller_payable", name: "Owed to sellers", type: AccountType.LIABILITY },
  { code: "liability:vendor_payable", name: "Owed to vendors", type: AccountType.LIABILITY },
  { code: "liability:buyer_credit", name: "Trade-in credit owed to buyers", type: AccountType.LIABILITY },
  { code: "revenue:margin", name: "Margin on sales", type: AccountType.REVENUE },
  { code: "revenue:commission", name: "Commission on listings", type: AccountType.REVENUE },
  { code: "expense:delivery", name: "Delivery costs", type: AccountType.EXPENSE },
  { code: "expense:payment_fees", name: "Payment processor fees", type: AccountType.EXPENSE },
];

const PRODUCTS = [
  { slug: "iphone-13-128", brand: "Apple", model: "iPhone 13", variant: "128GB", category: "phone", releaseYear: 2021, baseNewKobo: naira(450_000) },
  { slug: "iphone-12-128", brand: "Apple", model: "iPhone 12", variant: "128GB", category: "phone", releaseYear: 2020, baseNewKobo: naira(380_000) },
  { slug: "iphone-11-64", brand: "Apple", model: "iPhone 11", variant: "64GB", category: "phone", releaseYear: 2019, baseNewKobo: naira(300_000) },
  { slug: "samsung-a54", brand: "Samsung", model: "Galaxy A54", variant: "128GB", category: "phone", releaseYear: 2023, baseNewKobo: naira(280_000) },
  { slug: "samsung-s23", brand: "Samsung", model: "Galaxy S23", variant: "256GB", category: "phone", releaseYear: 2023, baseNewKobo: naira(620_000) },
  { slug: "tecno-camon-20", brand: "Tecno", model: "Camon 20", variant: "256GB", category: "phone", releaseYear: 2023, baseNewKobo: naira(185_000) },
  { slug: "macbook-air-m1", brand: "Apple", model: "MacBook Air M1", variant: "8GB/256GB", category: "laptop", releaseYear: 2020, baseNewKobo: naira(750_000) },
  { slug: "hp-elitebook-840", brand: "HP", model: "EliteBook 840 G8", variant: "16GB/512GB", category: "laptop", releaseYear: 2021, baseNewKobo: naira(560_000) },
  { slug: "galaxy-watch-6", brand: "Samsung", model: "Galaxy Watch 6", variant: "44mm", category: "wearable", releaseYear: 2023, baseNewKobo: naira(165_000) },
  { slug: "airpods-pro-2", brand: "Apple", model: "AirPods Pro 2", variant: null, category: "audio", releaseYear: 2022, baseNewKobo: naira(185_000) },
];

async function main() {
  console.log("seeding ledger accounts");
  for (const account of SYSTEM_ACCOUNTS) {
    await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      create: account,
      update: { name: account.name },
    });
  }

  console.log("seeding products");
  for (const p of PRODUCTS) {
    await prisma.product.upsert({ where: { slug: p.slug }, create: p, update: p });
  }

  console.log("seeding vendors");
  const vendor = await prisma.vendor.upsert({
    where: { id: "seed-vendor-1" },
    create: {
      id: "seed-vendor-1",
      businessName: "Emeka Gadgets",
      contactName: "Emeka Nwachukwu",
      phone: "+2348062217745",
      location: "Shop 42, Computer Village, Ikeja",
      supplies: ["phones", "tablets"],
      paymentTerms: "Same day on pickup",
    },
    update: {},
  });

  console.log("seeding admin");
  const admin = await prisma.user.upsert({
    where: { phone: "+2348035550142" },
    create: {
      phone: "+2348035550142",
      email: "admin@gadgetvillage.ng",
      fullName: "Gadgetvillage Admin",
      // Change this before anything is deployed anywhere real.
      passwordHash: await argon2.hash("ChangeMe2026!", { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      role: Role.ADMIN,
      phoneVerifiedAt: new Date(),
      city: "Ikeja",
      state: "Lagos",
    },
    update: {},
  });

  console.log("seeding listings");
  const products = await prisma.product.findMany();
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const listings = [
    { slug: "iphone-12-128", tier: Tier.NEW, price: naira(385_000), cost: naira(352_000), stock: 6 },
    { slug: "samsung-a54", tier: Tier.NEW, price: naira(285_000), cost: naira(262_000), stock: 4 },
    { slug: "iphone-11-64", tier: Tier.UK_USED, price: naira(198_000), cost: naira(172_000), stock: 3, grade: Grade.EXCELLENT, battery: 91 },
    { slug: "macbook-air-m1", tier: Tier.NG_USED, price: naira(455_000), cost: naira(398_000), stock: 1, grade: Grade.GOOD, battery: 88 },
    { slug: "galaxy-watch-6", tier: Tier.NEW, price: naira(172_000), cost: naira(158_000), stock: 5 },
    { slug: "hp-elitebook-840", tier: Tier.NG_USED, price: naira(312_000), cost: naira(268_000), stock: 1, grade: Grade.GOOD },
  ];

  for (const l of listings) {
    const product = bySlug.get(l.slug);
    if (!product) continue;

    const exists = await prisma.listing.findFirst({ where: { productId: product.id, tier: l.tier } });
    if (exists) continue;

    await prisma.listing.create({
      data: {
        reference: ref(),
        productId: product.id,
        tier: l.tier,
        status: ListingStatus.LIVE,
        priceKobo: l.price,
        costKobo: l.cost,
        grade: l.grade ?? null,
        batteryHealth: l.battery ?? null,
        stockCount: l.stock,
        vendorId: l.tier === Tier.NEW ? vendor.id : null,
        photos: [],
        publishedAt: new Date(),
        descriptionMd:
          l.tier === Tier.NEW
            ? "Sealed, sourced from a Computer Village vendor we buy from every week."
            : "Checked in person at our Ikeja hub. Unlocked to all networks, IMEI clear.",
      },
    });
  }

  console.log(`done. admin login: +2348035550142 / ChangeMe2026!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
