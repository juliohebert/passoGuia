import base from "@passoguia/configuracao-eslint";

export default [
  ...base,
  { ignores: ["dist/**"] },
  {
    // scripts/ roda em Node (fora do runtime da extensão) — precisa dos globais do Node.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
];
