import {
  CatalogLabelKind,
  ExtractionStatus,
  PoEventKind,
  PoStage,
  Role,
  WebOrderStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { webOrderReference } from "@/lib/web-order-number";
import { MAX_ORDERS, type TestDataCounts } from "@/lib/test-data-shape";

// Re-exported so a server caller has one import, as queries/demand does.
export { MAX_ORDERS, type TestDataCounts };

/**
 * Throwaway data for eyeballing the portal: buyers, products across several
 * markets, confirmed purchase orders spread over the stages, a review queue
 * and a couple of shop orders. Generated from `/admin`, deleted from the same
 * card.
 *
 * **Every row this writes carries an id beginning `tst`**, and that prefix is
 * the only thing `deleteTestData` looks at. Everything the running app creates
 * gets a Prisma cuid, so nothing a person entered can be caught by the delete
 * — the same rule `scripts/import-catalog.ts` uses to tell the seed's own rows
 * apart, and the reason neither works by name or SKU, which a person could
 * have typed.
 *
 * Generating is refused outside development and preview; see `blockedReason`.
 */
export const TEST_ID_PREFIX = "tst";

export const isTestId = (id: string) => id.startsWith(TEST_ID_PREFIX);

/** 24 characters, like a cuid, so nothing downstream reads it as short. */
const testId = () =>
  TEST_ID_PREFIX +
  Math.random().toString(36).slice(2, 12).padEnd(10, "0") +
  Date.now().toString(36).slice(-11).padStart(11, "0");

/**
 * On production, generating asks the caller to type a word back first — the
 * friction every destructive control in this app already uses, and the only
 * thing standing between a mis-click and hundreds of rows in the live
 * database. Checked in the action, not only in the card: a typed word that
 * the server never verifies is decoration.
 *
 * `VERCEL_ENV` is Vercel's own and is unset locally, which is why the test is
 * for the production value rather than for the absence of the others.
 */
export const isProduction = () => process.env.VERCEL_ENV === "production";

/** What the caller types to confirm. Lower-cased and trimmed before comparing. */
export const PRODUCTION_CONFIRM = "production";

export const confirmationMatches = (typed: string) =>
  typed.trim().toLowerCase() === PRODUCTION_CONFIRM;

const rand = (min: number, max: number) =>
  min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[rand(0, items.length - 1)];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Midnight UTC, because `@db.Date` truncates in UTC and would shift the day. */
const utcDay = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

const STAGES = [
  PoStage.ORDER_PLACED,
  PoStage.IN_PRODUCTION,
  PoStage.QC_PASSED,
  PoStage.IN_WAREHOUSE,
  PoStage.DELIVERING,
  PoStage.DELIVERED,
] as const;

/**
 * Age in days → stage, so the board is not one colour: a young order is still
 * being made and an old one has arrived. `prisma/seed/orders.ts` does the same
 * with noise; this is the same idea without the seeded rng, because test data
 * wants variety rather than reproducibility.
 */
export function stageForAge(ageDays: number): PoStage {
  const noisy = ageDays + rand(-3, 3);
  if (noisy < 4) return PoStage.ORDER_PLACED;
  if (noisy < 10) return PoStage.IN_PRODUCTION;
  if (noisy < 16) return PoStage.QC_PASSED;
  if (noisy < 24) return PoStage.IN_WAREHOUSE;
  if (noisy < 34) return PoStage.DELIVERING;
  return PoStage.DELIVERED;
}

const BUYERS = [
  { name: "Test — Batu Trading", terms: "30 days" },
  { name: "Test — Cempaka Distribution", terms: "45 days" },
  { name: "Test — Damai Retail Group", terms: "60 days" },
  { name: "Test — Enggang Export", terms: "30 days" },
] as const;

/**
 * Deliberately spread across markets, brands and categories: the dashboard's
 * market mix, the catalogue's market view and the brand filter all read these
 * columns, and a single-market catalogue shows none of them working.
 */
const PRODUCTS = [
  { name: "Test Shower Cream 1L", variant: "Goat's Milk", brand: "Test Zen", market: "Testland", category: "Shower cream & gel", pack: 12, price: 210 },
  { name: "Test Shower Cream 1L", variant: "Honey", brand: "Test Zen", market: "Testland", category: "Shower cream & gel", pack: 12, price: 215 },
  { name: "Test Hand Wash 500ML", variant: "Lemon", brand: "Test Zen", market: "Testland", category: "Hand wash & soap", pack: 24, price: 96 },
  { name: "Test Hand Wash 500ML", variant: "Lavender", brand: "Test King", market: "Test Mydin", category: "Hand wash & soap", pack: 24, price: 99 },
  { name: "Test Dishwash 1.5L", variant: "Lime", brand: "Test King", market: "Test Mydin", category: "Dishwash", pack: 6, price: 157.5 },
  { name: "Test Laundry Detergent 2.1L", variant: "Fresh", brand: "Test King", market: "Test Mydin", category: "Laundry detergent", pack: 6, price: 189 },
  { name: "Test Hair Care 400ML", variant: "Anti Dandruff", brand: "Test Hands", market: "Test Vietnam", category: "Hair & body care", pack: 12, price: 132 },
  { name: "Test Sanitizer 250ML", variant: "Original", brand: "Test Hands", market: "Test Vietnam", category: "Sanitizer", pack: 24, price: 84 },
  // One product with no market at all, because "no market" is a row the
  // dashboard and the catalogue both have to draw and it is easy to forget.
  { name: "Test Fragrance 100ML", variant: "Musk", brand: "Test Hands", market: null, category: "Fragrance", pack: 12, price: 145 },
] as const;

const sku = (index: number) => `TST-${String(index + 1).padStart(3, "0")}`;

/** What is in the database right now, for the card to print. */
export async function countTestData(): Promise<TestDataCounts> {
  const where = { id: { startsWith: TEST_ID_PREFIX } };
  const [buyers, products, purchaseOrders, lineItems, extractions, shopOrders] =
    await Promise.all([
      prisma.buyer.count({ where }),
      prisma.product.count({ where }),
      prisma.purchaseOrder.count({ where }),
      prisma.lineItem.count({ where }),
      prisma.extraction.count({
        where: { ...where, status: { not: ExtractionStatus.CONFIRMED } },
      }),
      prisma.webOrder.count({ where }),
    ]);
  return {
    buyers,
    products,
    purchaseOrders,
    lineItems,
    reviewQueue: extractions,
    shopOrders,
  };
}

/**
 * The buyers and products every run needs. Created once and reused, because
 * `Buyer.name` and `Product.sku` are unique — a second run must add orders,
 * not fail on a name it wrote itself.
 */
async function ensureCatalogue() {
  const existingBuyers = await prisma.buyer.findMany({
    where: { id: { startsWith: TEST_ID_PREFIX } },
    select: { id: true, paymentTerms: true },
  });
  const buyers = existingBuyers.length
    ? existingBuyers
    : await Promise.all(
        BUYERS.map((buyer) =>
          prisma.buyer.create({
            data: {
              id: testId(),
              name: buyer.name,
              paymentTerms: buyer.terms,
              contactName: "Test Contact",
              email: `${buyer.name.toLowerCase().replace(/[^a-z]+/g, "-")}@example.test`,
              remark: "Generated test data. Safe to delete.",
            },
            select: { id: true, paymentTerms: true },
          }),
        ),
      );

  const existingProducts = await prisma.product.findMany({
    where: { id: { startsWith: TEST_ID_PREFIX } },
    select: { id: true, name: true, unit: true, listPrice: true, packSize: true },
  });
  const products = existingProducts.length
    ? existingProducts
    : await Promise.all(
        PRODUCTS.map((product, index) =>
          prisma.product.create({
            data: {
              id: testId(),
              sku: sku(index),
              name: `${product.name} — ${product.variant}`,
              brand: product.brand,
              variant: product.variant,
              market: product.market,
              category: product.category,
              packSize: product.pack,
              cartonsPerPallet: 52,
              unit: "carton",
              listPrice: product.price.toFixed(2),
              description: "Generated test data. Safe to delete.",
            },
            select: { id: true, name: true, unit: true, listPrice: true, packSize: true },
          }),
        ),
      );

  // The pickers read CatalogLabel, so a product carrying a brand its own
  // picker does not offer is a catalogue that looks broken. Tagged and
  // deleted with everything else.
  if (!existingProducts.length) {
    const labels = [
      ...new Set(PRODUCTS.map((p) => p.brand)).values(),
    ].map((value) => ({ id: testId(), kind: CatalogLabelKind.BRAND, value }));
    const variants = [...new Set(PRODUCTS.map((p) => p.variant)).values()].map(
      (value) => ({ id: testId(), kind: CatalogLabelKind.VARIANT, value }),
    );
    const markets = [
      ...new Set(PRODUCTS.map((p) => p.market).filter(Boolean)).values(),
    ].map((value) => ({
      id: testId(),
      kind: CatalogLabelKind.MARKET,
      value: value as string,
    }));
    await prisma.catalogLabel.createMany({
      data: [...labels, ...variants, ...markets],
      skipDuplicates: true,
    });
  }

  // A shop order needs somebody to have placed it. One client is enough, and
  // it carries no password, so it cannot be signed in as.
  const client =
    (await prisma.user.findFirst({
      where: { id: { startsWith: TEST_ID_PREFIX }, role: Role.CLIENT },
      select: { id: true },
    })) ??
    (await prisma.user.create({
      data: {
        id: testId(),
        email: `test-contact-${Date.now().toString(36)}@example.test`,
        name: "Test Shop Contact",
        role: Role.CLIENT,
        buyerId: buyers[0].id,
      },
      select: { id: true },
    }));

  return { buyers, products, client };
}

/**
 * Writes `orders` confirmed purchase orders, plus — on the first run only —
 * the buyers and products behind them, a review queue and two shop orders.
 *
 * Orders are written one at a time rather than in a `createMany` batch: a run
 * is at most a couple of hundred rows on a screen somebody is watching, and
 * one order failing should not take the rest with it.
 */
export async function generateTestData(actorId: string, orders: number) {
  const { buyers, products, client } = await ensureCatalogue();
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);

  for (let i = 0; i < orders; i++) {
    const buyer = pick(buyers);
    const ageDays = rand(0, 89);
    const poDate = utcDay(daysAgo(ageDays));
    const stage = stageForAge(ageDays);
    const deliveryDate = utcDay(poDate);
    deliveryDate.setUTCDate(deliveryDate.getUTCDate() + rand(12, 28));

    const chosen = new Set<number>();
    while (chosen.size < Math.min(rand(2, 5), products.length)) {
      chosen.add(rand(0, products.length - 1));
    }

    const lines = [...chosen].map((index, position) => {
      const product = products[index];
      const unitPrice = Number(product.listPrice);
      const quantity = rand(5, 400);
      return {
        id: testId(),
        position: position + 1,
        description: product.name,
        productId: product.id,
        quantity: quantity.toFixed(3),
        unit: product.unit,
        unitPrice: unitPrice.toFixed(4),
        amount: round2(quantity * unitPrice).toFixed(2),
      };
    });

    const subtotal = round2(
      lines.reduce((sum, line) => sum + Number(line.amount), 0),
    ).toFixed(2);

    const documentId = testId();
    const orderId = testId();

    // Stage history walked forward, so the activity feed and the stepper have
    // something to show rather than one row.
    const reached = STAGES.slice(0, STAGES.indexOf(stage) + 1);
    const events = reached.map((toStage, index) => {
      const at = new Date(poDate);
      at.setUTCDate(
        at.getUTCDate() +
          Math.round((rand(12, 26) * index) / Math.max(1, reached.length - 1)),
      );
      const now = new Date();
      return {
        id: testId(),
        kind: PoEventKind.STAGE,
        fromStage: index === 0 ? null : reached[index - 1],
        toStage,
        changedById: index === 0 ? null : actorId,
        changedAt: at > now ? now : at,
      };
    });

    await prisma.document.create({
      data: {
        id: documentId,
        r2Key: `test/${documentId}.pdf`,
        originalName: `TEST-${stamp}-${i + 1}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: rand(200_000, 2_000_000),
        pageCount: rand(1, 3),
        uploadedById: actorId,
        uploadedAt: poDate,
        extraction: {
          create: {
            id: testId(),
            status: ExtractionStatus.CONFIRMED,
            confidence: rand(82, 99),
            model: "test-data",
            startedAt: poDate,
            finishedAt: poDate,
          },
        },
      },
    });

    await prisma.purchaseOrder.create({
      data: {
        id: orderId,
        poNumber: `TEST-${stamp}-${String(i + 1).padStart(4, "0")}`,
        buyerId: buyer.id,
        poDate,
        deliveryDate,
        paymentTerms: buyer.paymentTerms,
        subtotal,
        tax: "0.00",
        total: subtotal,
        documentId,
        confirmedById: actorId,
        confirmedAt: poDate,
        stage,
        stageChangedAt: events[events.length - 1].changedAt,
        lineItems: { create: lines },
        stageEvents: { create: events },
      },
    });
  }

  // The review queue and the shop orders are the state of the portal rather
  // than a quantity, so they are written once and not multiplied by `orders`.
  const queued = await prisma.extraction.count({
    where: { id: { startsWith: TEST_ID_PREFIX }, status: { not: ExtractionStatus.CONFIRMED } },
  });
  if (queued === 0) await generateReviewQueue(actorId);

  const shopOrders = await prisma.webOrder.count({
    where: { id: { startsWith: TEST_ID_PREFIX } },
  });
  if (shopOrders === 0) await generateShopOrders(client.id, buyers[0].id, products);

  return countTestData();
}

/** Three uploads waiting on somebody: one read, one still reading, one failed. */
async function generateReviewQueue(actorId: string) {
  const states = [
    { status: ExtractionStatus.SUCCEEDED, error: null },
    { status: ExtractionStatus.RUNNING, error: null },
    {
      status: ExtractionStatus.FAILED,
      error: "Could not read page 2: the scan is too dark to extract line items.",
    },
  ] as const;

  for (const state of states) {
    const documentId = testId();
    const uploadedAt = daysAgo(0);
    uploadedAt.setHours(uploadedAt.getHours() - rand(1, 40));
    await prisma.document.create({
      data: {
        id: documentId,
        r2Key: `test/${documentId}.pdf`,
        originalName: `test-scan-${documentId.slice(-6)}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: rand(200_000, 2_000_000),
        pageCount: rand(1, 3),
        uploadedById: actorId,
        uploadedAt,
        extraction: {
          create: {
            id: testId(),
            status: state.status,
            error: state.error,
            confidence:
              state.status === ExtractionStatus.SUCCEEDED ? rand(70, 95) : null,
            model: "test-data",
            startedAt: uploadedAt,
            finishedAt:
              state.status === ExtractionStatus.RUNNING ? null : uploadedAt,
          },
        },
      },
    });
  }
}

