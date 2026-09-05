import { hashSync } from "bcryptjs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ExtractionStatus,
  PoEventKind,
  PoStage,
  Role,
} from "../src/generated/prisma/enums";
import { BUYERS, buyerContact } from "./seed/buyers";
import { PRICE_EPOCH, PRODUCTS } from "./seed/products";
import { PO_STAGES_ORDER, planDates, planOrder } from "./seed/orders";
import { createRng } from "./seed/rng";

const RESET = process.argv.includes("--reset");
const WINDOW_START = new Date("2025-09-04T00:00:00+08:00");

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

/** Everything except _prisma_migrations, so the schema itself survives. */
async function reset() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "LineItem", "PoStageEvent", "PurchaseOrder", "Extraction", "Document",
      "ProductImage", "ProductPrice", "Product", "Buyer",
      "AccessRequest", "LoginAttempt", "PasswordResetToken",
      "VerificationToken", "Account", "User"
    RESTART IDENTITY CASCADE;
  `);
}

async function main() {
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL;
  if (!superAdminEmail) {
    throw new Error(
      "SEED_SUPER_ADMIN_EMAIL is not set. The seed creates that user as " +
        "SUPER_ADMIN so you are never locked out — set it in .env.local first.",
    );
  }

  const existing = await prisma.purchaseOrder.count();
  if (existing > 0 && !RESET) {
    console.error(
      `Refusing to seed: ${existing} purchase orders already exist.\n` +
        "Re-run with --reset to truncate every table and rebuild.",
    );
    process.exitCode = 1;
    return;
  }
  if (RESET) await reset();

  const started = Date.now();
  const rng = createRng();
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // ── Users ────────────────────────────────────────────────────────────────
  // Name from the local part, unless SEED_SUPER_ADMIN_NAME overrides it — a
  // personal address rarely reads as a person's name.
  const localPart = superAdminEmail.split("@")[0];
  const adminName =
    process.env.SEED_SUPER_ADMIN_NAME ||
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");

  const admin = await prisma.user.create({
    data: {
      id: rng.id("usr"),
      email: superAdminEmail,
      name: adminName || "Super Admin",
      image: null,
      role: Role.SUPER_ADMIN,
      emailVerified: now,
    },
  });

  const member = await prisma.user.create({
    data: {
      id: rng.id("usr"),
      email: "aisha@lovinghandsportal.com",
      name: "Aisha Rahman",
      image: null,
      role: Role.MEMBER,
      passwordHash: hashSync("Password123!", 12),
      mustChangePassword: true,
      emailVerified: now,
    },
  });

  // ── Buyers ───────────────────────────────────────────────────────────────
  const buyerIds = BUYERS.map(() => rng.id("byr"));
  await prisma.buyer.createMany({
    data: BUYERS.map((buyer, i) => ({
      id: buyerIds[i],
      name: buyer.name,
      contactName: null,
      paymentTerms: buyer.terms,
      ...buyerContact(buyer.name),
    })),
  });

  // ── Products, one price row each at the epoch ────────────────────────────
  const productIds = PRODUCTS.map(() => rng.id("prd"));
  await prisma.product.createMany({
    data: PRODUCTS.map((product, i) => ({
      id: productIds[i],
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      listPrice: product.base.toFixed(2),
    })),
  });
  await prisma.productPrice.createMany({
    data: PRODUCTS.map((product, i) => ({
      id: rng.id("prc"),
      productId: productIds[i],
      price: product.base.toFixed(2),
      from: PRICE_EPOCH,
      setById: admin.id,
    })),
  });
  await prisma.productImage.createMany({
    data: PRODUCTS.flatMap((product, i) =>
      Array.from({ length: product.images }, (_, n) => ({
        id: rng.id("img"),
        productId: productIds[i],
        r2Key: `products/${productIds[i]}/${n + 1}.webp`,
        thumbKey: `products/${productIds[i]}/${n + 1}.1600.webp`,
        position: n,
        sizeBytes: rng.int(80_000, 900_000),
      })),
    ),
  });

  // ── Purchase orders ──────────────────────────────────────────────────────
  const dates = planDates(rng, WINDOW_START, yesterday);
  const buyerWeights = BUYERS.map((b) => b.weight);

  const documents: object[] = [];
  const extractions: object[] = [];
  const orders: object[] = [];
  const lineItems: object[] = [];
  const stageEvents: object[] = [];
  const perBuyerNumber = new Map<number, number>();

  for (const poDate of dates) {
    const buyerIndex = rng.weighted(buyerWeights);
    const plan = planOrder(rng, poDate, buyerIndex, BUYERS[buyerIndex].valueScale, now);

    const documentId = rng.id("doc");
    const orderId = rng.id("po_");
    const uploader = plan.uploadedByAisha ? member : admin;
    const sequence = (perBuyerNumber.get(buyerIndex) ?? 0) + 1;
    perBuyerNumber.set(buyerIndex, sequence);
    const poNumber = `PO-${poDate.getFullYear()}-${String(sequence).padStart(4, "0")}`;

    const confirmed = {
      poNumber,
      buyerName: BUYERS[buyerIndex].name,
      poDate: plan.poDate.toISOString().slice(0, 10),
      deliveryDate: plan.deliveryDate.toISOString().slice(0, 10),
      currency: "MYR",
      subtotal: plan.subtotal.toFixed(2),
      tax: "0.00",
      total: plan.total.toFixed(2),
      lineItems: plan.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice.toFixed(4),
        amount: line.amount.toFixed(2),
      })),
    };

    documents.push({
      id: documentId,
      r2Key: `seed/${documentId}.pdf`,
      originalName: `${poNumber}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: plan.sizeBytes,
      pageCount: plan.pageCount,
      uploadedById: uploader.id,
      uploadedAt: plan.poDate,
    });

    extractions.push({
      id: rng.id("ext"),
      documentId,
      status: ExtractionStatus.CONFIRMED,
      rawJson: confirmed,
      confidence: plan.confidence,
      model: "claude-sonnet-5",
      startedAt: plan.poDate,
      finishedAt: plan.poDate,
    });

    orders.push({
      id: orderId,
      poNumber,
      buyerId: buyerIds[buyerIndex],
      poDate: plan.poDate,
      deliveryDate: plan.deliveryDate,
      currency: "MYR",
      paymentTerms: BUYERS[buyerIndex].terms,
      subtotal: plan.subtotal.toFixed(2),
      tax: "0.00",
      total: plan.total.toFixed(2),
      documentId,
      confirmedById: uploader.id,
      confirmedAt: plan.poDate,
      stage: plan.stage,
      stageChangedAt: plan.stageChangedAt,
    });

    for (const line of plan.lines) {
      lineItems.push({
        id: rng.id("lin"),
        purchaseOrderId: orderId,
        position: line.position,
        description: line.description,
        productId: productIds[line.productIndex],
        quantity: line.quantity.toFixed(3),
        unit: line.unit,
        unitPrice: line.unitPrice.toFixed(4),
        amount: line.amount.toFixed(2),
      });
    }

    // Stage history, walked forward from the PO date. The first event is the
    // System confirm; later ones alternate between the two users.
    const reached = PO_STAGES_ORDER.slice(0, PO_STAGES_ORDER.indexOf(plan.stage) + 1);
    const leadDays = rng.int(12, 22);
    let previous: PoStage | null = null;
    reached.forEach((stage, index) => {
      const at = new Date(plan.poDate);
      at.setUTCDate(
        at.getUTCDate() + Math.round((leadDays * index) / Math.max(1, reached.length - 1)),
      );
      stageEvents.push({
        id: rng.id("evt"),
        purchaseOrderId: orderId,
        kind: PoEventKind.STAGE,
        fromStage: previous,
        toStage: stage,
        changedById: index === 0 ? null : index % 2 === 1 ? admin.id : member.id,
        changedAt: at > now ? now : at,
      });
      previous = stage;
    });
  }

  await prisma.document.createMany({ data: documents as never });
  await prisma.extraction.createMany({ data: extractions as never });
  await prisma.purchaseOrder.createMany({ data: orders as never });
  await prisma.lineItem.createMany({ data: lineItems as never });
  await prisma.poStageEvent.createMany({ data: stageEvents as never });

  // ── Intake backlog: extractions with no PO yet, in the last two days ──────
  const backlog: Array<{ status: ExtractionStatus; error?: string }> = [
    { status: ExtractionStatus.SUCCEEDED },
    { status: ExtractionStatus.SUCCEEDED },
    { status: ExtractionStatus.SUCCEEDED },
    { status: ExtractionStatus.RUNNING },
    { status: ExtractionStatus.RUNNING },
    { status: ExtractionStatus.FAILED, error: "Could not read page 2: the scan is too dark to extract line items." },
  ];

  for (const entry of backlog) {
    const documentId = rng.id("doc");
    const uploadedAt = new Date(now);
    uploadedAt.setHours(uploadedAt.getHours() - rng.int(1, 46));
    const buyerIndex = rng.weighted(buyerWeights);
    const plan = planOrder(rng, uploadedAt, buyerIndex, BUYERS[buyerIndex].valueScale, now);

    await prisma.document.create({
      data: {
        id: documentId,
        r2Key: `seed/${documentId}.pdf`,
        originalName: `scan-${documentId.slice(-6)}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: plan.sizeBytes,
        pageCount: plan.pageCount,
        uploadedById: rng.chance(0.4) ? member.id : admin.id,
        uploadedAt,
        extraction: {
          create: {
            id: rng.id("ext"),
            status: entry.status,
            confidence:
              entry.status === ExtractionStatus.SUCCEEDED ? plan.confidence : null,
            error: entry.error ?? null,
            model: "claude-sonnet-5",
            startedAt: uploadedAt,
            finishedAt:
              entry.status === ExtractionStatus.RUNNING ? null : uploadedAt,
            rawJson:
              entry.status === ExtractionStatus.FAILED
                ? undefined
                : {
                    poNumber: `PO-${now.getFullYear()}-${rng.int(9000, 9999)}`,
                    buyerName: BUYERS[buyerIndex].name,
                    poDate: uploadedAt.toISOString().slice(0, 10),
                    currency: "MYR",
                    subtotal: plan.subtotal.toFixed(2),
                    tax: "0.00",
                    total: plan.total.toFixed(2),
                    lineItems: plan.lines.map((line) => ({
                      description: line.description,
                      quantity: line.quantity,
                      unit: line.unit,
                      unitPrice: line.unitPrice.toFixed(4),
                      amount: line.amount.toFixed(2),
                    })),
                  },
          },
        },
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    buyers: await prisma.buyer.count(),
    products: await prisma.product.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    lineItems: await prisma.lineItem.count(),
    stageEvents: await prisma.poStageEvent.count(),
    extractions: await prisma.extraction.count(),
  };
  console.table(counts);
  console.log(`Seeded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
