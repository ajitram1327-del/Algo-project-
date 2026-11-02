import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UnStranded EV Navigation & Physics Intelligence",
    short_name: "UnStranded",
    description: "Physics-calibrated EV range planning, corridor routing, and charging reliability platform",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#1e293b",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
