/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Season Crafter reverse search reads the compiled Lahman history at
  // runtime via a dynamic path (src/lib/historicaldata.ts).  Next's file
  // tracing can't follow that, so without this the JSON is omitted from the
  // serverless bundle and the route silently degrades to the sparse MLB API
  // fallback (modern benchmarks vs. historical seasons → skewed tiers).
  outputFileTracingIncludes: {
    "/api/seasoncrafter/reverse": [
      "./src/data/hist_hit.json",
      "./src/data/hist_pit.json",
    ],
  },
};

export default nextConfig;
