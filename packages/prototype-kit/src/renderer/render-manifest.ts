import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { PrototypeManifest, ManifestPage } from "./types";

/**
 * generates a next.js app directory structure from a prototype manifest.
 * each page becomes a route in the app directory.
 * mock endpoints become api route handlers.
 *
 * output structure:
 *   outputDir/
 *     app/
 *       layout.tsx
 *       page.tsx              (for route "/")
 *       jobs/page.tsx         (for route "/jobs")
 *       invoices/page.tsx     (for route "/invoices")
 *       api/jobs/route.ts     (for mock endpoint "/api/jobs")
 *     manifest.json           (copy of the manifest for reference)
 *     package.json
 *     next.config.ts
 *     tailwind.config.ts
 */
export async function renderManifest(
  manifest: PrototypeManifest,
  outputDir: string
): Promise<{ pageCount: number; endpointCount: number }> {
  // create directory structure
  await mkdir(join(outputDir, "app"), { recursive: true });

  // write manifest copy
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // write package.json
  await writeFile(
    join(outputDir, "package.json"),
    JSON.stringify(
      {
        name: "slushie-prototype",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          export: "next build",
        },
        dependencies: {
          next: "^15",
          react: "^19",
          "react-dom": "^19",
          "@slushie/prototype-kit": "*",
        },
        devDependencies: {
          typescript: "^5",
          "@types/react": "^19",
          tailwindcss: "^4",
        },
      },
      null,
      2
    )
  );

  // write next.config.ts
  await writeFile(
    join(outputDir, "next.config.ts"),
    `import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default config;
`
  );

  // write tailwind.config.ts
  await writeFile(
    join(outputDir, "tailwind.config.ts"),
    `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/prototype-kit/src/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
`
  );

  // write root layout
  await writeFile(
    join(outputDir, "app", "layout.tsx"),
    `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slushie prototype",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900" style={{ textTransform: "lowercase" }}>
        {children}
      </body>
    </html>
  );
}
`
  );

  // write globals.css
  await writeFile(
    join(outputDir, "app", "globals.css"),
    `@import "tailwindcss";
`
  );

  // generate pages
  for (const page of manifest.pages) {
    await generatePage(outputDir, page, manifest);
  }

  // generate mock api endpoints
  for (const endpoint of manifest.mockEndpoints) {
    await generateMockEndpoint(outputDir, endpoint);
  }

  return {
    pageCount: manifest.pages.length,
    endpointCount: manifest.mockEndpoints.length,
  };
}

async function generatePage(
  outputDir: string,
  page: ManifestPage,
  manifest: PrototypeManifest
): Promise<void> {
  const route = page.route === "/" ? "" : page.route.replace(/^\//, "");
  const pageDir = join(outputDir, "app", route);
  await mkdir(pageDir, { recursive: true });

  const pageContent = `"use client";

import { RenderPage } from "@slushie/prototype-kit/renderer/render-page";

const page = ${JSON.stringify(page, null, 2)};

const walkthroughSteps = ${JSON.stringify(
    manifest.walkthrough.filter((s) => s.targetPage === page.route),
    null,
    2
  )};

const allPages = ${JSON.stringify(
    manifest.pages.map((p) => ({ route: p.route, title: p.title })),
    null,
    2
  )};

export default function Page() {
  return <RenderPage page={page} walkthroughSteps={walkthroughSteps} allPages={allPages} />;
}
`;

  await writeFile(join(pageDir, "page.tsx"), pageContent);
}

async function generateMockEndpoint(
  outputDir: string,
  endpoint: { path: string; method: string; responseData: Record<string, unknown>; delayMs: number }
): Promise<void> {
  const routePath = endpoint.path.replace(/^\//, "");
  const routeDir = join(outputDir, "app", routePath);
  await mkdir(routeDir, { recursive: true });

  const method = endpoint.method.toUpperCase();
  const handler = `export async function ${method}() {
  await new Promise((r) => setTimeout(r, ${endpoint.delayMs}));
  return Response.json(${JSON.stringify(endpoint.responseData, null, 2)});
}
`;

  await writeFile(join(routeDir, "route.ts"), handler);
}
