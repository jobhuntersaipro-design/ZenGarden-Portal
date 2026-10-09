import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export * from "@/lib/extraction/model-options";

const KEY = "extractionModel";

/** The model chosen in Settings, or `EXTRACTION_MODEL` until someone chooses. */
export async function extractionModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return row?.value ?? env.EXTRACTION_MODEL;
}

export async function saveExtractionModel(id: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: id },
    update: { value: id },
  });
}
