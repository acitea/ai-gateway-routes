import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ai-gateway-routes",
  description: "YAML tooling for Cloudflare AI Gateway dynamic routes.",
  base: "/ai-gateway-routes/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: undefined,
    nav: [
      { text: "Guide", link: "/guide/" },
      { text: "Examples", link: "/examples/" },
      { text: "Reference", link: "/reference/commands" },
      { text: "GitHub", link: "https://github.com/acitea/ai-gateway-routes" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Motivation", link: "/guide/" },
          { text: "Install and usage", link: "/guide/install" },
          { text: "Deploy", link: "/guide/deploy" },
          { text: "Terraform", link: "/guide/terraform" },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Manifest styles", link: "/examples/" },
          { text: "Semantic routing", link: "/examples/semantic-routing" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Commands", link: "/reference/commands" },
          { text: "Route files", link: "/reference/route-files" },
          { text: "TypeScript API", link: "/reference/typescript" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/acitea/ai-gateway-routes" }],
    search: {
      provider: "local",
    },
    editLink: {
      pattern: "https://github.com/acitea/ai-gateway-routes/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message:
        "This project is not affiliated with or endorsed by Cloudflare, Inc. Cloudflare and Cloudflare AI Gateway are trademarks and/or registered trademarks of Cloudflare, Inc.",
      copyright: "Released under the MIT License.",
    },
  },
});
