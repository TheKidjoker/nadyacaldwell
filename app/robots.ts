import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://nadyacaldwell.com/sitemap.xml",
    host: "https://nadyacaldwell.com",
  };
}
