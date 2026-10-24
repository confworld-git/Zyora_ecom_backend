import express from "express";
import Product from "../schemas/Product.js";

const router = express.Router();

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

const createProductSlug = (product) =>
  (product.name || product.title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

router.get("/", async (req, res) => {
  try {
    const products = await Product.find({}, "id name title updatedAt").lean();

    const frontendUrl = getFrontendUrl();

    const staticPaths = [
      "/",
      "/About_Us",
      "/Contact_Us",
      "/Zyora_Category",
      "/Jewellery",
    ];

    const urls = staticPaths.map((path) => ({
      loc: `${frontendUrl}${path}`,
    }));

    products.forEach((product) => {
      const slug = createProductSlug(product);

      if (product.id && slug) {
        urls.push({
          loc: `${frontendUrl}/Zyora_Category/product/${encodeURIComponent(
            product.id,
          )}/${encodeURIComponent(slug)}`,
          lastmod: product.updatedAt,
        });
      }
    });

    const entries = urls
      .map(
        ({ loc, lastmod }) =>
          `  <url>\n    <loc>${escapeXml(loc)}</loc>${
            lastmod
              ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>`
              : ""
          }\n  </url>`,
      )
      .join("\n");

    res
      .type("application/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `${entries}\n` +
          `</urlset>`,
      );
  } catch (error) {
    console.error("Sitemap generation error:", error);
    res.status(500).send("Unable to generate sitemap");
  }
});

export default router;
