// Pré-checagem de `npm start`: falha de forma clara se uma porta do PassoGuia
// já estiver em uso, em vez de deixar cada ferramenta subir uma instância
// concorrente (Next.js, por exemplo, tentaria a próxima porta livre em silêncio).
import { createServer } from "node:net";

const SERVICOS = [
  { porta: 3000, nome: "apps/web (Next.js)" },
  { porta: 3333, nome: "apps/api (NestJS)" },
];

function portaLivre(porta) {
  return new Promise((resolve) => {
    const servidor = createServer();
    servidor.once("error", () => {
      resolve(false);
    });
    servidor.once("listening", () => {
      servidor.close(() => {
        resolve(true);
      });
    });
    servidor.listen(porta, "0.0.0.0");
  });
}

const ocupadas = [];
for (const servico of SERVICOS) {
  // eslint-disable-next-line no-await-in-loop -- checagem sequencial e curta, não há ganho em paralelizar aqui
  const livre = await portaLivre(servico.porta);
  if (!livre) {
    ocupadas.push(servico);
  }
}

if (ocupadas.length > 0) {
  console.error("\n✖ npm start abortado: porta(s) já em uso.\n");
  for (const servico of ocupadas) {
    console.error(`  - porta ${String(servico.porta)} (${servico.nome}) já está ocupada.`);
  }
  console.error(
    "\nEncerre o processo que já está usando essa porta (ou a instância anterior do " +
      "PassoGuia) antes de rodar `npm start` novamente.\n",
  );
  process.exit(1);
}

console.log("✓ portas 3000 e 3333 livres — iniciando web, api e extensao-gravador…");
