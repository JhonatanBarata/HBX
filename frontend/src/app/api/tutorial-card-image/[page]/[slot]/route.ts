import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    page: string;
    slot: string;
  }>;
};

function parseIndex(value: string, max: number) {
  const index = Number.parseInt(value, 10);
  return Number.isInteger(index) && index >= 1 && index <= max ? index : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { page, slot } = await context.params;
  const pageIndex = parseIndex(page, 6);
  const slotIndex = parseIndex(slot, 6);

  if (!pageIndex || !slotIndex) {
    return new NextResponse(null, { status: 404 });
  }

  const imagePaths = [
    path.join(process.cwd(), "cards", "Tutorial", `pagina${pageIndex}`, `${slotIndex}.png`),
    path.join(process.cwd(), "Tutorial", `pagina${pageIndex}`, `${slotIndex}.png`),
  ];

  for (const imagePath of imagePaths) {
    try {
      const image = await readFile(imagePath);
      return new NextResponse(new Uint8Array(image), {
        headers: {
          "cache-control": "public, max-age=86400",
          "content-type": "image/png",
        },
      });
    } catch {
      continue;
    }
  }

  return new NextResponse(null, { status: 404 });
}
