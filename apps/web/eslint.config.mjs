import nextPlugin from "@next/eslint-plugin-next";
import base from "@passoguia/configuracao-eslint";

export default [
  ...base,
  nextPlugin.flatConfig.coreWebVitals,
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
];
