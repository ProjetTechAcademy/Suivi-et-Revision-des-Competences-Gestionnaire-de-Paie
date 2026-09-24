export async function extractTextFromFile(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { CanvasFactory } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");

    const data = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data, CanvasFactory });

    try {
      const result = await parser.getText();
      return result.text?.trim() || "";
    } finally {
      await parser.destroy();
    }
  }

  if (
    file.type.startsWith("text/") ||
    /\.(txt|md|csv|json|xml|html|htm|webloc)$/i.test(file.name)
  ) {
    return (await file.text()).trim();
  }

  return "";
}
