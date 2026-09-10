import { defineConfig } from "vite";

// Duas páginas servidas pelo mesmo ambiente:
//   index.html -> capturador (POC 0A)
//   alvo.html  -> página alvo cooperante (spike POC 0B)
// Caminhos absolutos derivados de import.meta.url (ambiente Linux).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        capturador: new URL("./index.html", import.meta.url).pathname,
        alvo: new URL("./alvo.html", import.meta.url).pathname,
      },
    },
  },
});