/** Two orders sent from the shop and not yet confirmed, so the queue has both kinds. */
async function generateShopOrders(
  placedById: string,
  buyerId: string,
  products: { id: string; listPrice: unknown; packSize: number | null }[],
) {
  for (const status of [WebOrderStatus.SUBMITTED, WebOrderStatus.RECEIVED]) {
    const submittedAt = daysAgo(rand(0, 4));
    const chosen = products.slice(0, rand(1, Math.min(3, products.length)));
    const lines = chosen.map((product) => {
      const cartons = rand(2, 40);
      const unitPrice = Number(product.listPrice);
      return {
        id: testId(),
        productId: product.id,
        cartons,
        packSize: product.packSize,
        unit: "carton",
        unitPrice: unitPrice.toFixed(4),
        amount: round2(cartons * unitPrice).toFixed(2),
      };
    });
    const subtotal = round2(
      lines.reduce((sum, line) => sum + Number(line.amount), 0),
    ).toFixed(2);

    // `reference` is derived from the serial, so it takes a second write —
    // the same two steps `src/actions/cart.ts` makes for a real order.
    const created = await prisma.webOrder.create({
      data: {
        id: testId(),
        reference: "",
        buyerId,
        placedById,
        status,
        buyerReference: `TEST-BUYER-PO-${rand(100, 999)}`,
        subtotal,
        submittedAt,
        receivedAt: status === WebOrderStatus.RECEIVED ? submittedAt : null,
        notes: "Generated test data. Safe to delete.",
        lines: { create: lines },
      },
      select: { id: true, seq: true },
    });
    await prisma.webOrder.update({
      where: { id: created.id },
      data: { reference: webOrderReference(created.seq, submittedAt) },
    });
  }
}

