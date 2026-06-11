import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (dot-path: bypasses the locale/Clerk
// middleware). Installing from any worker page lands the app on /worker,
// which the middleware locale-prefixes and auth-gates as usual.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Staffig",
    short_name: "Staffig",
    description: "Staffig — bilingual substitute dispatch",
    start_url: "/worker",
    scope: "/",
    display: "standalone",
    background_color: "#F6F4EE",
    theme_color: "#F6F4EE",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