/**
 * Removes every tagged row, and refuses if a real one depends on one — a
 * purchase order somebody confirmed must never be deleted because a test
 * product happens to sit on a line of it. `replaceDemo` makes the same check
 * for the same reason.
 */
export async function deleteTestData(): Promise<TestDataCounts> {
  const startsWith = TEST_ID_PREFIX;

  const [realOrders, realShopOrders] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        id: { not: { startsWith } },
        OR: [
          { buyerId: { startsWith } },
          { lineItems: { some: { productId: { startsWith } } } },
        ],
      },
      select: { poNumber: true },
      take: 5,
    }),
    // A test product is active, so it is on the shop and a real buyer can put
    // one in a cart. `WebOrderLine.productId` is a required FK, so that would
    // fail the delete with a raw Prisma error instead of this sentence.
    prisma.webOrder.findMany({
      where: {
        id: { not: { startsWith } },
        OR: [
          { buyerId: { startsWith } },
          { lines: { some: { productId: { startsWith } } } },
        ],
      },
      select: { reference: true },
      take: 5,
    }),
  ]);

  const blockers = [
    ...realOrders.map((order) => order.poNumber ?? "no PO number"),
    ...realShopOrders.map((order) => order.reference || "no reference"),
  ];
  if (blockers.length > 0) {
    throw new Error(
      `Refusing: real orders reference test data (${blockers.join(", ")}). ` +
        "Sort those out first.",
    );
  }

  const before = await countTestData();

  // Line items, stage events and web order lines cascade from their parents.
  // A purchase order holds its document, so the order goes first — the
  // Document FK is RESTRICT on this database (drift carried since Phase 16).
  await prisma.webOrder.deleteMany({ where: { id: { startsWith } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { startsWith } } });
  await prisma.document.deleteMany({ where: { id: { startsWith } } });
  await prisma.product.deleteMany({ where: { id: { startsWith } } });
  await prisma.catalogLabel.deleteMany({ where: { id: { startsWith } } });
  await prisma.user.deleteMany({ where: { id: { startsWith } } });
  await prisma.buyer.deleteMany({ where: { id: { startsWith } } });

  return before;
}
